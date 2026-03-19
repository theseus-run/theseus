/**
 * CopilotProvider — Effect service for GitHub Copilot LLM access.
 *
 * Auth flow:
 *   1. Read oauth_token from ~/.config/github-copilot/apps.json
 *   2. Exchange → GET https://api.github.com/copilot_internal/v2/token
 *      returns { token: <bearer>, expires_at: <unix_seconds> }
 *   3. POST to the appropriate endpoint based on the model:
 *      - Most models  → /chat/completions  (OpenAI-compat)
 *      - gpt-5+ (non-mini) → /responses   (OpenAI Responses API)
 *
 * Bearer tokens are cached and refreshed when within 60 s of expiry.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BunHttpClient } from "@effect/platform-bun";
import { Effect, Layer, Ref, ServiceMap } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { Config } from "../config.ts";
import { CopilotTokenError, LLMHttpError, LLMParseError } from "../errors.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  // Present when role === "assistant" and the model called tools
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string;
    readonly type: "function";
    readonly function: { readonly name: string; readonly arguments: string };
  }>;
  // Present when role === "tool"
  readonly tool_call_id?: string;
}

// OpenAI tool definition shape (passed verbatim to the API)
export interface ToolDefinition {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: {
      readonly type: "object";
      readonly properties: Record<string, unknown>;
      readonly required: ReadonlyArray<string>;
    };
  };
}

export interface LLMToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string; // raw JSON string from model
}

export interface ChatResponse {
  readonly content: string;
  readonly model: string;
  readonly finishReason: "stop" | "tool_calls" | string;
  readonly toolCalls: ReadonlyArray<LLMToolCall>;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}

// ---------------------------------------------------------------------------
// Internal token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  readonly bearer: string;
  readonly expiresAt: number; // unix seconds
}

// ---------------------------------------------------------------------------
// Endpoint routing
//
// gpt-5 and above only support the /responses endpoint (OpenAI Responses API).
// Everything else (gpt-4o, claude-*, gemini-*, etc.) uses /chat/completions.
// Rule mirrors OpenCode: major version >= 5, excluding gpt-5-mini variants.
// ---------------------------------------------------------------------------

function shouldUseResponsesApi(modelId: string): boolean {
  const match = /^gpt-(\d+)/.exec(modelId);
  if (!match) return false;
  return Number(match[1]) >= 5 && !modelId.startsWith("gpt-5-mini");
}

// Translate our ChatMessage[] (chat-completions format) to /responses input[].
// Tool messages and assistant tool-call messages need structural conversion.
function toResponsesInput(messages: ReadonlyArray<ChatMessage>): unknown[] {
  const result: unknown[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") {
      // Tool result: { type: "function_call_output", call_id, output }
      result.push({
        type: "function_call_output",
        call_id: msg.tool_call_id,
        output: msg.content,
      });
    } else if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      // Assistant message with tool calls: emit text content (if any), then
      // each tool call as a separate function_call item
      if (msg.content) {
        result.push({ role: "assistant", content: msg.content });
      }
      for (const tc of msg.tool_calls) {
        result.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        });
      }
    } else {
      // system / user / plain assistant messages pass through unchanged
      result.push({ role: msg.role, content: msg.content });
    }
  }
  return result;
}

// Tool definitions are flat in /responses vs nested under "function" in /chat/completions.
function toResponsesTools(tools: ReadonlyArray<ToolDefinition>): unknown[] {
  return tools.map((t) => ({
    type: "function",
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

// Parse the /responses API response shape into our unified ChatResponse.
// biome-ignore lint/suspicious/noExplicitAny: untyped JSON from external Copilot API
function parseResponsesOutput(data: any, model: string): ChatResponse {
  const output: Array<{ type: string; [key: string]: unknown }> = data?.output ?? [];
  const usage = data?.usage ?? {};
  const toolCalls: LLMToolCall[] = [];
  let content = "";

  for (const item of output) {
    if (item.type === "function_call") {
      toolCalls.push({
        id: (item["call_id"] as string) || (item["id"] as string) || "",
        name: item["name"] as string,
        arguments: item["arguments"] as string,
      });
    } else if (item.type === "message") {
      const parts = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
      for (const part of parts) {
        if (part.type === "output_text" && part.text) content += part.text;
      }
    }
  }

  return {
    content,
    model: (data?.model as string | undefined) ?? model,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    toolCalls,
    usage: {
      promptTokens: (usage.input_tokens as number | undefined) ?? 0,
      completionTokens: (usage.output_tokens as number | undefined) ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers — read local Copilot credential file (synchronous, one-off)
// ---------------------------------------------------------------------------

const readOauthToken: Effect.Effect<string, CopilotTokenError> = Effect.try({
  try: () => {
    const path = join(homedir(), ".config", "github-copilot", "apps.json");
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, { oauth_token?: string }>;
    // Key is "github.com" in the standard install
    const entry = parsed["github.com"] ?? Object.values(parsed)[0];
    if (!entry?.oauth_token) {
      throw new Error("oauth_token not found in apps.json");
    }
    return entry.oauth_token;
  },
  catch: (e) => new CopilotTokenError({ cause: e }),
});

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export class CopilotProvider extends ServiceMap.Service<
  CopilotProvider,
  {
    /**
     * Send a chat completion request to GitHub Copilot.
     * Pass `tools` to enable tool calling — the response may have finishReason
     * "tool_calls" with a populated `toolCalls` array instead of content.
     */
    readonly chat: (
      messages: ReadonlyArray<ChatMessage>,
      options?: { model?: string; tools?: ReadonlyArray<ToolDefinition> },
    ) => Effect.Effect<ChatResponse, CopilotTokenError | LLMHttpError | LLMParseError>;
  }
