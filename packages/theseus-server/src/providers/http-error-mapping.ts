import { Match } from "effect";
import * as AiError from "effect/unstable/ai/AiError";

export interface ProviderHttpErrorInput {
  readonly module: string;
  readonly status: number;
  readonly body: string;
}

const descriptionFor = (status: number, body: string): string => `HTTP ${status}: ${body}`;

const isServerFailure = (status: number): boolean => status >= 500 && status <= 599;

const reasonForStatus = (status: number, description: string): AiError.AiErrorReason =>
  Match.value(status).pipe(
    Match.when(0, () => new AiError.InternalProviderError({ description })),
    Match.when(401, () => new AiError.AuthenticationError({ kind: "InvalidKey" })),
    Match.when(403, () => new AiError.AuthenticationError({ kind: "InsufficientPermissions" })),
    Match.when(402, () => new AiError.QuotaExhaustedError({})),
    Match.when(429, () => new AiError.RateLimitError({})),
    Match.whenOr(400, 422, () => new AiError.InvalidRequestError({ description })),
    Match.when(isServerFailure, () => new AiError.InternalProviderError({ description })),
    Match.orElse(() => new AiError.UnknownError({ description })),
  );

export const mapProviderHttpError = ({
  module,
  status,
  body,
}: ProviderHttpErrorInput): AiError.AiError => {
  const description = descriptionFor(status, body);
  return AiError.make({
    module,
    method: "http",
    reason: reasonForStatus(status, description),
  });
};
