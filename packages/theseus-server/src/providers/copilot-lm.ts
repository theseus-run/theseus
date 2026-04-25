/**
 * CopilotLanguageModel — LanguageModel provider backed by GitHub Copilot.
 *
 * Implements effect/unstable/ai LanguageModel via LanguageModel.make().
 * Reuses auth, SSE parsing, and wire format logic from copilot internals.
 *
 * Auth flow:
 *   1. Read oauth_token from ~/.config/github-copilot/apps.json
 *   2. Exchange → GET https://api.github.com/copilot_internal/v2/token
 *   3. POST to endpoint routed by model:
 *      - gpt-5+ (non-mini) → /responses (OpenAI Responses API)
 *      - everything else   → /chat/completions
 *
 * Bearer tokens are cached in a Ref and refreshed when within 60s of expiry.
 * Errors are mapped to AiError at the boundary.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BunHttpClient } from "@effect/platform-bun";
import { Clock, Data, Effect, Layer, Match, Ref, Stream } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import * as AiTool from "effect/unstable/ai/Tool";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { RuntimeConfig, RuntimeConfigLive } from "../config.ts";

// ---------------------------------------------------------------------------
// Internal errors — private to this module, mapped to AiError at the boundary
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

class CopilotEncodeError extends Data.TaggedError("CopilotEncodeError")<{
  readonly cause?: unknown;
}> {}

type CopilotError = CopilotAuthError | CopilotHttpError | CopilotParseError | CopilotEncodeError;

const parseToolParams = (raw: string): Effect.Effect<unknown, CopilotParseError> =>
  Effect.try({
    try: () => JSON.parse(raw),
    catch: (cause) => new CopilotParseError({ cause }),
  });

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  readonly bearer: string;
  readonly expiresAt: number;
}

// ---------------------------------------------------------------------------
// Endpoint routing
// ---------------------------------------------------------------------------

const shouldUseResponsesApi = (model: string): boolean => {
  const match = /^gpt-(\d+)/.exec(model);
  if (!match) return false;
  return Number(match[1]) >= 5 && !model.startsWith("gpt-5-mini");
};

// ---------------------------------------------------------------------------
// Wire format types
// ---------------------------------------------------------------------------

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

interface ResponsesWire {
  output?: Array<{ type: string; [key: string]: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface ResponsesSSEEvent {
  type?: string;
  delta?: string;
  call_id?: string;
  item_id?: string;
  name?: string;
  arguments?: string;
  item?: { type?: string; call_id?: string; name?: string; id?: string };
}

const textFromParts = (parts: ReadonlyArray<Prompt.Part>): string =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

const streamPart = (part: unknown): Response.StreamPartEncoded =>
  part as Response.StreamPartEncoded;

const encodeJson = (value: unknown, fallback: unknown): Effect.Effect<string, CopilotEncodeError> =>
  Effect.try({
    try: () => JSON.stringify(value ?? fallback) ?? "null",
    catch: (cause) => new CopilotEncodeError({ cause }),
  });

const unsupportedPromptPart = (
  role: Prompt.Message["role"],
  part: Prompt.Part,
): CopilotEncodeError =>
  new CopilotEncodeError({ cause: `Unsupported ${role} prompt part: ${part.type}` });

// ---------------------------------------------------------------------------
// Prompt → wire format converters
// ---------------------------------------------------------------------------

/** Convert Prompt messages to /chat/completions wire format. */
const promptToChatCompletions = (
  prompt: Prompt.Prompt,
): Effect.Effect<unknown[], CopilotEncodeError> =>
  Effect.forEach(prompt.content, (msg) =>
    Match.value(msg).pipe(
      Match.when({ role: "system" }, (message) =>
        Effect.succeed({ role: "system", content: message.content }),
      ),
      Match.when({ role: "user" }, (message) => {
        const unsupported = message.content.find((part) => part.type !== "text");
        if (unsupported) return Effect.fail(unsupportedPromptPart(message.role, unsupported));
        return Effect.succeed({ role: "user", content: textFromParts(message.content) });
      }),
      Match.when({ role: "assistant" }, (message) =>
        Effect.gen(function* () {
          const unsupported = message.content.find(
            (part) => part.type !== "text" && part.type !== "tool-call",
          );
          if (unsupported) {
            return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
          }
          const parts = message.content;
          const textParts = parts.filter((p) => p.type === "text");
          const toolCallParts = parts.filter((p) => p.type === "tool-call");
          const content = textFromParts(textParts) || null;
          if (toolCallParts.length > 0) {
            const toolCalls = yield* Effect.forEach(toolCallParts, (tc) =>
              encodeJson(tc.params, {}).pipe(
                Effect.map((args) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: args },
                })),
              ),
            );
            return {
              role: "assistant",
              content,
              tool_calls: toolCalls,
            };
          }
          return { role: "assistant", content };
        }),
      ),
      Match.when({ role: "tool" }, (message) =>
        Effect.gen(function* () {
          const result = message.content.find((p) => p.type === "tool-result");
          if (!result) {
            const unsupported = message.content[0];
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
          }
          const content =
            typeof result?.result === "string"
              ? result.result
              : yield* encodeJson(result?.result, "");
          return {
            role: "tool",
            tool_call_id: result?.id ?? "",
            content,
          };
        }),
      ),
      Match.exhaustive,
    ),
  );

