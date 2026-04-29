import { Data, Match } from "effect";
import * as AiError from "effect/unstable/ai/AiError";
import { mapProviderHttpError } from "../http-error-mapping.ts";

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
      mapProviderHttpError({
        module: "CopilotProvider",
        status: error.status,
        body: error.body,
      }),
    ),
    Match.exhaustive,
  );
