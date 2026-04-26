import { Schema } from "effect";

export const encodeJson = (value: unknown): string =>
  Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(value);

export const decodeJson = (text: string): unknown =>
  Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text);