/** Convert Prompt messages to /responses wire format. */
const promptToResponsesInput = (
  prompt: Prompt.Prompt,
): Effect.Effect<unknown[], CopilotEncodeError> =>
  Effect.gen(function* () {
    const itemGroups = yield* Effect.forEach(prompt.content, (msg) =>
      Match.value(msg).pipe(
        Match.when({ role: "system" }, (message) =>
          Effect.succeed([{ role: "system", content: message.content }]),
        ),
        Match.when({ role: "user" }, (message) => {
          const unsupported = message.content.find((part) => part.type !== "text");
          if (unsupported) return Effect.fail(unsupportedPromptPart(message.role, unsupported));
          return Effect.succeed([{ role: "user", content: textFromParts(message.content) }]);
        }),
        Match.when({ role: "assistant" }, (message) =>
          Effect.gen(function* () {
            const unsupported = message.content.find(
              (part) => part.type !== "text" && part.type !== "tool-call",
            );
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
            const parts = message.content;
            const textParts = parts.filter((p) => p.type === "text");
            const toolCallParts = parts.filter((p) => p.type === "tool-call");
            const items: unknown[] = [];
            const text = textFromParts(textParts);
            if (text) items.push({ role: "assistant", content: text });
            const toolCalls = yield* Effect.forEach(toolCallParts, (tc) =>
              encodeJson(tc.params, {}).pipe(
                Effect.map((args) => ({
                  type: "function_call",
                  call_id: tc.id,
                  name: tc.name,
                  arguments: args,
                })),
              ),
            );
            items.push(...toolCalls);
            return items;
          }),
        ),
        Match.when({ role: "tool" }, (message) =>
          Effect.gen(function* () {
            const unsupported = message.content.find((part) => part.type !== "tool-result");
            if (unsupported) {
              return yield* Effect.fail(unsupportedPromptPart(message.role, unsupported));
            }
            return yield* Effect.forEach(
              message.content.filter((p) => p.type === "tool-result"),
              (r) =>
                Effect.gen(function* () {
                  const output =
                    typeof r.result === "string" ? r.result : yield* encodeJson(r.result, "");
                  return {
                    type: "function_call_output",
                    call_id: r.id,
                    output,
                  };
                }),
            );
          }),
        ),
        Match.exhaustive,
      ),
    );
    return itemGroups.flat();
  });

