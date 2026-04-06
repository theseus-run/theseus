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
import { Data, Effect, Layer, Match, Ref, Stream } from "effect";
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
  type LLMStreamChunk,
  type LLMToolCall,
  type LLMToolDef,
} from "@theseus.run/core";

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
// Wire format types — typed boundaries for external JSON (no runtime validation)
// ---------------------------------------------------------------------------

/** Minimal shape for /chat/completions response */
interface ChatCompletionsWire {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Minimal shape for /responses response */
interface ResponsesWire {
  output?: Array<{ type: string; [key: string]: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

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

const parseChatCompletionsResponse = (data: ChatCompletionsWire, _model: string): LLMResponse => {
  const choice = data.choices?.[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason ?? "stop";
  const rawUsage = data.usage;
  const usage = {
    inputTokens: rawUsage?.prompt_tokens ?? 0,
    outputTokens: rawUsage?.completion_tokens ?? 0,
  };

  const thinking = message?.reasoning_content || undefined;

  if (finishReason === "tool_calls") {
    const toolCalls: ReadonlyArray<LLMToolCall> =
      message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) ?? [];
    return { type: "tool_calls", toolCalls, ...(thinking ? { thinking } : {}), usage };
  }

  return { type: "text", content: message?.content ?? "", ...(thinking ? { thinking } : {}), usage };
};

const parseResponsesResponse = (data: ResponsesWire, _model: string): LLMResponse => {
  const output = data.output ?? [];
  const rawUsage = data.usage;
  const usage = {
    inputTokens: rawUsage?.input_tokens ?? 0,
    outputTokens: rawUsage?.output_tokens ?? 0,
  };
  const toolCalls: LLMToolCall[] = [];
  let content = "";
  let thinkingParts = "";

  for (const item of output) {
    if (item.type === "function_call") {
      toolCalls.push({
        id: (item["call_id"] as string) || (item["id"] as string) || "",
        name: item["name"] as string,
        arguments: item["arguments"] as string,
      });
    } else if (item.type === "reasoning") {
      // OpenAI reasoning output — extract reasoning_text parts
      const parts = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
      for (const part of parts) {
        if (part.type === "reasoning_text" && part.text) thinkingParts += part.text;
      }
    } else if (item.type === "message") {
      const parts = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
      for (const part of parts) {
        if (part.type === "output_text" && part.text) content += part.text;
      }
    }
  }

  const thinking = thinkingParts || undefined;

  if (toolCalls.length > 0) return { type: "tool_calls", toolCalls, ...(thinking ? { thinking } : {}), usage };
  return { type: "text", content, ...(thinking ? { thinking } : {}), usage };
};

// ---------------------------------------------------------------------------
// SSE parsing — shared by both streaming endpoints
// ---------------------------------------------------------------------------

/** Parse raw SSE bytes into data-line strings. Handles chunked boundaries. */
const parseSSELines = <E>(
  raw: Stream.Stream<Uint8Array, E>,
): Stream.Stream<string, E> => {
  const decoder = new TextDecoder();
  return raw.pipe(
    Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
    // Accumulate partial lines across chunks, emit complete lines
    Stream.mapAccum(() => "", (buffer, chunk) => {
      const combined = buffer + chunk;
      const parts = combined.split("\n");
      // Last element may be incomplete — carry it forward
      const carry = parts.pop()!;
      return [carry, parts] as const;
    }),
    // Extract "data: " payloads, skip empty lines and comments
    Stream.filter((line): line is string => typeof line === "string" && line.startsWith("data: ")),
    Stream.map((line) => line.slice(6)),
    // Stop at [DONE] sentinel
    Stream.takeWhile((data) => data !== "[DONE]"),
  );
};

const parseChatCompletionsChunk = (data: ChatCompletionsWire): LLMStreamChunk | null => {
  const choice = data.choices?.[0];
  if (!choice) return null;
  const delta = choice.delta;

  if (delta?.reasoning_content) {
    return { type: "thinking_delta", content: delta.reasoning_content };
  }

  if (delta?.content) {
    return { type: "text_delta", content: delta.content };
  }

  return null;
};

/** Minimal shape for /responses SSE event */
interface ResponsesSSEEvent {
  type?: string;
  delta?: string;
  call_id?: string;
  item_id?: string;
  name?: string;
  arguments?: string;
}

const parseResponsesChunk = (data: ResponsesSSEEvent): LLMStreamChunk | null => {
  const eventType = data.type ?? "";

  if (eventType === "response.output_text.delta" && data.delta) {
    return { type: "text_delta", content: data.delta };
  }

  if (eventType === "response.reasoning_text.delta" && data.delta) {
    return { type: "thinking_delta", content: data.delta };
  }

  return null;
};

// ---------------------------------------------------------------------------
// Error mapping — internal → LLMError | LLMErrorRetriable
// ---------------------------------------------------------------------------

const mapError = (e: CopilotError): LLMError | LLMErrorRetriable =>
  Match.value(e).pipe(
    Match.tag("CopilotAuthError", (e) =>
      new LLMError({ message: "Copilot auth failed", cause: e.cause }),
    ),
    Match.tag("CopilotParseError", (e) =>
      new LLMError({ message: "Failed to parse LLM response", cause: e.cause }),
    ),
    Match.tag("CopilotHttpError", (e) =>
      e.status === 0 || e.status === 429 || e.status >= 500
        ? new LLMErrorRetriable({ message: `Copilot HTTP ${e.status}`, cause: e.body })
        : new LLMError({ message: `Copilot HTTP ${e.status}: ${e.body}` }),
    ),
    Match.exhaustive,
  );

// ---------------------------------------------------------------------------
// ToolCallAccumulator — stateful accumulation for streaming tool calls
// ---------------------------------------------------------------------------

class ToolCallAccumulator {
  content = "";
  thinking = "";
  readonly toolCalls: LLMToolCall[] = [];
  private readonly indexMap = new Map<number, { id: string; name: string; args: string }>();

  /** Accumulate a parsed text/thinking delta. */
  addDelta(chunk: LLMStreamChunk | null): void {
    if (!chunk) return;
    if (chunk.type === "text_delta") this.content += chunk.content;
    if (chunk.type === "thinking_delta") this.thinking += chunk.content;
  }

  /** Accumulate tool call deltas from chat/completions SSE. */
  addChatCompletionsDelta(delta: NonNullable<NonNullable<ChatCompletionsWire["choices"]>[number]["delta"]>): void {
    if (!delta.tool_calls) return;
    for (const tc of delta.tool_calls) {
      const existing = this.indexMap.get(tc.index);
      if (!existing) {
        this.indexMap.set(tc.index, {
          id: tc.id ?? "",
          name: tc.function?.name ?? "",
          args: tc.function?.arguments ?? "",
        });
      } else {
        if (tc.function?.arguments) existing.args += tc.function.arguments;
      }
    }
  }

  /** Accumulate tool call from responses SSE event. */
  addResponsesEvent(data: ResponsesSSEEvent): void {
    if (data.type === "response.function_call_arguments.done") {
      this.toolCalls.push({
        id: data.call_id || data.item_id || "",
        name: data.name as string,
        arguments: data.arguments as string,
      });
    }
  }

  /** Build the final "done" chunk with accumulated state. */
  buildDoneChunk(): LLMStreamChunk {
    // Finalize tool calls from chat/completions index map
    for (const [, tc] of [...this.indexMap.entries()].sort(([a], [b]) => a - b)) {
      this.toolCalls.push({ id: tc.id, name: tc.name, arguments: tc.args });
    }

    const thinking = this.thinking || undefined;
    const usage = { inputTokens: 0, outputTokens: 0 }; // SSE doesn't always include usage

    if (this.toolCalls.length > 0) {
      return {
        type: "done",
        response: { type: "tool_calls", toolCalls: this.toolCalls, ...(thinking ? { thinking } : {}), usage },
      };
    }
    return {
      type: "done",
      response: { type: "text", content: this.content, ...(thinking ? { thinking } : {}), usage },
    };
  }
}

// ---------------------------------------------------------------------------
// processSSEChunk — parse JSON + update accumulator, return stream chunk
// ---------------------------------------------------------------------------

const processSSEChunk = (
  data: string,
  acc: ToolCallAccumulator,
  useResponses: boolean,
): LLMStreamChunk | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    // Log but don't crash — malformed SSE line
    console.warn("[copilot] Failed to parse SSE chunk:", (e as Error).message);
    return null;
  }

