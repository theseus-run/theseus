import { describe, expect, test } from "bun:test";
import { rpcRequestPayload } from "./rpc-client";

describe("rpcRequestPayload", () => {
  test("encodes void RPC payloads as null instead of omitting payload", () => {
    expect(rpcRequestPayload(undefined)).toBeNull();
  });

  test("preserves explicit request payload objects", () => {
    const payload = { limit: 50 };
    expect(rpcRequestPayload(payload)).toBe(payload);
  });
});
