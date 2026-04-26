import { Data, Match } from "effect";
import * as AiError from "effect/unstable/ai/AiError";

export class CopilotAuthError extends Data.TaggedError("CopilotAuthError")<{
  readonly cause?: unknown;
}> {}

export class CopilotHttpError extends Data.TaggedError("CopilotHttpError")<{
  readonly status: number;
  readonly body: string;
}> {}

export class CopilotParseError extends Data.TaggedError("CopilotParseError")<{
  readonly cause?: unknown;
}> {}

export class CopilotEncodeError extends Data.TaggedError("CopilotEncodeError")<{
  readonly cause?: unknown;
}> {}

export type CopilotError =
  | CopilotAuthError
  | CopilotHttpError
  | CopilotParseError
  | CopilotEncodeError;

export const mapCopilotError = (e: CopilotError): AiError.AiError =>
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
    Match.tag("CopilotHttpError", (error) =>
      AiError.make({
        module: "CopilotProvider",
        method: "http",
        reason: new AiError.UnknownError({
          description: `HTTP ${error.status}: ${error.body}`,
        }),
      }),
    ),
    Match.exhaustive,
  );
