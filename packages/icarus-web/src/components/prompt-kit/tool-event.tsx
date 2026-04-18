/**
 * ToolEvent — collapsible card for a tool call + its result/error.
 * Accepts a MergedEvent where resultEvent carries the ToolResult or ToolError.
 *
 * Design rules:
 *  - All text uses --tool-fs (single size, no inline overrides)
 *  - font-mono everywhere in the block
 *  - colours only via --tool-* CSS vars
 *  - no icons
 *  - bracket notation: [done] [err] [...] [key: value]
 */

import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import type { MergedEvent } from "@/App";
import type { DispatchEvent } from "@/lib/rpc-client";
import { cn } from "@/lib/utils";

/** Narrowed type for tool-related events (ToolCalling, ToolResult, ToolError). */
type ToolMergedEvent = Extract<MergedEvent, { readonly tool: string }>;

import { TOOL_META } from "@theseus.run/tools/metadata";

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------

type ToolState = "calling" | "done" | "error";

function resolveState(event: ToolMergedEvent): ToolState {
  if (!event.resultEvent) return "calling";
  return event.resultEvent._tag === "ToolError" ? "error" : "done";
}

// ---------------------------------------------------------------------------
// Shared style constants (via CSS vars — no hardcoded sizes/colours)
// ---------------------------------------------------------------------------

const toolText = {
  fontSize: "var(--tool-fs)",
  fontFamily: "inherit", // body is already monospace
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getParamDescriptions(toolName: string): Record<string, string> {
  const meta = TOOL_META[toolName];
  if (!meta) return {};
  const schema = meta.inputSchema as {
    properties?: Record<string, { description?: string }>;
  };
  if (!schema.properties) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    if (v.description) result[k] = v.description;
  }
  return result;
}

function formatArgs(args: unknown): Array<[string, string]> {
  if (!args || typeof args !== "object") return [];
  return Object.entries(args as Record<string, unknown>).map(([k, v]) => [
    k,
    typeof v === "string" ? v : JSON.stringify(v),
  ]);
}

