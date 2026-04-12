/**
 * Layout — full-screen terminal layout for icarus.
 *
 * Three zones: header (1 line), viewport (fills remaining), input (2 lines).
 * Uses useStdout to get terminal dimensions and fills the screen.
 */

import { Box, Text, useStdout, useInput } from "ink";
import { useState, useMemo, useRef } from "react";
import { colors, border } from "./theme.ts";
import type { ChatLine } from "./store.ts";

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({ agent, iteration, running }: {
  agent: string;
  iteration: number;
  running: boolean;
}) => {
  const status = running
    ? `${agent || "..."} iter ${iteration}`
    : "idle";

  return (
    <Box>
      <Text color={colors.header} bold> icarus </Text>
      <Text color={colors.border}>{border.vertical}</Text>
      <Text color={colors.headerDim}> {status} </Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const Separator = ({ width }: { width: number }) => (
  <Box>
    <Text color={colors.border}>{border.horizontal.repeat(width)}</Text>
  </Box>
);

// ---------------------------------------------------------------------------
// Viewport — scrollable message area
// ---------------------------------------------------------------------------

const Viewport = ({ lines, height, width }: {
  lines: ReadonlyArray<ChatLine>;
  height: number;
  width: number;
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);

  // Auto-scroll: pin to bottom unless user scrolled up
  const pinRef = useRef(true);

  // Calculate visible window
  const renderedLines = useMemo(() => renderLines(lines, width), [lines, width]);
  const totalLines = renderedLines.length;
  const viewHeight = Math.max(1, height);
  const maxOffset = Math.max(0, totalLines - viewHeight);

  // If pinned, always snap to bottom
  if (pinRef.current) {
    // Sync scrollOffset to maxOffset so unpinning starts from the right place
    if (scrollOffset !== maxOffset) setScrollOffset(maxOffset);
  }

  const effectiveOffset = pinRef.current ? maxOffset : Math.min(scrollOffset, maxOffset);
  const visibleLines = renderedLines.slice(effectiveOffset, effectiveOffset + viewHeight);

  useInput((_ch, key) => {
    if (key.upArrow || key.pageUp) {
      const amount = key.pageUp ? viewHeight : 1;
      pinRef.current = false;
      setScrollOffset((prev) => Math.max(0, prev - amount));
    } else if (key.downArrow || key.pageDown) {
      const amount = key.pageDown ? viewHeight : 1;
      setScrollOffset((prev) => {
        const next = prev + amount;
        if (next >= maxOffset) {
          pinRef.current = true;
          return maxOffset;
        }
        return next;
      });
    }
  });

  // Fill viewport: content lines + empty padding to exact height
  const rows: string[] = [];
  for (let i = 0; i < viewHeight; i++) {
    rows.push(i < visibleLines.length ? (visibleLines[i] ?? "") : "");
  }

  return (
    <Box flexDirection="column" height={viewHeight}>
      {rows.map((row, i) => (
        <Text key={effectiveOffset + i}>{row || " "}</Text>
      ))}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Line rendering — convert ChatLines to displayable strings
// ---------------------------------------------------------------------------

const truncate = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

const renderLines = (lines: ReadonlyArray<ChatLine>, width: number): string[] => {
  const result: string[] = [];
  for (const line of lines) {
    const raw = chatLineToString(line);
    // Word-wrap long lines
    const wrapped = wrapText(raw, Math.max(20, width - 2));
    result.push(...wrapped);
  }
  return result;
};

const chatLineToString = (line: ChatLine): string => {
  switch (line.kind) {
    case "user":
      return `> ${line.text}`;
    case "assistant":
      return line.text;
    case "system":
      return `[system] ${line.text}`;
    case "event":
      return eventToString(line.event);
  }
};

import { Match } from "effect";
import type * as Dispatch from "@theseus.run/core/Dispatch";

const eventToString = (event: Dispatch.Event): string =>
  Match.value(event).pipe(
    Match.tag("Calling", (e) => `[${e.agent} #${e.iteration}] calling LLM...`),
    Match.tag("TextDelta", () => ""),
    Match.tag("ThinkingDelta", () => ""),
    Match.tag("Thinking", () => ""),
    Match.tag("ToolCalling", (e) => `[${e.agent}] -> ${e.tool}(${truncate(JSON.stringify(e.args), 80)})`),
    Match.tag("ToolResult", (e) => `[${e.agent}] <- ${e.tool}: ${truncate(e.content, 100)}`),
    Match.tag("ToolError", (e) => `[${e.agent}] !! ${e.tool}: ${e.error._tag}`),
    Match.tag("SatelliteAction", (e) => `[${e.agent}] * ${e.satellite}: ${e.action}`),
    Match.tag("Injected", (e) => `[${e.agent}] << ${e.injection}${e.detail ? `: ${truncate(e.detail, 80)}` : ""}`),
    Match.tag("Done", (e) => `[${e.agent}] done -- ${e.result.result}`),
    Match.exhaustive,
  );

const wrapText = (text: string, width: number): string[] => {
  if (width <= 0) return [text];
  const lines: string[] = [];
  // Split on newlines first
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= width) {
      lines.push(rawLine);
    } else {
      // Hard wrap at width
      let remaining = rawLine;
      while (remaining.length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      lines.push(remaining);
    }
  }
  return lines;
};

// ---------------------------------------------------------------------------
// InputBar
// ---------------------------------------------------------------------------

const InputBar = ({ value, onChange, onSubmit }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) => {
  useInput((ch, key) => {
    if (key.return) {
      onSubmit();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (ch && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown) {
      onChange(value + ch);
    }
  });

  return (
    <Box>
      <Text color={colors.prompt} bold>{"> "}</Text>
      <Text>{value || ""}</Text>
      <Text color={colors.textDim}>{"█"}</Text>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Layout — assembles everything
// ---------------------------------------------------------------------------

interface LayoutProps {
  lines: ReadonlyArray<ChatLine>;
  agent: string;
  iteration: number;
  running: boolean;
  result: { result: string } | null;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
}

const Layout = (props: LayoutProps) => {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  // Reserve: header(1) + sep(1) + sep(1) + input(1) = 4 lines
  const viewportHeight = Math.max(1, height - 4);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header agent={props.agent} iteration={props.iteration} running={props.running} />
      <Separator width={width} />
      <Viewport lines={props.lines} height={viewportHeight} width={width} />
      <Separator width={width} />
      <InputBar value={props.input} onChange={props.onInputChange} onSubmit={props.onSubmit} />
    </Box>
  );
};

export default Layout;
