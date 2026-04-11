/**
 * App — interactive chat UI for theseus daemon.
 *
 * Renders a scrolling chat with user messages, agent events,
 * streaming text, and a text input line.
 */

import { useState } from "react";
import { Box, Text, Static, useInput } from "ink";
import { Match } from "effect";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import { useStore, type Store, type ChatLine } from "./store.ts";

// ---------------------------------------------------------------------------
// Event rendering
// ---------------------------------------------------------------------------

const EventLine = ({ event }: { event: Dispatch.Event }) => {
  const text = Match.value(event).pipe(
    Match.tag("Calling", (e) => `[${e.agent} #${e.iteration}] calling LLM...`),
    Match.tag("TextDelta", () => null),
    Match.tag("ThinkingDelta", () => null),
    Match.tag("Thinking", () => null),
    Match.tag("ToolCalling", (e) => `[${e.agent}] -> ${e.tool}(${truncate(JSON.stringify(e.args))})`),
    Match.tag("ToolResult", (e) => `[${e.agent}] <- ${e.tool}: ${truncate(e.content)}`),
    Match.tag("ToolError", (e) => `[${e.agent}] !! ${e.tool}: ${e.error._tag}`),
    Match.tag("SatelliteAction", (e) => `[${e.agent}] * ${e.satellite}: ${e.action}`),
    Match.tag("Injected", (e) => `[${e.agent}] << ${e.injection}${e.detail ? `: ${truncate(e.detail)}` : ""}`),
    Match.tag("Done", (e) => `[${e.agent}] done -- ${e.result.result}`),
    Match.exhaustive,
  );

  if (text === null) return null;

  const color = Match.value(event._tag).pipe(
    Match.when("Calling", () => "gray" as const),
    Match.when("ToolCalling", () => "cyan" as const),
    Match.when("ToolResult", () => "green" as const),
    Match.when("ToolError", () => "yellow" as const),
    Match.when("Done", () => "white" as const),
    Match.orElse(() => "gray" as const),
  );

  return <Text color={color}>{text}</Text>;
};

const ChatLineView = ({ line }: { line: ChatLine }) => {
  switch (line.kind) {
    case "user":
      return <Text color="blue" bold>{`> ${line.text}`}</Text>;
    case "assistant":
      return <Text>{line.text}</Text>;
    case "system":
      return <Text color="yellow" dimColor>{`[system] ${line.text}`}</Text>;
    case "event":
      return <EventLine event={line.event} />;
  }
};

const truncate = (s: string, max = 120) =>
  s.length > max ? `${s.slice(0, max)}...` : s;

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

interface AppProps {
  store: Store;
  onSubmit: (input: string) => void;
}

const App = ({ store, onSubmit }: AppProps) => {
  const state = useStore(store);
  const [input, setInput] = useState("");

  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      process.exit(0);
    }
    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (ch && !key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Scrollback — lines are pre-filtered in store, append-only */}
      <Static items={state.lines as ChatLine[]}>
        {(line) => (
          <Box key={line.id}>
            <ChatLineView line={line} />
          </Box>
        )}
      </Static>

      {/* Status bar */}
      <Box marginTop={1}>
        <Text dimColor>
          {state.running
            ? `${state.agent || "..."} iter ${state.iteration}`
            : state.result
              ? `done -- ${state.result.result} | /new for new session`
              : "ready | type a message to start"}
        </Text>
      </Box>

      {/* Input */}
      <Box>
        <Text bold color="blue">{"> "}</Text>
        <Text>{input}</Text>
        <Text dimColor>|</Text>
      </Box>
    </Box>
  );
};

export default App;
