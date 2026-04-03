/**
 * CopilotProvider — LLMProvider backed by GitHub Copilot.
 *
 * Auth flow:
 *   1. Read oauth_token from ~/.config/github-copilot/apps.json
 *   2. Exchange → GET https://api.github.com/copilot_internal/v2/token
 *      Response: { token: <bearer>, expires_at: <unix_seconds> }
 *   3. POST to endpoint routed by model:
 *      - gpt-5+ (non-mini) → /responses   (OpenAI Responses API)
 *      - everything else   → /chat/completions
 *
 * Bearer tokens are cached in a Ref and refreshed when within 60s of expiry.
 * Errors are mapped to LLMError (permanent) or LLMErrorRetriable (transient).
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BunHttpClient } from "@effect/platform-bun";
import { Data, Effect, Layer, Ref } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { Config } from "../config.ts";
import {
  type LLMCallOptions,
  LLMError,
  LLMErrorRetriable,
  type LLMMessage,
  LLMProvider,
  type LLMResponse,
  type LLMToolCall,
  type LLMToolDef,
} from "../primitives/llm/provider.ts";

// ---------------------------------------------------------------------------
// Internal errors — private to this module, mapped to LLMError* at the boundary
// ---------------------------------------------------------------------------

class CopilotAuthError extends Data.TaggedError("CopilotAuthError")<{
  readonly cause?: unknown;
}> {}

class CopilotHttpError extends Data.TaggedError("CopilotHttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

class CopilotParseError extends Data.TaggedError("CopilotParseError")<{
  readonly cause?: unknown;
}> {}

type CopilotError = CopilotAuthError | CopilotHttpError | CopilotParseError;

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  readonly bearer: string;
  readonly expiresAt: number; // unix seconds
}

// ---------------------------------------------------------------------------
// Endpoint routing
//
// gpt-5 and above (non-mini) use the /responses endpoint (OpenAI Responses API).
// All others use /chat/completions.
// ---------------------------------------------------------------------------

const shouldUseResponsesApi = (model: string): boolean => {
  const match = /^gpt-(\d+)/.exec(model);
  if (!match) return false;
  return Number(match[1]) >= 5 && !model.startsWith("gpt-5-mini");
};

// ---------------------------------------------------------------------------
// Format converters: LLMMessage → wire format
// ---------------------------------------------------------------------------

/** LLMMessage[] → OpenAI /chat/completions messages array */
const toChatCompletionsMessages = (
  messages: ReadonlyArray<LLMMessage>,
): unknown[] =>
  messages.map((msg) => {
    if (msg.role === "tool") {
      return { role: "tool", tool_call_id: msg.toolCallId, content: msg.content };
    }
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return { role: msg.role, content: msg.content };
  });

/** LLMMessage[] → OpenAI /responses input array */
const toResponsesInput = (messages: ReadonlyArray<LLMMessage>): unknown[] => {
  const result: unknown[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") {
      result.push({
        type: "function_call_output",
        call_id: msg.toolCallId,
        output: msg.content,
      });
    } else if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      if (msg.content) result.push({ role: "assistant", content: msg.content });
      for (const tc of msg.toolCalls) {
        result.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        });
      }
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }
  return result;
};

/** LLMToolDef[] → OpenAI /chat/completions tools array */
const toChatCompletionsTools = (tools: ReadonlyArray<LLMToolDef>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

/** LLMToolDef[] → OpenAI /responses tools array (flat) */
const toResponsesTools = (tools: ReadonlyArray<LLMToolDef>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));

// ---------------------------------------------------------------------------
// Response parsers: wire format → LLMResponse
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: external JSON
const parseChatCompletionsResponse = (data: any, _model: string): LLMResponse => {
  const choice = data?.choices?.[0];
  const message = choice?.message ?? {};
  const finishReason: string = choice?.finish_reason ?? "stop";
  const rawUsage = data?.usage ?? {};
  const usage = {
    inputTokens: (rawUsage.prompt_tokens as number | undefined) ?? 0,
    outputTokens: (rawUsage.completion_tokens as number | undefined) ?? 0,
  };

  if (finishReason === "tool_calls") {
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
    return { type: "tool_calls", toolCalls, usage };
  }

  return { type: "text", content: (message.content as string | null) ?? "", usage };
};

// biome-ignore lint/suspicious/noExplicitAny: external JSON
const parseResponsesResponse = (data: any, _model: string): LLMResponse => {
  const output: Array<{ type: string; [key: string]: unknown }> = data?.output ?? [];
  const rawUsage = data?.usage ?? {};
  const usage = {
    inputTokens: (rawUsage.input_tokens as number | undefined) ?? 0,
    outputTokens: (rawUsage.output_tokens as number | undefined) ?? 0,
  };
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

  if (toolCalls.length > 0) return { type: "tool_calls", toolCalls, usage };
  return { type: "text", content, usage };
};

// ---------------------------------------------------------------------------
// Error mapping — internal → LLMError | LLMErrorRetriable
// ---------------------------------------------------------------------------

