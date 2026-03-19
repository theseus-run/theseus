/**
 * Icarus CLI — root Ink application.
 *
 * Exports <App> which handles:
 *   - Static scrollback event log (logs, tool calls, forge responses)
 *   - AgentDiagram — sticky mermaid-inspired routing graph with live status
 *   - Interactive input line (useInput → Enter to submit)
 *
 * All display state comes from EventStore via useSyncExternalStore.
 * The only local state is the current input string.
 *
 * Props:
 *   store     — EventStore instance (drained by Effect fiber in icarus.tsx)
 *   onCommand — called when user submits input or a /command
 */

import type { NodeStatus, RuntimeCommand, UIEvent } from "@theseus.run/runtime";
import { Box, Static, Text, useApp, useInput } from "ink";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { AgentSnapshot, EventStore } from "./store.ts";

// ── helpers ──────────────────────────────────────────────────────────────────

type LogLevel = Extract<UIEvent, { _tag: "Log" }>["level"];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ── EventRow ─────────────────────────────────────────────────────────────────

function EventRow({ event }: { readonly event: UIEvent }) {
  if (event._tag === "Log") {
    const levelColor: Record<LogLevel, string | undefined> = {
      info: undefined,
      warn: "yellow",
      error: "red",
    };
    const color = levelColor[event.level];
    return (
      <Box>
        <Text dimColor>{fmtTime(event.ts)} </Text>
        <Text color="cyan" bold>
          [{event.agent}]
        </Text>
        <Text {...(color !== undefined ? { color } : {})}> {event.message}</Text>
      </Box>
    );
  }

  if (event._tag === "ToolCall") {
    return (
      <Box>
        <Text dimColor>{fmtTime(event.ts)} </Text>
        <Text color="yellow"> → </Text>
        <Text color="cyan" bold>
          {event.tool}
        </Text>
        <Text dimColor>({clip(event.args, 55)})</Text>
      </Box>
    );
  }

  if (event._tag === "ToolResult") {
    return (
      <Box>
        <Text dimColor>{fmtTime(event.ts)} </Text>
        <Text color={event.ok ? "green" : "red"}> ← </Text>
        <Text dimColor={event.ok} {...(!event.ok ? { color: "red" } : {})}>
          {clip(event.preview, 70)}
        </Text>
      </Box>
    );
  }

  if (event._tag === "AgentResponse") {
    const bar = "─".repeat(64);
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>{bar}</Text>
        <Text color="magenta" bold>
          {" "}
          {event.agentId} › {event.taskId}
        </Text>
        <Text dimColor>{bar}</Text>
        <Box paddingLeft={1}>
          <Text>{event.content}</Text>
        </Box>
        <Text dimColor>{bar}</Text>
      </Box>
    );
  }

  if (event._tag === "TheseusResponse") {
    const bar = "─".repeat(64);
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={1}>
        <Text dimColor>{bar}</Text>
        <Text color="cyan" bold>
          {" "}
          theseus
        </Text>
        <Text dimColor>{bar}</Text>
        <Box paddingLeft={1}>
          <Text>{event.content}</Text>
        </Box>
        <Text dimColor>{bar}</Text>
      </Box>
    );
  }

  return null;
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ snap }: { readonly snap?: AgentSnapshot }) {
  const status: NodeStatus = snap?.status ?? "starting";
  const dot = status === "working" ? "●" : status === "idle" ? "○" : "·";
  const color = status === "working" ? "yellow" : status === "idle" ? "green" : "gray";
  return (
    <Box>
      <Text color={color}>
        {dot} {status}
      </Text>
      {snap?.currentTask && <Text dimColor> {snap.currentTask}</Text>}
    </Box>
  );
}

// ── AgentDiagram ─────────────────────────────────────────────────────────────
//
// Vertical tree that scales to N leaf agents:
//
//   ── agents ────────────────────────────────────────────────────────
//    you
//    └──▶ theseus     ○ idle
//         └──▶ forge-1  ● working  task-001
//         └──▶ planner  · starting          (future)
//   ──────────────────────────────────────────────────────────────────

