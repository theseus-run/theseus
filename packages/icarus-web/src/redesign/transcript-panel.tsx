import {
  Transcript,
  TranscriptRow,
  TranscriptRowBody,
  TranscriptRowMeta,
  TranscriptRowPrefix,
} from "@/components/ui/transcript";
import { ToolCallsList } from "./tool-calls-list";
import type { QueueRow, ToolCall, TranscriptFixtureRow } from "./types";

export function TranscriptFixturePanel({
  rows,
  toolCalls,
  onSelectTool,
}: {
  rows: TranscriptFixtureRow[];
  toolCalls: ToolCall[];
  onSelectTool: (toolId: string) => void;
}) {
  return (
    <Transcript>
      {rows.map((row) => (
        <TranscriptRow key={`${row.meta}-${row.body}`} variant={row.variant}>
          <TranscriptRowPrefix tone={row.tone}>{row.prefix}</TranscriptRowPrefix>
          <TranscriptRowBody>{row.body}</TranscriptRowBody>
          <TranscriptRowMeta>{row.meta}</TranscriptRowMeta>
        </TranscriptRow>
      ))}
      <ToolCallsList toolCalls={toolCalls} onSelect={onSelectTool} mode="command" />
    </Transcript>
  );
}

export function RuntimeTranscriptPanel({
  rows,
  toolCalls,
  onSelectTool,
}: {
  rows: QueueRow[];
  toolCalls: ToolCall[];
  onSelectTool: (toolId: string) => void;
}) {
  return (
    <Transcript>
      {rows.map((row) => (
        <TranscriptRow
          key={`${row.at}-${row.text}`}
          variant={
            row.source === "runtime" ? "runtime" : row.source === "review" ? "system" : "assistant"
          }
        >
          <TranscriptRowPrefix tone={row.tone}>→</TranscriptRowPrefix>
          <TranscriptRowBody>{row.text}</TranscriptRowBody>
          <TranscriptRowMeta>
            <span>{row.source}</span>
            <span aria-hidden="true">·</span>
            <span>{row.at}</span>
          </TranscriptRowMeta>
        </TranscriptRow>
      ))}
      <ToolCallsList toolCalls={toolCalls} onSelect={onSelectTool} mode="summary" />
    </Transcript>
  );
}