>()("CopilotProvider") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const CopilotProviderLive = Layer.effect(CopilotProvider)(
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;

    // Token cache — shared across concurrent callers
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null);

    /** Exchange an oauth_token for a short-lived Copilot bearer. */
    const exchangeToken = (
      oauthToken: string,
    ): Effect.Effect<TokenCache, CopilotTokenError | LLMParseError> =>
      Effect.gen(function* () {
        const req = HttpClientRequest.get("https://api.github.com/copilot_internal/v2/token").pipe(
          HttpClientRequest.setHeaders({
            Authorization: `Token ${oauthToken}`,
            "User-Agent": "theseus-runtime/0.0.1",
            Accept: "application/json",
          }),
        );
        const res = yield* httpClient
          .execute(req)
          .pipe(Effect.mapError((e) => new CopilotTokenError({ cause: e })));
        const bodyRaw = yield* res.json.pipe(
          Effect.mapError((e) => new LLMParseError({ cause: e })),
        );
        // biome-ignore lint/suspicious/noExplicitAny: untyped JSON from Copilot token endpoint
        const body = bodyRaw as any;
        if (!body?.token) {
          return yield* Effect.fail(
            new CopilotTokenError({
              cause: new Error(`Unexpected token exchange response: ${JSON.stringify(body)}`),
            }),
          );
        }
        return { bearer: body.token as string, expiresAt: body.expires_at as number };
      });

    /** Return a valid bearer, re-exchanging if expired or within 60 s of expiry. */
    const getBearer = (): Effect.Effect<string, CopilotTokenError | LLMParseError> =>
      Effect.gen(function* () {
        const now = Math.floor(Date.now() / 1000);
        const cached = yield* Ref.get(tokenCacheRef);
        if (cached !== null && cached.expiresAt - now > 60) {
          return cached.bearer;
        }
        const oauthToken = yield* readOauthToken;
        const fresh = yield* exchangeToken(oauthToken);
        yield* Ref.set(tokenCacheRef, fresh);
        return fresh.bearer;
      });

    return CopilotProvider.of({
      chat: (messages, options = {}) =>
        Effect.gen(function* () {
          const { model = Config.model, tools } = options;
          const bearer = yield* getBearer();
          const useResponses = shouldUseResponsesApi(model);

          const copilotHeaders = {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "Editor-Version": "theseus-runtime/0.0.1",
            "Editor-Plugin-Version": "theseus-runtime/0.0.1",
            "Copilot-Integration-Id": "vscode-chat",
            Accept: "application/json",
          };

          let reqBody: Record<string, unknown>;
          let endpoint: string;

          if (useResponses) {
            // OpenAI Responses API — used by gpt-5+ models
            endpoint = "https://api.githubcopilot.com/responses";
            reqBody = {
              model,
              input: toResponsesInput(messages),
              max_output_tokens: Config.maxTokens,
              stream: false,
            };
            if (tools && tools.length > 0) reqBody["tools"] = toResponsesTools(tools);
          } else {
            // Standard OpenAI Chat Completions API
            endpoint = "https://api.githubcopilot.com/chat/completions";
            reqBody = {
              model,
              messages: messages as Array<{ role: string; content: string }>,
              max_tokens: Config.maxTokens,
              stream: false,
            };
            if (tools && tools.length > 0) reqBody["tools"] = tools;
          }

          const req = HttpClientRequest.post(endpoint).pipe(
            HttpClientRequest.setHeaders(copilotHeaders),
            HttpClientRequest.bodyJsonUnsafe(reqBody),
          );

          const res = yield* httpClient
            .execute(req)
            .pipe(Effect.mapError((e) => new LLMHttpError({ status: 0, body: String(e) })));

          if (res.status !== 200) {
            const errText = yield* res.text.pipe(
              Effect.mapError((e) => new LLMParseError({ cause: e })),
            );
            return yield* Effect.fail(new LLMHttpError({ status: res.status, body: errText }));
          }

          const dataRaw = yield* res.json.pipe(
            Effect.mapError((e) => new LLMParseError({ cause: e })),
          );
          // biome-ignore lint/suspicious/noExplicitAny: untyped JSON from Copilot LLM API
          const data = dataRaw as any;

          if (useResponses) {
            return parseResponsesOutput(data, model);
          }

          // /chat/completions parse path
          const choice = data?.choices?.[0];
          const message = choice?.message ?? {};
          const finishReason: string = choice?.finish_reason ?? "stop";
          const usage = data?.usage ?? {};

          const toolCalls: ReadonlyArray<LLMToolCall> =
            (
              message.tool_calls as
                | Array<{ id: string; function: { name: string; arguments: string } }>
                | undefined
            )?.map((tc) => ({
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })) ?? [];

          return {
            content: (message.content as string | null) ?? "",
            model: (data?.model as string | undefined) ?? model,
            finishReason,
            toolCalls,
            usage: {
              promptTokens: (usage.prompt_tokens as number | undefined) ?? 0,
              completionTokens: (usage.completion_tokens as number | undefined) ?? 0,
            },
          } satisfies ChatResponse;
        }),
    });
  }),
).pipe(Layer.provide(BunHttpClient.layer));