/** Truncate a value for the header hint. */
function truncVal(v: string, max = 36): string {
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

// ---------------------------------------------------------------------------
// Header row pieces
// ---------------------------------------------------------------------------

function StateBracket({ state }: { state: ToolState }) {
  if (state === "calling") {
    return <span style={{ ...toolText, color: "var(--tool-state-running)" }}>[…]</span>;
  }
  if (state === "done") {
    return <span style={{ ...toolText, color: "var(--tool-state-done)" }}>[done]</span>;
  }
  if (state === "error") {
    return <span style={{ ...toolText, color: "var(--tool-state-err)" }}>[err]</span>;
  }
  return null;
}

/** Collapsed arg hints rendered as [key: value] tokens. */
function ArgHints({ args }: { args: Array<[string, string]> }) {
  return (
    <>
      {args.map(([k, v]) => (
        <span
          key={k}
          style={{ ...toolText, color: "var(--tool-text-dim)" }}
          className="truncate hidden sm:inline"
        >
          [{k}: {truncVal(v)}]
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Expanded sections
// ---------------------------------------------------------------------------

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="px-3 py-1 border-b border-[var(--tool-border)]"
      style={{ background: "var(--tool-subheader-bg)" }}
    >
      <span
        style={{ ...toolText, color: "var(--tool-text-dim)", letterSpacing: "0.08em" }}
        className="uppercase"
      >
        {label}
      </span>
    </div>
  );
}

function InputSection({
  args,
  paramDescriptions,
}: {
  args: Array<[string, string]>;
  paramDescriptions: Record<string, string>;
}) {
  return (
    <div>
      <SectionLabel label="input" />
      <div className="px-3 py-2 space-y-1">
        {args.map(([k, v]) => (
          <div
            key={k}
            className="grid min-w-0"
            style={{ gridTemplateColumns: "auto 1fr", columnGap: "0.75rem" }}
          >
            <span
              style={{ ...toolText, color: "var(--tool-text-dim)" }}
              className="cursor-default shrink-0"
              title={paramDescriptions[k]}
            >
              {k}
            </span>
            <span style={{ ...toolText, color: "var(--tool-text)" }} className="break-all">
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputSection({ content }: { content: string }) {
  return (
    <div className="border-t border-[var(--tool-border)]">
      <SectionLabel label="output" />
      <div className="px-3 py-2">
        <pre
          style={{ ...toolText, color: "var(--tool-text)" }}
          className="whitespace-pre-wrap break-all max-h-48 overflow-y-auto"
        >
          {content}
        </pre>
      </div>
    </div>
  );
}

function ErrorSection({ error }: { error: { _tag?: string; message?: string } }) {
  return (
    <div className="border-t border-[var(--tool-border)]">
      <SectionLabel label="error" />
      <div className="px-3 py-2">
        <span style={{ ...toolText, color: "var(--tool-text-dim)" }}>{error._tag}</span>
        {error.message && (
          <span style={{ ...toolText, color: "var(--tool-state-err)" }} className="ml-2">
            {error.message}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ToolEvent({
  event,
  className,
}: {
  event: DispatchEvent;
  className?: string | undefined;
}) {
  const merged = event as MergedEvent;
  const [open, setOpen] = useState(false);

  // Satellite — narrowed by _tag
  if (merged._tag === "SatelliteAction") {
    return (
      <div className={cn("px-4 py-0.5", className)}>
        <div
          className="border-l-2 border-[var(--tool-border)] pl-2"
          style={{ ...toolText, color: "var(--tool-text-dim)" }}
        >
          {merged.satellite}: {merged.action}
        </div>
      </div>
    );
  }

  // Injected — narrowed by _tag
  if (merged._tag === "Injected") {
    return (
      <div className={cn("px-4 py-0.5", className)}>
        <div
          className="border-l-2 border-[var(--tool-border)] pl-2 flex gap-2"
          style={{ ...toolText, color: "var(--tool-text-dim)" }}
        >
          <span className="shrink-0">{merged.injection}</span>
          {merged.detail && <span className="truncate">{merged.detail}</span>}
        </div>
      </div>
    );
  }

  // Tool call card — after satellite/injected early returns, only tool events remain
  if (merged._tag !== "ToolCalling" && merged._tag !== "ToolResult" && merged._tag !== "ToolError")
    return null;
  const toolEvent = merged as ToolMergedEvent;
  const state = resolveState(toolEvent);
  const toolName = toolEvent.tool;
  const args = formatArgs("args" in toolEvent ? toolEvent.args : undefined);
  const paramDescriptions = getParamDescriptions(toolName);
  const result = toolEvent.resultEvent;
  const hasContent = args.length > 0 || !!result;

  return (
    <div className={cn("px-4 py-0.5", className)}>
      <Collapsible.Root open={open} onOpenChange={hasContent ? setOpen : () => {}}>
        <div
          className="border border-[var(--tool-border)]"
          style={{ borderRadius: "var(--tool-radius)" }}
        >
          {/* Header */}
          <Collapsible.Trigger asChild>
            <button
              type="button"
              disabled={!hasContent}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left",
                "transition-colors",
                hasContent && "hover:bg-[var(--tool-subheader-bg)] cursor-pointer",
                !hasContent && "cursor-default",
              )}
              style={{
                background: "var(--tool-header-bg)",
                borderRadius: open
                  ? "var(--tool-radius) var(--tool-radius) 0 0"
                  : "var(--tool-radius)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <span style={{ ...toolText, color: "var(--tool-text-name)" }} className="shrink-0">
                  {toolName}
                </span>
                <StateBracket state={state} />
                {!open && <ArgHints args={args} />}
              </div>
              {hasContent && (
                <span
                  style={{ ...toolText, color: "var(--tool-text-dim)" }}
                  className={cn("shrink-0 transition-transform duration-150", open && "rotate-180")}
                >
                  ▾
                </span>
              )}
            </button>
          </Collapsible.Trigger>

          {/* Body */}
          <Collapsible.Content className="overflow-hidden data-[state=open]:[animation:collapsible-down_150ms_ease] data-[state=closed]:[animation:collapsible-up_150ms_ease]">
            <div
              className="border-t border-[var(--tool-border)]"
              style={{
                background: "var(--tool-body-bg)",
                borderRadius: "0 0 var(--tool-radius) var(--tool-radius)",
              }}
            >
              {args.length > 0 && (
                <InputSection args={args} paramDescriptions={paramDescriptions} />
              )}
              {result?._tag === "ToolResult" && result.content && (
                <OutputSection content={result.content} />
              )}
              {result?._tag === "ToolError" && result.error && (
                <ErrorSection error={result.error as { _tag?: string; message?: string }} />
              )}
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
    </div>
  );
}
