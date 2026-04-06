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
import { Data, Effect, Layer, Match, Ref, Stream } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as AiError from "effect/unstable/ai/AiError";
import * as LanguageModel from "effect/unstable/ai/LanguageModel";
import * as Prompt from "effect/unstable/ai/Prompt";
import type * as Response from "effect/unstable/ai/Response";
import * as AiTool from "effect/unstable/ai/Tool";
import { Config } from "../config.ts";

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

type CopilotError = CopilotAuthError | CopilotHttpError | CopilotParseError;

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

// ---------------------------------------------------------------------------
// Prompt → wire format converters
// ---------------------------------------------------------------------------

/** Convert Prompt messages to /chat/completions wire format. */
const promptToChatCompletions = (prompt: Prompt.Prompt): unknown[] =>
  prompt.content.map((msg) =>
    Match.value(msg.role).pipe(
      Match.when("system", () => ({ role: "system", content: (msg as any).text ?? "" })),
      Match.when("user", () => {
        const parts = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        const text = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        return { role: "user", content: text || (msg as any).text || "" };
      }),
      Match.when("assistant", () => {
        const parts: any[] = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        const textParts = parts.filter((p) => p.type === "text");
        const toolCallParts = parts.filter((p) => p.type === "tool-call");
        const content = textParts.map((p: any) => p.text).join("") || null;
        if (toolCallParts.length > 0) {
          return {
            role: "assistant",
            content,
            tool_calls: toolCallParts.map((tc: any) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.params ?? {}) },
            })),
          };
        }
        return { role: "assistant", content };
      }),
      Match.when("tool", () => {
        const parts: any[] = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        const result = parts.find((p: any) => p.type === "tool-result");
        return {
          role: "tool",
          tool_call_id: result?.id ?? (msg as any).toolCallId ?? "",
          content: typeof result?.result === "string" ? result.result : JSON.stringify(result?.result ?? ""),
        };
      }),
      Match.orElse(() => ({ role: "user", content: "" })),
    ),
  );

/** Convert Prompt messages to /responses wire format. */
const promptToResponsesInput = (prompt: Prompt.Prompt): unknown[] =>
  prompt.content.flatMap((msg) =>
    Match.value(msg.role).pipe(
      Match.when("system", () => [{ role: "system", content: (msg as any).text ?? "" }]),
      Match.when("user", () => {
        const parts = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        const text = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        return [{ role: "user", content: text || (msg as any).text || "" }];
      }),
      Match.when("assistant", () => {
        const parts: any[] = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        const textParts = parts.filter((p) => p.type === "text");
        const toolCallParts = parts.filter((p) => p.type === "tool-call");
        const items: unknown[] = [];
        const text = textParts.map((p: any) => p.text).join("");
        if (text) items.push({ role: "assistant", content: text });
        toolCallParts.forEach((tc: any) =>
          items.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.params ?? {}),
          }),
        );
        return items;
      }),
      Match.when("tool", () => {
        const parts: any[] = Array.isArray((msg as any).content) ? (msg as any).content : [msg];
        return parts
          .filter((p: any) => p.type === "tool-result")
          .map((r: any) => ({
            type: "function_call_output",
            call_id: r.id ?? (msg as any).toolCallId ?? "",
            output: typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? ""),
          }));
      }),
      Match.orElse(() => []),
    ),
  );

/** Convert AI Tool definitions to /chat/completions tools format. */
const aiToolsToChatCompletionsTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: (t as any).description ?? "",
      parameters: (t as any)._tag === "UserDefined"
        ? AiTool.getJsonSchema(t)
        : { type: "object", properties: {} },
    },
  }));

