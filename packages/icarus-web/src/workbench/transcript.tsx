import { Match } from "effect";
import type { DispatchEvent, DispatchEventEntry } from "@/lib/rpc-client";
import { eventGlyph, eventLine, eventTitle } from "./projection";
import type { DispatchTranscript } from "./types";

export function DispatchTranscriptView({
  missionId,
  dispatchId,
  transcript,
  onOpenEvent,
  onOpenCortex,
}: {
  readonly missionId: string;
  readonly dispatchId: string;
  readonly transcript: DispatchTranscript | undefined;
  readonly onOpenEvent: (missionId: string, dispatchId: string, eventIndex: number) => void;
  readonly onOpenCortex: (missionId: string, dispatchId: string, iteration: number) => void;
}) {
  if (transcript === undefined || transcript.events.length === 0) {
    return <div className="text-muted-foreground">-- no events --</div>;
  }
  return (
    <div className="runtime-transcript">
      {transcript.events.map((entry, index) => (
        <TranscriptEventRow
          key={`${entry.timestamp}:${entry.dispatchId}:${entry.event._tag}:${eventLine(entry.event).slice(0, 80)}`}
          missionId={missionId}
          dispatchId={dispatchId}
          entry={entry}
          eventIndex={index}
          onOpenEvent={onOpenEvent}
          onOpenCortex={onOpenCortex}
        />
      ))}
    </div>
  );
}

function TranscriptEventRow({
  missionId,
  dispatchId,
  entry,
  eventIndex,
  onOpenEvent,
  onOpenCortex,
}: {
  readonly missionId: string;
  readonly dispatchId: string;
  readonly entry: DispatchEventEntry;
  readonly eventIndex: number;
  readonly onOpenEvent: (missionId: string, dispatchId: string, eventIndex: number) => void;
  readonly onOpenCortex: (missionId: string, dispatchId: string, iteration: number) => void;
}) {
  const event = entry.event;
  const open = () =>
    Match.value(event).pipe(
      Match.when({ _tag: "CortexRendered" }, (value: DispatchEvent) =>
        value.iteration === undefined
          ? onOpenEvent(missionId, dispatchId, eventIndex)
          : onOpenCortex(missionId, dispatchId, value.iteration),
      ),
      Match.orElse(() => onOpenEvent(missionId, dispatchId, eventIndex)),
    );
  return (
    <button type="button" className={`runtime-transcript-row row-${event._tag}`} onClick={open}>
      <span className="runtime-transcript-prefix">{eventGlyph(event)}</span>
      <span className="runtime-transcript-body">
        <span className="runtime-transcript-meta">{eventTitle(event)}</span>
        <span className="runtime-transcript-content">{eventLine(event)}</span>
      </span>
    </button>
  );
}
