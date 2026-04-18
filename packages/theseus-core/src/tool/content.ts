/**
 * Content — multimodal wire format for tool responses.
 *
 * Shape matches MCP (Model Context Protocol) content blocks. This gives us
 * free interop with MCP servers (both consuming MCP tools and exposing
 * Theseus tools as an MCP server) and a neutral format that every major
 * LLM provider can translate to its own representation.
 *
 * Presentation is what callTool returns — content seen by the LLM, plus
 * an optional display variant for the UI and an optional structured field
 * for strict-mode structured outputs.
 */

// ---------------------------------------------------------------------------
// Content — individual blocks
// ---------------------------------------------------------------------------

/** Plain text content — the common case. */
export interface TextContent {
  readonly _tag: "text";
  readonly text: string;
}

/** Inline image — base64-encoded with a MIME type. */
export interface ImageContent {
  readonly _tag: "image";
  readonly mime: string;
  readonly data: string;
}

/** Inline audio — base64-encoded with a MIME type. */
export interface AudioContent {
  readonly _tag: "audio";
  readonly mime: string;
  readonly data: string;
}

/** Reference to an external resource by URI. */
export interface ResourceContent {
  readonly _tag: "resource";
  readonly uri: string;
  readonly mime?: string;
  readonly text?: string;
}

/** Multimodal content block. */
export type Content = TextContent | ImageContent | AudioContent | ResourceContent;

// ---------------------------------------------------------------------------
// Presentation — the full response shape returned by callTool
// ---------------------------------------------------------------------------

/**
 * The outcome of running a tool, ready to cross the LLM and UI boundaries.
 *
 * `content`    — what the LLM sees in the tool-result message
 * `display`    — what the UI renders (defaults to `content` when absent)
 * `structured` — strict-mode structured output (typed when `tool.output` is set)
 * `isError`    — marks tool failures that should be surfaced to the LLM as errors
 */
export interface Presentation {
  readonly content: ReadonlyArray<Content>;
  readonly display?: ReadonlyArray<Content>;
  readonly structured?: unknown;
  readonly isError?: boolean;
}

// ---------------------------------------------------------------------------
// Smart constructors
// ---------------------------------------------------------------------------

export const text = (text: string): TextContent => ({ _tag: "text", text });

export const image = (mime: string, data: string): ImageContent => ({
  _tag: "image",
  mime,
  data,
});

export const audio = (mime: string, data: string): AudioContent => ({
  _tag: "audio",
  mime,
  data,
});

export const resource = (
  uri: string,
  opts?: { readonly mime?: string; readonly text?: string },
): ResourceContent => ({
  _tag: "resource",
  uri,
  ...(opts?.mime !== undefined ? { mime: opts.mime } : {}),
  ...(opts?.text !== undefined ? { text: opts.text } : {}),
});

/** Build a Presentation from a single text block — the 80% case. */
export const textPresentation = (
  s: string,
  opts?: { readonly isError?: boolean; readonly structured?: unknown },
): Presentation => ({
  content: [text(s)],
  ...(opts?.isError ? { isError: true } : {}),
  ...(opts?.structured !== undefined ? { structured: opts.structured } : {}),
});
