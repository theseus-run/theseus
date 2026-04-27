import { Data, Match } from "effect";
import * as AiError from "effect/unstable/ai/AiError";

export class OpenAIAuthError extends Data.TaggedError("OpenAIAuthError")<{
  readonly cause?: unknown;
}> {}

export class OpenAIHttpError extends Data.TaggedError("OpenAIHttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

export class OpenAIParseError extends Data.TaggedError("OpenAIParseError")<{
  readonly cause?: unknown;
}> {}

export class OpenAIEncodeError extends Data.TaggedError("OpenAIEncodeError")<{
  readonly cause?: unknown;
}> {}

export type OpenAIError = OpenAIAuthError | OpenAIHttpError | OpenAIParseError | OpenAIEncodeError;

const authKind = (cause: unknown): AiError.AuthenticationError["kind"] =>
  cause === "OPENAI_API_KEY is not set" ? "MissingKey" : "Unknown";

export const mapOpenAIError = (e: OpenAIError): AiError.AiError =>
  Match.value(e).pipe(
    Match.tag("OpenAIAuthError", (error) =>
      AiError.make({
        module: "OpenAIProvider",
        method: "auth",
        reason: new AiError.AuthenticationError({ kind: authKind(error.cause) }),
      }),
    ),
    Match.tag("OpenAIParseError", () =>
      AiError.make({
        module: "OpenAIProvider",
        method: "parse",
        reason: new AiError.InternalProviderError({ description: "Failed to parse LLM response" }),
      }),
    ),
    Match.tag("OpenAIEncodeError", () =>
      AiError.make({
        module: "OpenAIProvider",
        method: "encode",
        reason: new AiError.InternalProviderError({ description: "Failed to encode LLM request" }),
      }),
    ),
    Match.tag("OpenAIHttpError", (error) =>
      AiError.make({
        module: "OpenAIProvider",
        method: "http",
        reason: new AiError.UnknownError({
          description: `HTTP ${error.status}: ${error.body}`,
        }),
      }),
    ),
    Match.exhaustive,
  );