/** Get the JSON schema for a tool through Effect/AI's public schema accessor. */
const getToolSchema = (t: AiTool.Any): Record<string, unknown> =>
  AiTool.getJsonSchema(t) ?? { type: "object", properties: {} };

/** Convert AI Tool definitions to /chat/completions tools format. */
const aiToolsToChatCompletionsTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: AiTool.getDescription(t) ?? "",
      parameters: getToolSchema(t),
    },
  }));

/** Convert AI Tool definitions to /responses tools format. */
const aiToolsToResponsesTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    name: t.name,
    description: AiTool.getDescription(t) ?? "",
    parameters: getToolSchema(t),
  }));

// ---------------------------------------------------------------------------
// Response parsers → Response.PartEncoded[]
// ---------------------------------------------------------------------------

/** Build a usage object with all required fields. */
const makeUsage = (input: number, output: number) => ({
  inputTokens: { total: input, uncached: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: undefined, reasoning: undefined },
});

/** Build a FinishPartEncoded with all fields explicit. */
const makeFinishPart = (
  reason: string,
  input: number,
  output: number,
): Response.FinishPartEncoded => ({
  type: "finish",
  reason: reason as Response.FinishPartEncoded["reason"],
  usage: makeUsage(input, output),
  response: undefined,
});

const parseChatCompletionsToResponseParts = (
  data: ChatCompletionsWire,
): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
  Effect.gen(function* () {
    const choice = data.choices?.[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason ?? "stop";
    const rawUsage = data.usage;
    const parts: Response.PartEncoded[] = [];

    if (message?.reasoning_content) {
      parts.push({ type: "reasoning", text: message.reasoning_content });
    }

    if (message?.content) {
      parts.push({ type: "text", text: message.content });
    }

    if (finishReason === "tool_calls" && message?.tool_calls) {
      const toolCalls = yield* Effect.forEach(message.tool_calls, (tc) =>
        Effect.gen(function* () {
          const params = yield* parseToolParams(tc.function.arguments);
          return {
            type: "tool-call" as const,
            id: tc.id,
            name: tc.function.name,
            params,
          } satisfies Response.ToolCallPartEncoded;
        }),
      );
      parts.push(...toolCalls);
    } else if (!message?.content) {
      parts.push({ type: "text", text: "" });
    }

    parts.push(
      makeFinishPart(
        finishReason === "tool_calls" ? "tool-calls" : "stop",
        rawUsage?.prompt_tokens ?? 0,
        rawUsage?.completion_tokens ?? 0,
      ),
    );

    return parts;
  });

const parseResponsesResponseToResponseParts = (
  data: ResponsesWire,
): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
  Effect.gen(function* () {
    const output = data.output ?? [];
    const rawUsage = data.usage;
    const parts: Response.PartEncoded[] = [];
    let hasToolCalls = false;

    const itemGroups = yield* Effect.forEach(
      output,
      (item): Effect.Effect<Response.PartEncoded[], CopilotParseError> =>
        Match.value(item.type).pipe(
          Match.when("function_call", () =>
            Effect.gen(function* () {
              hasToolCalls = true;
              const params = yield* parseToolParams((item["arguments"] as string) ?? "{}");
              return [
                {
                  type: "tool-call" as const,
                  id: sanitizeCallId((item["call_id"] as string) || (item["id"] as string) || ""),
                  name: (item["name"] as string) ?? "",
                  params,
                } satisfies Response.ToolCallPartEncoded,
              ];
            }),
          ),
          Match.when("reasoning", () => {
            const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
            const text = content
              .filter((p) => p.type === "reasoning_text" && p.text)
              .map((p) => p.text ?? "")
              .join("");
            return Effect.succeed(text ? [{ type: "reasoning" as const, text }] : []);
          }),
          Match.when("message", () => {
            const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
            const text = content
              .filter((p) => p.type === "output_text" && p.text)
              .map((p) => p.text ?? "")
              .join("");
            return Effect.succeed(text ? [{ type: "text" as const, text }] : []);
          }),
          Match.orElse(() => Effect.succeed([])),
        ),
    );
    const items = itemGroups.flat();
    parts.push(...items);

    parts.push(
      makeFinishPart(
        hasToolCalls ? "tool-calls" : "stop",
        rawUsage?.input_tokens ?? 0,
        rawUsage?.output_tokens ?? 0,
      ),
    );

    return parts;
  });

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

const parseSSELines = <E>(raw: Stream.Stream<Uint8Array, E>): Stream.Stream<string, E> => {
  const decoder = new TextDecoder();
  return raw.pipe(
    Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
    Stream.mapAccum(
      () => "",
      (buffer: string, chunk: string) => {
        const combined = buffer + chunk;
        const parts = combined.split("\n");
        const carry = parts.pop() ?? "";
        return [carry, parts] as const;
      },
    ),
    Stream.filter((line): line is string => typeof line === "string" && line.startsWith("data: ")),
    Stream.map((line) => line.slice(6)),
    Stream.takeWhile((data) => data !== "[DONE]"),
  );
};

// ---------------------------------------------------------------------------
// StreamPartEncoded accumulator for streaming
// ---------------------------------------------------------------------------

class StreamAccumulator {
  readonly parts: Response.StreamPartEncoded[] = [];
  private readonly indexMap = new Map<number, { id: string; name: string; args: string }>();
  private readonly responsesCallMap = new Map<
    string,
    { id: string; name: string; args: string; done: boolean }
  >();
  private readonly responsesCallOrder: string[] = [];
  private textId = "";
  private reasoningId = "";

  constructor(private readonly now: () => number) {}

  addChatCompletionsDelta(
    delta: NonNullable<NonNullable<ChatCompletionsWire["choices"]>[number]["delta"]>,
  ): Response.StreamPartEncoded | null {
    if (delta.tool_calls) {
      delta.tool_calls.forEach((tc) => {
        const existing = this.indexMap.get(tc.index);
        if (!existing) {
          this.indexMap.set(tc.index, {
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
            args: tc.function?.arguments ?? "",
          });
        } else if (tc.function?.arguments) existing.args += tc.function.arguments;
      });
      return null;
    }
    return Match.value(true).pipe(
      Match.when(
        () => !!delta.reasoning_content,
        () => {
          if (!this.reasoningId) {
            this.reasoningId = `reasoning_${this.now()}`;
          }
          return {
            type: "reasoning-delta",
            id: this.reasoningId,
            delta: delta.reasoning_content,
          } as unknown as Response.StreamPartEncoded;
        },
      ),
      Match.when(
        () => !!delta.content,
        () => {
          if (!this.textId) {
            this.textId = `text_${this.now()}`;
            // Emit as text-delta directly — text-start has no delta field
            // and would lose the first chunk's content
            return streamPart({ type: "text-delta", id: this.textId, delta: delta.content });
          }
          return streamPart({ type: "text-delta", id: this.textId, delta: delta.content });
        },
      ),
      Match.orElse(() => null),
    );
  }

  addResponsesEvent(
    data: ResponsesSSEEvent,
  ): Effect.Effect<Response.StreamPartEncoded | null, CopilotParseError> {
    const eventType = data.type ?? "";
    return Match.value(eventType).pipe(
      Match.when("response.output_item.added", () => {
        if (data.item?.type !== "function_call") return Effect.succeed(null);
        const callId = sanitizeCallId(data.item.call_id ?? data.item.id ?? `call_${this.now()}`);
        this.responsesCallMap.set(callId, {
          id: callId,
          name: data.item.name ?? "",
          args: "",
          done: false,
        });
        this.responsesCallOrder.push(callId);
        return Effect.succeed(null);
      }),
      Match.when("response.function_call_arguments.done", () => {
        const callId = data.call_id ? sanitizeCallId(data.call_id) : undefined;
        let entry = callId ? this.responsesCallMap.get(callId) : undefined;
        if (!entry) {
          entry = this.responsesCallOrder
            .map((key) => this.responsesCallMap.get(key))
            .find((candidate) => candidate && !candidate.done);
        }
        if (!entry) return Effect.succeed(null);
        entry.args = data.arguments ?? entry.args;
        entry.done = true;
        return parseToolParams(entry.args).pipe(
          Effect.map(
            (params) =>
              ({
                type: "tool-call",
                id: entry.id,
                name: entry.name || data.name || "",
                params,
              }) as unknown as Response.StreamPartEncoded,
          ),
        );
      }),
      Match.when("response.output_text.delta", () => {
        if (!data.delta) return Effect.succeed(null);
        if (!this.textId) {
          this.textId = `text_${this.now()}`;
        }
        return Effect.succeed(
          streamPart({ type: "text-delta", id: this.textId, delta: data.delta }),
        );
      }),
      Match.when("response.reasoning_text.delta", () => {
        if (!data.delta) return Effect.succeed(null);
        if (!this.reasoningId) {
          this.reasoningId = `reasoning_${this.now()}`;
        }
        return Effect.succeed(
          streamPart({ type: "reasoning-delta", id: this.reasoningId, delta: data.delta }),
        );
      }),
      Match.orElse(() => Effect.succeed(null)),
    );
  }

  buildFinalParts(): Effect.Effect<Response.StreamPartEncoded[], CopilotParseError> {
    const acc = this;
    return Effect.gen(function* () {
      const final: Response.StreamPartEncoded[] = [];

      // Close open text/reasoning streams
      if (acc.textId) final.push(streamPart({ type: "text-end", id: acc.textId }));
      if (acc.reasoningId) final.push(streamPart({ type: "reasoning-end", id: acc.reasoningId }));

      // Finalize chat/completions tool calls from index map
      const chatToolCalls = yield* Effect.forEach(
        [...acc.indexMap.entries()].sort(([a], [b]) => a - b),
        ([, tc]) =>
          Effect.gen(function* () {
            const params = yield* parseToolParams(tc.args);
            return {
              type: "tool-call" as const,
              id: tc.id,
              name: tc.name,
              params,
            } as unknown as Response.StreamPartEncoded;
          }),
      );
      final.push(...chatToolCalls);

      // Flush unfinished responses tool calls
      const responseToolCalls = yield* Effect.forEach(
        acc.responsesCallOrder
          .map((key) => acc.responsesCallMap.get(key))
          .filter((tc): tc is NonNullable<typeof tc> => !!tc && !tc.done),
        (tc) =>
          Effect.gen(function* () {
            const params = yield* parseToolParams(tc.args);
            return {
              type: "tool-call" as const,
              id: tc.id,
              name: tc.name,
              params,
            } as unknown as Response.StreamPartEncoded;
          }),
      );
      final.push(...responseToolCalls);

      const hasToolCalls = acc.indexMap.size > 0 || acc.responsesCallOrder.length > 0;
      final.push(makeFinishPart(hasToolCalls ? "tool-calls" : "stop", 0, 0));

      return final;
    });
  }
}

const processSSEChunkToStreamPart = (
  data: string,
  acc: StreamAccumulator,
  useResponses: boolean,
): Effect.Effect<Response.StreamPartEncoded | null, CopilotParseError> => {
  if (data.trim() === "") return Effect.succeed(null);

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (cause) {
    return Effect.fail(new CopilotParseError({ cause }));
  }

  if (useResponses) {
    return acc.addResponsesEvent(parsed as ResponsesSSEEvent);
  }
  const wire = parsed as ChatCompletionsWire;
  const choice = wire.choices?.[0];
  if (choice?.delta) return Effect.succeed(acc.addChatCompletionsDelta(choice.delta));
  return Effect.succeed(null);
};
// ---------------------------------------------------------------------------
// Error mapping — internal → AiError
// ---------------------------------------------------------------------------

const mapError = (e: CopilotError): AiError.AiError =>
  Match.value(e).pipe(
    Match.tag("CopilotAuthError", () =>
      AiError.make({
        module: "CopilotProvider",
        method: "auth",
        reason: new AiError.AuthenticationError({ kind: "Unknown" }),
      }),
    ),
    Match.tag("CopilotParseError", () =>
      AiError.make({
        module: "CopilotProvider",
        method: "parse",
        reason: new AiError.InternalProviderError({ description: "Failed to parse LLM response" }),
      }),
    ),
    Match.tag("CopilotEncodeError", () =>
      AiError.make({
        module: "CopilotProvider",
        method: "encode",
        reason: new AiError.InternalProviderError({ description: "Failed to encode LLM request" }),
      }),
    ),
    Match.tag("CopilotHttpError", (e) =>
      AiError.make({
        module: "CopilotProvider",
        method: "http",
        reason: new AiError.UnknownError({ description: `HTTP ${e.status}: ${e.body}` }),
      }),
    ),
    Match.exhaustive,
  );

/** Ensure call_id stays within OpenAI's 64-char limit. */
const sanitizeCallId = (id: string): string => (id.length <= 64 ? id : id.slice(0, 64));

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

const readOauthToken: Effect.Effect<string, CopilotAuthError> = Effect.gen(function* () {
  const path = join(homedir(), ".config", "github-copilot", "apps.json");

  const raw = yield* Effect.try({
    try: () => readFileSync(path, "utf-8"),
    catch: (cause) => new CopilotAuthError({ cause: `Cannot read ${path}: ${cause}` }),
  });

  const parsed = yield* Effect.try({
    try: () => JSON.parse(raw) as Record<string, { oauth_token?: string }>,
    catch: (cause) => new CopilotAuthError({ cause: `Cannot parse ${path}: ${cause}` }),
  });

  const entry = parsed["github.com"] ?? Object.values(parsed)[0];
  if (!entry?.oauth_token) {
    return yield* Effect.fail(
      new CopilotAuthError({
        cause: `oauth_token not found in ${path} (keys: ${Object.keys(parsed).join(", ")})`,
      }),
    );
  }

  return entry.oauth_token;
});

// ---------------------------------------------------------------------------
// CopilotLanguageModel — implements LanguageModel via LanguageModel.make()
// ---------------------------------------------------------------------------

/** Core layer — requires HttpClient from environment. */
export const CopilotLanguageModelLayer = Layer.effect(LanguageModel.LanguageModel)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const config = yield* RuntimeConfig;
    const clock = yield* Clock.Clock;
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null);

    const exchangeToken = (
      oauthToken: string,
    ): Effect.Effect<TokenCache, CopilotAuthError | CopilotParseError> =>
      Effect.gen(function* () {
        const req = HttpClientRequest.get(config.copilotAuthUrl).pipe(
          HttpClientRequest.setHeaders({
            Authorization: `Token ${oauthToken}`,
            "User-Agent": "theseus-server/0.0.1",
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
        const nowMillis = yield* Clock.currentTimeMillis;
        const now = Math.floor(nowMillis / 1000);
        const cached = yield* Ref.get(tokenCacheRef);
        if (cached !== null && cached.expiresAt - now > 60) return cached.bearer;
        const oauth = yield* readOauthToken;
        const fresh = yield* exchangeToken(oauth);
        yield* Ref.set(tokenCacheRef, fresh);
        return fresh.bearer;
      });

    const buildRequest = (
      prompt: Prompt.Prompt,
      tools: ReadonlyArray<AiTool.Any>,
      streaming: boolean,
    ): Effect.Effect<
      { req: HttpClientRequest.HttpClientRequest; useResponses: boolean },
      CopilotAuthError | CopilotParseError | CopilotEncodeError
    > =>
      Effect.gen(function* () {
        const model = config.model;
        const maxTokens = config.maxTokens;
        const bearer = yield* getBearer();
        const useResponses = shouldUseResponsesApi(model);

        const headers = {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          "Editor-Version": "theseus-server/0.0.1",
          "Editor-Plugin-Version": "theseus-server/0.0.1",
          "Copilot-Integration-Id": "vscode-chat",
          Accept: "application/json",
        };

        const body: Record<string, unknown> = useResponses
          ? {
              model,
              input: yield* promptToResponsesInput(prompt),
              max_output_tokens: maxTokens,
              stream: streaming,
              ...(tools.length > 0 ? { tools: aiToolsToResponsesTools(tools) } : {}),
            }
          : {
              model,
              messages: yield* promptToChatCompletions(prompt),
              max_tokens: maxTokens,
              stream: streaming,
              ...(tools.length > 0 ? { tools: aiToolsToChatCompletionsTools(tools) } : {}),
            };

        const endpoint = useResponses
          ? `${config.copilotApiUrl}/responses`
          : `${config.copilotApiUrl}/chat/completions`;

        const req = HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyJsonUnsafe(body),
        );

        return { req, useResponses };
      });

    const executeRequest = (req: HttpClientRequest.HttpClientRequest) =>
      Effect.gen(function* () {
        const res = yield* http
          .execute(req)
          .pipe(
            Effect.mapError((cause) => new CopilotHttpError({ status: 0, body: String(cause) })),
          );
        if (res.status !== 200) {
          const text = yield* res.text.pipe(
            Effect.mapError((cause) => new CopilotParseError({ cause })),
          );
          return yield* Effect.fail(new CopilotHttpError({ status: res.status, body: text }));
        }
        return res;
      });

    return yield* LanguageModel.make({
      generateText: (options: LanguageModel.ProviderOptions) =>
        Effect.gen(function* () {
          const { req, useResponses } = yield* buildRequest(options.prompt, options.tools, false);
          const res = yield* executeRequest(req);
          const data = yield* res.json.pipe(
            Effect.mapError((cause) => new CopilotParseError({ cause })),
          ) as Effect.Effect<ChatCompletionsWire | ResponsesWire, CopilotParseError>;

          return yield* useResponses
            ? parseResponsesResponseToResponseParts(data as ResponsesWire)
            : parseChatCompletionsToResponseParts(data as ChatCompletionsWire);
        }).pipe(Effect.mapError(mapError)),

      streamText: (options: LanguageModel.ProviderOptions) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { req, useResponses } = yield* buildRequest(options.prompt, options.tools, true);
            const res = yield* executeRequest(req);
            const acc = new StreamAccumulator(() => clock.currentTimeMillisUnsafe());

            const sseLines = parseSSELines(
              Stream.mapError(
                res.stream,
                () => new CopilotHttpError({ status: 0, body: "Stream read error" }),
              ),
            );

            return sseLines.pipe(
              Stream.mapError(mapError),
              Stream.mapEffect((data) =>
                processSSEChunkToStreamPart(data, acc, useResponses).pipe(
                  Effect.mapError(mapError),
                ),
              ),
              Stream.filter((c): c is Response.StreamPartEncoded => c !== null),
              Stream.concat(
                Stream.suspend(() =>
                  Stream.fromIterableEffect(acc.buildFinalParts().pipe(Effect.mapError(mapError))),
                ),
              ),
            );
          }).pipe(Effect.mapError(mapError)),
        ),
    });
  }),
);

/** Convenience live layer with BunHttpClient + RuntimeConfigLive. */
export const CopilotLanguageModelLive = CopilotLanguageModelLayer.pipe(
  Layer.provide(BunHttpClient.layer),
  Layer.provide(RuntimeConfigLive),
);