const mapError = (e: CopilotError): LLMError | LLMErrorRetriable => {
  if (e._tag === "CopilotAuthError") {
    return new LLMError({ message: "Copilot auth failed", cause: e.cause });
  }
  if (e._tag === "CopilotParseError") {
    return new LLMError({ message: "Failed to parse LLM response", cause: e.cause });
  }
  // CopilotHttpError — rate limit and server errors are retriable
  if (e.status === 429 || e.status >= 500) {
    return new LLMErrorRetriable({
      message: `Copilot HTTP ${e.status}`,
      cause: e.body,
    });
  }
  return new LLMError({ message: `Copilot HTTP ${e.status}: ${e.body}` });
};

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const readOauthToken: Effect.Effect<string, CopilotAuthError> = Effect.try({
  try: () => {
    const path = join(homedir(), ".config", "github-copilot", "apps.json");
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, { oauth_token?: string }>;
    const entry = parsed["github.com"] ?? Object.values(parsed)[0];
    if (!entry?.oauth_token) throw new Error("oauth_token not found in apps.json");
    return entry.oauth_token;
  },
  catch: (cause) => new CopilotAuthError({ cause }),
});

// ---------------------------------------------------------------------------
// CopilotProvider — implements LLMProvider
// ---------------------------------------------------------------------------

export const CopilotProviderLive = Layer.effect(LLMProvider)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null);

    const exchangeToken = (
      oauthToken: string,
    ): Effect.Effect<TokenCache, CopilotAuthError | CopilotParseError> =>
      Effect.gen(function* () {
        const req = HttpClientRequest.get(
          "https://api.github.com/copilot_internal/v2/token",
        ).pipe(
          HttpClientRequest.setHeaders({
            Authorization: `Token ${oauthToken}`,
            "User-Agent": "theseus-runtime/0.0.1",
            Accept: "application/json",
          }),
        );
        const res = yield* http
          .execute(req)
          .pipe(Effect.mapError((cause) => new CopilotAuthError({ cause })));
        // biome-ignore lint/suspicious/noExplicitAny: external JSON
        const body = yield* res.json.pipe(
          Effect.mapError((cause) => new CopilotParseError({ cause })),
        ) as Effect.Effect<any, CopilotParseError>;
        if (!body?.token) {
          return yield* Effect.fail(
            new CopilotAuthError({
              cause: new Error(`Unexpected token response: ${JSON.stringify(body)}`),
            }),
          );
        }
        return { bearer: body.token as string, expiresAt: body.expires_at as number };
      });

    const getBearer = (): Effect.Effect<string, CopilotAuthError | CopilotParseError> =>
      Effect.gen(function* () {
        const now = Math.floor(Date.now() / 1000);
        const cached = yield* Ref.get(tokenCacheRef);
        if (cached !== null && cached.expiresAt - now > 60) return cached.bearer;
        const oauth = yield* readOauthToken;
        const fresh = yield* exchangeToken(oauth);
        yield* Ref.set(tokenCacheRef, fresh);
        return fresh.bearer;
      });

    return LLMProvider.of({
      call: (
        messages: ReadonlyArray<LLMMessage>,
        tools: ReadonlyArray<LLMToolDef>,
        options: LLMCallOptions = {},
      ) =>
        Effect.gen(function* () {
          const model = options.model ?? Config.model;
          const maxTokens = options.maxTokens ?? Config.maxTokens;
          const bearer = yield* getBearer();
          const useResponses = shouldUseResponsesApi(model);

          const headers = {
            Authorization: `Bearer ${bearer}`,
            "Content-Type": "application/json",
            "Editor-Version": "theseus-runtime/0.0.1",
            "Editor-Plugin-Version": "theseus-runtime/0.0.1",
            "Copilot-Integration-Id": "vscode-chat",
            Accept: "application/json",
          };

          let endpoint: string;
          let body: Record<string, unknown>;

          if (useResponses) {
            endpoint = "https://api.githubcopilot.com/responses";
            body = {
              model,
              input: toResponsesInput(messages),
              max_output_tokens: maxTokens,
              stream: false,
            };
            if (tools.length > 0) body["tools"] = toResponsesTools(tools);
          } else {
            endpoint = "https://api.githubcopilot.com/chat/completions";
            body = {
              model,
              messages: toChatCompletionsMessages(messages),
              max_tokens: maxTokens,
              stream: false,
            };
            if (tools.length > 0) body["tools"] = toChatCompletionsTools(tools);
          }

          const req = HttpClientRequest.post(endpoint).pipe(
            HttpClientRequest.setHeaders(headers),
            HttpClientRequest.bodyJsonUnsafe(body),
          );

          const res = yield* http
            .execute(req)
            .pipe(
              Effect.mapError(
                (cause) => new CopilotHttpError({ status: 0, body: String(cause) }),
              ),
            );

          if (res.status !== 200) {
            const text = yield* res.text.pipe(
              Effect.mapError((cause) => new CopilotParseError({ cause })),
            );
            return yield* Effect.fail(
              new CopilotHttpError({ status: res.status, body: text }),
            );
          }

          // biome-ignore lint/suspicious/noExplicitAny: external JSON
          const data = yield* res.json.pipe(
            Effect.mapError((cause) => new CopilotParseError({ cause })),
          ) as Effect.Effect<any, CopilotParseError>;

          return useResponses
            ? parseResponsesResponse(data, model)
            : parseChatCompletionsResponse(data, model);
        }).pipe(Effect.mapError(mapError)),
    });
  }),
).pipe(Layer.provide(BunHttpClient.layer));