/** Convert AI Tool definitions to /responses tools format. */
const aiToolsToResponsesTools = (tools: ReadonlyArray<AiTool.Any>): unknown[] =>
  tools.map((t) => ({
    type: "function",
    name: t.name,
    description: (t as any).description ?? "",
    parameters: (t as any)._tag === "UserDefined"
      ? AiTool.getJsonSchema(t)
      : { type: "object", properties: {} },
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
const makeFinishPart = (reason: string, input: number, output: number): Response.FinishPartEncoded => ({
  type: "finish",
  reason: reason as any,
  usage: makeUsage(input, output),
  response: undefined,
});

const parseChatCompletionsToResponseParts = (data: ChatCompletionsWire): Response.PartEncoded[] => {
  const choice = data.choices?.[0];
  const message = choice?.message;
  const finishReason = choice?.finish_reason ?? "stop";
  const rawUsage = data.usage;
  const parts: Response.PartEncoded[] = [];

  if (message?.reasoning_content) {
    parts.push({ type: "reasoning", text: message.reasoning_content });
  }

  if (finishReason === "tool_calls" && message?.tool_calls) {
    message.tool_calls.forEach((tc) => {
      let params: unknown;
      try { params = JSON.parse(tc.function.arguments); } catch { params = {}; }
      parts.push({
        type: "tool-call",
        id: tc.id,
        name: tc.function.name,
        params,
      } as Response.ToolCallPartEncoded);
    });
  } else {
    parts.push({ type: "text", text: message?.content ?? "" });
  }

  parts.push(makeFinishPart(
    finishReason === "tool_calls" ? "tool-calls" : "stop",
    rawUsage?.prompt_tokens ?? 0,
    rawUsage?.completion_tokens ?? 0,
  ));

  return parts;
};

const parseResponsesResponseToResponseParts = (data: ResponsesWire): Response.PartEncoded[] => {
  const output = data.output ?? [];
  const rawUsage = data.usage;
  const parts: Response.PartEncoded[] = [];
  let hasToolCalls = false;

  output.forEach((item) => {
    Match.value(item.type).pipe(
      Match.when("function_call", () => {
        hasToolCalls = true;
        let params: unknown;
        try { params = JSON.parse((item["arguments"] as string) ?? "{}"); } catch { params = {}; }
        parts.push({
          type: "tool-call",
          id: sanitizeCallId((item["call_id"] as string) || (item["id"] as string) || ""),
          name: (item["name"] as string) ?? "",
          params,
        } as Response.ToolCallPartEncoded);
      }),
      Match.when("reasoning", () => {
        const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
        const text = content
          .filter((p) => p.type === "reasoning_text" && p.text)
          .map((p) => p.text!)
          .join("");
        if (text) parts.push({ type: "reasoning", text });
      }),
      Match.when("message", () => {
        const content = (item["content"] as Array<{ type: string; text?: string }>) ?? [];
        const text = content
          .filter((p) => p.type === "output_text" && p.text)
          .map((p) => p.text!)
          .join("");
        if (text) parts.push({ type: "text", text });
      }),
      Match.orElse(() => {}),
    );
  });

  parts.push(makeFinishPart(
    hasToolCalls ? "tool-calls" : "stop",
    rawUsage?.input_tokens ?? 0,
    rawUsage?.output_tokens ?? 0,
  ));

  return parts;
};

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

const parseSSELines = <E>(
  raw: Stream.Stream<Uint8Array, E>,
): Stream.Stream<string, E> => {
  const decoder = new TextDecoder();
  return raw.pipe(
    Stream.map((chunk) => decoder.decode(chunk, { stream: true })),
    Stream.mapAccum(() => "", (buffer: string, chunk: string) => {
      const combined = buffer + chunk;
      const parts = combined.split("\n");
      const carry = parts.pop() ?? "";
      return [carry, parts] as const;
    }),
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
  private readonly responsesCallMap = new Map<string, { id: string; name: string; args: string; done: boolean }>();
  private readonly responsesCallOrder: string[] = [];
  private textId = "";
  private reasoningId = "";

  addChatCompletionsDelta(delta: NonNullable<NonNullable<ChatCompletionsWire["choices"]>[number]["delta"]>): Response.StreamPartEncoded | null {
    if (delta.tool_calls) {
      delta.tool_calls.forEach((tc) => {
        const existing = this.indexMap.get(tc.index);
        if (!existing) {
          this.indexMap.set(tc.index, { id: tc.id ?? "", name: tc.function?.name ?? "", args: tc.function?.arguments ?? "" });
        } else {
          if (tc.function?.arguments) existing.args += tc.function.arguments;
        }
      });
      return null;
    }
    if (delta.reasoning_content) {
      if (!this.reasoningId) {
        this.reasoningId = `reasoning_${Date.now()}`;
        return { type: "reasoning-start", id: this.reasoningId } as any;
      }
      return { type: "reasoning-delta", id: this.reasoningId, delta: delta.reasoning_content } as any;
    }
    if (delta.content) {
      if (!this.textId) {
        this.textId = `text_${Date.now()}`;
        return { type: "text-start", id: this.textId } as any;
      }
      return { type: "text-delta", id: this.textId, delta: delta.content } as any;
    }
    return null;
  }

  addResponsesEvent(data: ResponsesSSEEvent): Response.StreamPartEncoded | null {
    const eventType = data.type ?? "";
    if (eventType === "response.output_item.added" && data.item?.type === "function_call") {
      const callId = sanitizeCallId(data.item.call_id ?? data.item.id ?? `call_${Date.now()}`);
      this.responsesCallMap.set(callId, { id: callId, name: data.item.name ?? "", args: "", done: false });
      this.responsesCallOrder.push(callId);
      return null;
    }
    if (eventType === "response.function_call_arguments.done") {
      const callId = data.call_id ? sanitizeCallId(data.call_id) : undefined;
      let entry = callId ? this.responsesCallMap.get(callId) : undefined;
      if (!entry) {
        for (const key of this.responsesCallOrder) {
          const candidate = this.responsesCallMap.get(key);
          if (candidate && !candidate.done) { entry = candidate; break; }
        }
      }
      if (entry) {
        entry.args = data.arguments ?? entry.args;
        entry.done = true;
        let params: unknown;
        try { params = JSON.parse(entry.args); } catch { params = {}; }
        return { type: "tool-call", id: entry.id, name: entry.name || data.name || "", params } as any;
      }
      return null;
    }
    if (eventType === "response.output_text.delta" && data.delta) {
      if (!this.textId) {
        this.textId = `text_${Date.now()}`;
        return { type: "text-start", id: this.textId } as any;
      }
      return { type: "text-delta", id: this.textId, delta: data.delta } as any;
    }
    if (eventType === "response.reasoning_text.delta" && data.delta) {
      if (!this.reasoningId) {
        this.reasoningId = `reasoning_${Date.now()}`;
        return { type: "reasoning-start", id: this.reasoningId } as any;
      }
      return { type: "reasoning-delta", id: this.reasoningId, delta: data.delta } as any;
    }
    return null;
  }

  buildFinalParts(): Response.StreamPartEncoded[] {
    const final: Response.StreamPartEncoded[] = [];

    // Close open text/reasoning streams
    if (this.textId) final.push({ type: "text-end", id: this.textId } as any);
    if (this.reasoningId) final.push({ type: "reasoning-end", id: this.reasoningId } as any);

    // Finalize chat/completions tool calls from index map
    [...this.indexMap.entries()]
      .sort(([a], [b]) => a - b)
      .forEach(([, tc]) => {
        let params: unknown;
        try { params = JSON.parse(tc.args); } catch { params = {}; }
        final.push({ type: "tool-call", id: tc.id, name: tc.name, params } as any);
      });

    // Flush unfinished responses tool calls
    this.responsesCallOrder.forEach((key) => {
      const tc = this.responsesCallMap.get(key);
      if (tc && !tc.done) {
        let params: unknown;
        try { params = JSON.parse(tc.args); } catch { params = {}; }
        final.push({ type: "tool-call", id: tc.id, name: tc.name, params } as any);
      }
    });

    const hasToolCalls = this.indexMap.size > 0 || this.responsesCallOrder.length > 0;
    final.push(makeFinishPart(hasToolCalls ? "tool-calls" : "stop", 0, 0));

    return final;
  }
}

const processSSEChunkToStreamPart = (
  data: string,
  acc: StreamAccumulator,
  useResponses: boolean,
): Response.StreamPartEncoded | null => {
  let parsed: unknown;
  try { parsed = JSON.parse(data); }
  catch { return null; }

  if (useResponses) {
    return acc.addResponsesEvent(parsed as ResponsesSSEEvent);
  }
  const wire = parsed as ChatCompletionsWire;
  const choice = wire.choices?.[0];
  if (choice?.delta) return acc.addChatCompletionsDelta(choice.delta);
  return null;
};

// ---------------------------------------------------------------------------
// Error mapping — internal → AiError
// ---------------------------------------------------------------------------

const mapError = (e: CopilotError): AiError.AiError =>
  Match.value(e).pipe(
    Match.tag("CopilotAuthError", () =>
      AiError.make({ module: "CopilotProvider", method: "auth", reason: new AiError.AuthenticationError({ kind: "Unknown" }) }),
    ),
    Match.tag("CopilotParseError", () =>
      AiError.make({ module: "CopilotProvider", method: "parse", reason: new AiError.InternalProviderError({ description: "Failed to parse LLM response" }) }),
    ),
    Match.tag("CopilotHttpError", (e) =>
      AiError.make({ module: "CopilotProvider", method: "http", reason: new AiError.UnknownError({ description: `HTTP ${e.status}: ${e.body}` }) }),
    ),
    Match.exhaustive,
  );

/** Ensure call_id stays within OpenAI's 64-char limit. */
const sanitizeCallId = (id: string): string =>
  id.length <= 64 ? id : id.slice(0, 64);

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
// CopilotLanguageModel — implements LanguageModel via LanguageModel.make()
// ---------------------------------------------------------------------------

export const CopilotLanguageModelLive = Layer.effect(LanguageModel.LanguageModel)(
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null);

    const exchangeToken = (oauthToken: string): Effect.Effect<TokenCache, CopilotAuthError | CopilotParseError> =>
      Effect.gen(function* () {
        const req = HttpClientRequest.get("https://api.github.com/copilot_internal/v2/token").pipe(
          HttpClientRequest.setHeaders({
            Authorization: `Token ${oauthToken}`,
            "User-Agent": "theseus-runtime/0.0.1",
            Accept: "application/json",
          }),
        );
        const res = yield* http.execute(req).pipe(Effect.mapError((cause) => new CopilotAuthError({ cause })));
        const body = yield* res.json.pipe(
          Effect.mapError((cause) => new CopilotParseError({ cause })),
        ) as Effect.Effect<{ token?: string; expires_at?: number }, CopilotParseError>;
        if (!body?.token) {
          return yield* Effect.fail(new CopilotAuthError({ cause: new Error(`Unexpected token response: ${JSON.stringify(body)}`) }));
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

    const buildRequest = (
      prompt: Prompt.Prompt,
      tools: ReadonlyArray<AiTool.Any>,
      streaming: boolean,
    ): Effect.Effect<
      { req: HttpClientRequest.HttpClientRequest; useResponses: boolean },
      CopilotAuthError | CopilotParseError
    > =>
      Effect.gen(function* () {
        const model = Config.model;
        const maxTokens = Config.maxTokens;
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

        const body: Record<string, unknown> = useResponses
          ? {
              model,
              input: promptToResponsesInput(prompt),
              max_output_tokens: maxTokens,
              stream: streaming,
              ...(tools.length > 0 ? { tools: aiToolsToResponsesTools(tools) } : {}),
            }
          : {
              model,
              messages: promptToChatCompletions(prompt),
              max_tokens: maxTokens,
              stream: streaming,
              ...(tools.length > 0 ? { tools: aiToolsToChatCompletionsTools(tools) } : {}),
            };

        const endpoint = useResponses
          ? "https://api.githubcopilot.com/responses"
          : "https://api.githubcopilot.com/chat/completions";

        const req = HttpClientRequest.post(endpoint).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyJsonUnsafe(body),
        );

        return { req, useResponses };
      });

    const executeRequest = (req: HttpClientRequest.HttpClientRequest) =>
      Effect.gen(function* () {
        const res = yield* http.execute(req).pipe(
          Effect.mapError((cause) => new CopilotHttpError({ status: 0, body: String(cause) })),
        );
        if (res.status !== 200) {
          const text = yield* res.text.pipe(Effect.mapError((cause) => new CopilotParseError({ cause })));
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

          return useResponses
            ? parseResponsesResponseToResponseParts(data as ResponsesWire)
            : parseChatCompletionsToResponseParts(data as ChatCompletionsWire);
        }).pipe(Effect.mapError(mapError)),

      streamText: (options: LanguageModel.ProviderOptions) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { req, useResponses } = yield* buildRequest(options.prompt, options.tools, true);
            const res = yield* executeRequest(req);
            const acc = new StreamAccumulator();

            const sseLines = parseSSELines(
              Stream.mapError(res.stream, () => new CopilotHttpError({ status: 0, body: "Stream read error" })),
            );

            return sseLines.pipe(
              Stream.mapError(mapError),
              Stream.map((data) => processSSEChunkToStreamPart(data, acc, useResponses)),
              Stream.filter((c): c is Response.StreamPartEncoded => c !== null),
              Stream.concat(
                Stream.fromIterable(acc.buildFinalParts()),
              ),
            );
          }).pipe(Effect.mapError(mapError)),
        ),
    });
  }),
).pipe(Layer.provide(BunHttpClient.layer));
