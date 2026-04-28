import { Match } from "effect";
import type { DispatchEvent, DispatchEventEntry } from "@/lib/rpc-client";
import { PayloadView } from "./payload-view";
import { eventGlyph, eventLine, eventTitle } from "./projection";
import { RuntimeItem } from "./runtime-item";
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
    <RuntimeItem
      className={`runtime-transcript-row row-${event._tag}`}
      symbol={eventGlyph(event)}
      title={eventTitle(event)}
      summary={
        event._tag === "Text" ? (
          <PayloadView value={event.content ?? ""} format="markdown" surface="inline" />
        ) : (
          eventLine(event)
        )
      }
      onClick={open}
    />
  );
}
