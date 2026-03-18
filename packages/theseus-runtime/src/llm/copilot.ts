/**
 * CopilotProvider — Effect service for GitHub Copilot LLM access.
 *
 * Auth flow:
 *   1. Read oauth_token from ~/.config/github-copilot/apps.json
 *   2. Exchange → GET https://api.github.com/copilot_internal/v2/token
 *      returns { token: <bearer>, expires_at: <unix_seconds> }
 *   3. POST https://api.githubcopilot.com/chat/completions  (OpenAI-compat)
 *      with required Copilot headers
 *
 * Bearer tokens are cached and refreshed when within 60 s of expiry.
 */
import { Effect, Layer, Ref, ServiceMap } from "effect"
import { BunHttpClient } from "@effect/platform-bun"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import * as HttpClient from "effect/unstable/http/HttpClient"
import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { CopilotTokenError, LLMHttpError, LLMParseError } from "../errors.ts"
import { Config } from "../config.ts"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool"
  readonly content: string
  // Present when role === "assistant" and the model called tools
  readonly tool_calls?: ReadonlyArray<{
    readonly id: string
    readonly type: "function"
    readonly function: { readonly name: string; readonly arguments: string }
  }>
  // Present when role === "tool"
  readonly tool_call_id?: string
}

// OpenAI tool definition shape (passed verbatim to the API)
export interface ToolDefinition {
  readonly type: "function"
  readonly function: {
    readonly name: string
    readonly description: string
    readonly parameters: {
      readonly type: "object"
      readonly properties: Record<string, unknown>
      readonly required: ReadonlyArray<string>
    }
  }
}

export interface LLMToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string // raw JSON string from model
}

export interface ChatResponse {
  readonly content: string
  readonly model: string
  readonly finishReason: "stop" | "tool_calls" | string
  readonly toolCalls: ReadonlyArray<LLMToolCall>
  readonly usage: {
    readonly promptTokens: number
    readonly completionTokens: number
  }
}

// ---------------------------------------------------------------------------
// Internal token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  readonly bearer: string
  readonly expiresAt: number // unix seconds
}

// ---------------------------------------------------------------------------
// Helpers — read local Copilot credential file (synchronous, one-off)
// ---------------------------------------------------------------------------

const readOauthToken: Effect.Effect<string, CopilotTokenError> = Effect.try({
  try: () => {
    const path = join(homedir(), ".config", "github-copilot", "apps.json")
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(raw) as Record<string, { oauth_token?: string }>
    // Key is "github.com" in the standard install
    const entry = parsed["github.com"] ?? Object.values(parsed)[0]
    if (!entry?.oauth_token) {
      throw new Error("oauth_token not found in apps.json")
    }
    return entry.oauth_token
  },
  catch: (e) => new CopilotTokenError({ cause: e }),
})

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
    ) => Effect.Effect<ChatResponse, CopilotTokenError | LLMHttpError | LLMParseError>
  }
>()("CopilotProvider") {}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

export const CopilotProviderLive = Layer.effect(CopilotProvider)(
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient

    // Token cache — shared across concurrent callers
    const tokenCacheRef = yield* Ref.make<TokenCache | null>(null)

    /** Exchange an oauth_token for a short-lived Copilot bearer. */
    const exchangeToken = (oauthToken: string): Effect.Effect<TokenCache, CopilotTokenError | LLMParseError> =>
      Effect.gen(function* () {
        const req = HttpClientRequest.get(
          "https://api.github.com/copilot_internal/v2/token",
        ).pipe(
          HttpClientRequest.setHeaders({
            Authorization: `Token ${oauthToken}`,
            "User-Agent": "theseus-runtime/0.0.1",
            Accept: "application/json",
          }),
        )
        const res = yield* httpClient.execute(req).pipe(
          Effect.mapError((e) => new CopilotTokenError({ cause: e })),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (yield* res.json.pipe(
          Effect.mapError((e) => new LLMParseError({ cause: e })),
        )) as any
        if (!body?.token) {
          return yield* Effect.fail(
            new CopilotTokenError({ cause: new Error(`Unexpected token exchange response: ${JSON.stringify(body)}`) }),
          )
        }
        return { bearer: body.token as string, expiresAt: body.expires_at as number }
      })

    /** Return a valid bearer, re-exchanging if expired or within 60 s of expiry. */
    const getBearer = (): Effect.Effect<string, CopilotTokenError | LLMParseError> =>
      Effect.gen(function* () {
        const now = Math.floor(Date.now() / 1000)
        const cached = yield* Ref.get(tokenCacheRef)
        if (cached !== null && cached.expiresAt - now > 60) {
          return cached.bearer
        }
        const oauthToken = yield* readOauthToken
        const fresh = yield* exchangeToken(oauthToken)
        yield* Ref.set(tokenCacheRef, fresh)
        return fresh.bearer
      })

    return CopilotProvider.of({
      chat: (messages, options = {}) =>
        Effect.gen(function* () {
          const { model = Config.model, tools } = options
          const bearer = yield* getBearer()

          const reqBody: Record<string, unknown> = {
            model,
            messages: messages as Array<{ role: string; content: string }>,
            max_tokens: Config.maxTokens,
            stream: false,
          }
          if (tools && tools.length > 0) reqBody.tools = tools

          const req = HttpClientRequest.post(
            "https://api.githubcopilot.com/chat/completions",
          ).pipe(
            HttpClientRequest.setHeaders({
              Authorization: `Bearer ${bearer}`,
              "Content-Type": "application/json",
              "Editor-Version": "theseus-runtime/0.0.1",
              "Editor-Plugin-Version": "theseus-runtime/0.0.1",
              "Copilot-Integration-Id": "vscode-chat",
              Accept: "application/json",
            }),
            HttpClientRequest.bodyJsonUnsafe(reqBody),
          )

          const res = yield* httpClient.execute(req).pipe(
            Effect.mapError((e) => new LLMHttpError({ status: 0, body: String(e) })),
          )

          if (res.status !== 200) {
            const errText = yield* res.text.pipe(
              Effect.mapError((e) => new LLMParseError({ cause: e })),
            )
            return yield* Effect.fail(
              new LLMHttpError({ status: res.status, body: errText }),
            )
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = (yield* res.json.pipe(
            Effect.mapError((e) => new LLMParseError({ cause: e })),
          )) as any

          const choice = data?.choices?.[0]
          const message = choice?.message ?? {}
          const finishReason: string = choice?.finish_reason ?? "stop"
          const usage = data?.usage ?? {}

          // Parse tool_calls if present
          const toolCalls: ReadonlyArray<LLMToolCall> =
            (message.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }> | undefined)
              ?.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })) ?? []

          return {
            content: (message.content as string | null) ?? "",
            model: (data?.model as string | undefined) ?? model,
            finishReason,
            toolCalls,
            usage: {
              promptTokens: (usage.prompt_tokens as number | undefined) ?? 0,
              completionTokens: (usage.completion_tokens as number | undefined) ?? 0,
            },
          } satisfies ChatResponse
        }),
    })
  }),
).pipe(Layer.provide(BunHttpClient.layer))
