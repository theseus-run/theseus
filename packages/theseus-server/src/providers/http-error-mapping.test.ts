import { describe, expect, test } from "bun:test";
import { mapProviderHttpError } from "./http-error-mapping.ts";

const reasonTagFor = (status: number) =>
  mapProviderHttpError({
    module: "TestProvider",
    status,
    body: "provider failure",
  }).reason._tag;

describe("mapProviderHttpError", () => {
  test("maps auth HTTP failures to AuthenticationError", () => {
    expect(reasonTagFor(401)).toBe("AuthenticationError");
    expect(reasonTagFor(403)).toBe("AuthenticationError");
  });

  test("maps provider rate limits to retryable RateLimitError", () => {
    const error = mapProviderHttpError({
      module: "TestProvider",
      status: 429,
      body: "too many requests",
    });

    expect(error.reason._tag).toBe("RateLimitError");
    expect(error.isRetryable).toBe(true);
  });

  test("maps malformed requests to non-retryable InvalidRequestError", () => {
    const error = mapProviderHttpError({
      module: "TestProvider",
      status: 400,
      body: "bad request",
    });

    expect(error.reason._tag).toBe("InvalidRequestError");
    expect(error.isRetryable).toBe(false);
    expect(reasonTagFor(422)).toBe("InvalidRequestError");
  });

  test("maps provider and transport failures to retryable internal provider errors", () => {
    expect(reasonTagFor(0)).toBe("InternalProviderError");
    const error = mapProviderHttpError({
      module: "TestProvider",
      status: 503,
      body: "unavailable",
    });

    expect(error.reason._tag).toBe("InternalProviderError");
    expect(error.isRetryable).toBe(true);
  });
});