  let chunk: LLMStreamChunk | null;
  if (useResponses) {
    const event = parsed as ResponsesSSEEvent;
    acc.addResponsesEvent(event);
    chunk = parseResponsesChunk(event);
  } else {
    const wire = parsed as ChatCompletionsWire;
    const choice = wire.choices?.[0];
    if (choice?.delta) acc.addChatCompletionsDelta(choice.delta);
    chunk = parseChatCompletionsChunk(wire);
  }

  acc.addDelta(chunk);
  return chunk;
};

// ---------------------------------------------------------------------------
// buildStreamPipeline — compose SSE lines into LLMStreamChunk stream
// ---------------------------------------------------------------------------

const buildStreamPipeline = (
  sseLines: Stream.Stream<string, CopilotError>,
  useResponses: boolean,
): Stream.Stream<LLMStreamChunk, LLMError | LLMErrorRetriable> => {
  const acc = new ToolCallAccumulator();

  return sseLines.pipe(
    Stream.mapError(mapError),
    Stream.map((data) => processSSEChunk(data, acc, useResponses)),
    Stream.filter((c): c is LLMStreamChunk => c !== null),
    Stream.concat(
      Stream.fromEffect(Effect.sync(() => acc.buildDoneChunk())),
    ),
  );
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
        const body = yield* res.json.pipe(
          Effect.mapError((cause) => new CopilotParseError({ cause })),
        ) as Effect.Effect<{ token?: string; expires_at?: number }, CopilotParseError>;
        if (!body?.token) {
          return yield* Effect.fail(
            new CopilotAuthError({
              cause: new Error(`Unexpected token response: ${JSON.stringify(body)}`),
            }),
          );
        }
        return { bearer: body.token, expiresAt: body.expires_at ?? 0 };
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

    // Shared: build request for a given model, messages, tools, streaming flag
    const buildRequest = (
      messages: ReadonlyArray<LLMMessage>,
      tools: ReadonlyArray<LLMToolDef>,
      options: LLMCallOptions,
      streaming: boolean,
    ): Effect.Effect<
      { req: HttpClientRequest.HttpClientRequest; useResponses: boolean; model: string },
      CopilotAuthError | CopilotParseError
    > =>
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
            stream: streaming,
          };
          if (tools.length > 0) body["tools"] = toResponsesTools(tools);
        } else {
          endpoint = "https://api.githubcopilot.com/chat/completions";
          body = {
            model,
            messages: toChatCompletionsMessages(messages),
            max_tokens: maxTokens,
            stream: streaming,
          };
          if (tools.length > 0) body["tools"] = toChatCompletionsTools(tools);
        }

        const req = HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyJsonUnsafe(body),
        );

        return { req, useResponses, model };
      });

    return LLMProvider.of({
      call: (
        messages: ReadonlyArray<LLMMessage>,
        tools: ReadonlyArray<LLMToolDef>,
        options: LLMCallOptions = {},
      ) =>
        Effect.gen(function* () {
          const { req, useResponses, model } = yield* buildRequest(messages, tools, options, false);

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

          const data = yield* res.json.pipe(
            Effect.mapError((cause) => new CopilotParseError({ cause })),
          ) as Effect.Effect<ChatCompletionsWire | ResponsesWire, CopilotParseError>;

          return useResponses
            ? parseResponsesResponse(data as ResponsesWire, model)
            : parseChatCompletionsResponse(data as ChatCompletionsWire, model);
        }).pipe(Effect.mapError(mapError)),

      callStream: (
        messages: ReadonlyArray<LLMMessage>,
        tools: ReadonlyArray<LLMToolDef>,
        options: LLMCallOptions = {},
      ): Stream.Stream<LLMStreamChunk, LLMError | LLMErrorRetriable> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { req, useResponses } = yield* buildRequest(messages, tools, options, true);

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

            const sseLines = parseSSELines(
              Stream.mapError(res.stream, () => new CopilotHttpError({ status: 0, body: "Stream read error" })),
            );
            return buildStreamPipeline(sseLines, useResponses);
          }).pipe(Effect.mapError(mapError)),
        ),
    });
  }),
).pipe(Layer.provide(BunHttpClient.layer));