function AgentDiagram({ agents }: { readonly agents: ReadonlyMap<string, AgentSnapshot> }) {
  const theseus = agents.get("theseus");
  // Leaf agents = everything except theseus, ordered by id for stable rendering
  const leafNodes = [...agents.values()]
    .filter((a) => a.id !== "theseus")
    .sort((a, b) => a.id.localeCompare(b.id));

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>── agents </Text>
        <Text dimColor>{"─".repeat(55)}</Text>
      </Box>
      <Box flexDirection="column" paddingLeft={1}>
        {/* root: user */}
        <Text color="green" bold>
          you
        </Text>

        {/* theseus row */}
        <Box>
          <Text dimColor>└──▶ </Text>
          <Text color="cyan" bold>
            theseus{" "}
          </Text>
          <StatusBadge {...(theseus !== undefined ? { snap: theseus } : {})} />
        </Box>

        {/* leaf agents */}
        {leafNodes.map((node, i) => {
          const isLast = i === leafNodes.length - 1;
          const branch = isLast ? "└" : "├";
          return (
            <Box key={node.id}>
              <Text dimColor> {branch}──▶ </Text>
              <Text color="magenta" bold>
                {node.id}{" "}
              </Text>
              <StatusBadge snap={node} />
            </Box>
          );
        })}
      </Box>
      <Text dimColor>{"─".repeat(64)}</Text>
    </Box>
  );
}

// ── InputLine ─────────────────────────────────────────────────────────────────

function InputLine({ value, ready }: { readonly value: string; readonly ready: boolean }) {
  const isCmd = value.startsWith("/");
  return (
    <Box paddingLeft={1}>
      <Text color={isCmd ? "magenta" : "green"} bold>
        {ready ? "›" : " "}{" "}
      </Text>
      <Text {...(isCmd ? { color: "magenta" as const } : {})}>{value}</Text>
      <Text inverse> </Text>
      {!ready && <Text dimColor> (starting…)</Text>}
    </Box>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export interface AppProps {
  readonly store: EventStore;
  readonly onCommand: (cmd: RuntimeCommand) => void;
}

export function App({ store, onCommand }: AppProps) {
  const { events, agents } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [input, setInput] = useState("");
  const { exit } = useApp();

  const theseus = agents.get("theseus");
  const ready = theseus?.status !== "starting";

  // ── Command handler ─────────────────────────────────────────────────────────

  const handleCommand = useCallback(
    (raw: string) => {
      const [cmd, ...args] = raw.slice(1).trim().split(/\s+/);
      switch (cmd) {
        case "exit":
          onCommand({ _tag: "Stop" });
          exit();
          break;
        case "steer": {
          const guidance = args.join(" ").trim();
          if (!guidance) {
            store.push({
              _tag: "Log",
              level: "warn",
              agent: "icarus",
              message: "usage: /steer <guidance>",
              ts: Date.now(),
            });
          } else {
            store.push({
              _tag: "Log",
              level: "info",
              agent: "you",
              message: `[steer] ${guidance}`,
              ts: Date.now(),
            });
            onCommand({ _tag: "Steer", guidance });
          }
          break;
        }
        default:
          store.push({
            _tag: "Log",
            level: "warn",
            agent: "icarus",
            message: `unknown command: /${cmd ?? ""}${args.length ? ` ${args.join(" ")}` : ""}  (try /exit, /steer <guidance>)`,
            ts: Date.now(),
          });
      }
    },
    [exit, onCommand, store],
  );

  // Only activate keyboard input when running in an interactive TTY.
  const isTTY = process.stdin.isTTY ?? false;

  useInput(
    (char, key) => {
      if (key.ctrl && char === "c") {
        onCommand({ _tag: "Stop" });
        exit();
        return;
      }
      if (!ready) return;
      if (key.return) {
        const trimmed = input.trim();
        if (trimmed.startsWith("/")) {
          handleCommand(trimmed);
        } else if (trimmed) {
          store.push({
            _tag: "Log",
            level: "info",
            agent: "you",
            message: trimmed,
            ts: Date.now(),
          });
          onCommand({ _tag: "Dispatch", instruction: trimmed });
        }
        setInput("");
        return;
      }
      if (key.backspace || key.delete) {
        setInput((s) => s.slice(0, -1));
        return;
      }
      if (!(key.ctrl || key.meta) && char) {
        setInput((s) => s + char);
      }
    },
    { isActive: isTTY },
  );

  // Filter StatusChange events from the scrollback — they are display state only.
  const displayEvents = (events as UIEvent[]).filter((e) => e._tag !== "StatusChange");

  return (
    <Box flexDirection="column">
      <Static items={displayEvents}>{(event, i) => <EventRow key={i} event={event} />}</Static>
      <AgentDiagram agents={agents} />
      <InputLine value={input} ready={ready} />
    </Box>
  );
}
