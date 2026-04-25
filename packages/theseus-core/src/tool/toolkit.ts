/**
 * Toolkit — typed collection of tools with aggregated service requirements.
 *
 * Why Toolkit exists rather than passing `ReadonlyArray<ToolAny>` around:
 *
 * 1. **R aggregation**. A Toolkit's `R` is the union of all its tools'
 *    service requirements. Code consuming the toolkit sees that union.
 * 2. **Named lookup**. O(1) lookup by tool name via an internal map.
 * 3. **Provider caching hook**. Wire-format conversions (e.g. @effect/ai
 *    Toolkit, MCP tool list) can cache against the Toolkit instance.
 *
 *   import { makeToolkit } from "@theseus.run/core/Tool"
 *
 *   const toolkit = makeToolkit(readFile, writeFile, listDir)
 *   // toolkit: Toolkit<ReadFileDeps | WriteFileDeps | ListDirDeps>
 */

import type { Tool, ToolAny } from "./index.ts";
import type { ToolPolicy } from "./meta.ts";

// ---------------------------------------------------------------------------
// Type-level utilities
// ---------------------------------------------------------------------------

/** Extract service requirements R from a Tool type. */
export type ToolRequirements<T> = T extends Tool<infer _I, infer _O, infer _F, infer R> ? R : never;

// ---------------------------------------------------------------------------
// Toolkit<R>
// ---------------------------------------------------------------------------

export interface Toolkit<R = never> {
  readonly _tag: "Toolkit";
  /** All tools, in insertion order. */
  readonly tools: ReadonlyArray<ToolAny>;
  /** O(1) lookup by tool name. */
  readonly get: (name: string) => ToolAny | undefined;
  /** Phantom brand — the union of all tools' service requirements. Never set at runtime. */
  readonly _R?: R;
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

const buildIndex = (tools: ReadonlyArray<ToolAny>): Map<string, ToolAny> => {
  const m = new Map<string, ToolAny>();
  for (const t of tools) m.set(t.name, t);
  return m;
};

const buildToolkit = <R>(tools: ReadonlyArray<ToolAny>): Toolkit<R> => {
  const index = buildIndex(tools);
  return {
    _tag: "Toolkit",
    tools,
    get: (name) => index.get(name),
  };
};

/**
 * Build a Toolkit. R is inferred as the union of all tools' service requirements.
 */
export const makeToolkit = <const Tools extends ReadonlyArray<ToolAny>>(
  ...tools: Tools
): Toolkit<ToolRequirements<Tools[number]>> => buildToolkit<ToolRequirements<Tools[number]>>(tools);

/** The empty toolkit. Useful as a base for `merge`. */
export const emptyToolkit: Toolkit<never> = buildToolkit<never>([]);

// ---------------------------------------------------------------------------
// Combinators — all return new Toolkits (immutable)
// ---------------------------------------------------------------------------

/** Merge two toolkits. R is unioned. Later tools with the same name win. */
export const mergeToolkits = <R1, R2>(a: Toolkit<R1>, b: Toolkit<R2>): Toolkit<R1 | R2> => {
  const byName = new Map<string, ToolAny>();
  for (const t of a.tools) byName.set(t.name, t);
  for (const t of b.tools) byName.set(t.name, t);
  return buildToolkit<R1 | R2>([...byName.values()]);
};

/** Has a tool with this name? */
export const hasTool = (toolkit: Toolkit<unknown>, name: string): boolean =>
  toolkit.get(name) !== undefined;

/** All interaction levels present in the toolkit. */
export const interactions = (toolkit: Toolkit<unknown>): ReadonlySet<ToolPolicy["interaction"]> => {
  const out = new Set<ToolPolicy["interaction"]>();
  for (const t of toolkit.tools) out.add(t.policy.interaction);
  return out;
};
