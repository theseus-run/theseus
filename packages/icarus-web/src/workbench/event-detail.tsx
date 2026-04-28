import { Button } from "@/components/ui/button";
import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import type { DispatchEvent, DispatchEventEntry } from "@/lib/rpc-client";
import { MissingSheet } from "./missing-sheet";
import { PayloadView } from "./payload-view";
import { eventDetailLine, eventTitle, isReportPacket } from "./projection";
import type { WorkbenchRoute } from "./route-state";

export function EventSheet({
  target,
  entry,
  onOpenDispatch,
  onOpenCortex,
}: {
  readonly target: Extract<WorkbenchRoute, { readonly _tag: "DispatchEvent" }>;
  readonly entry: DispatchEventEntry | undefined;
  readonly onOpenDispatch: (missionId: string, dispatchId: string) => void;
  readonly onOpenCortex: (missionId: string, dispatchId: string, iteration: number) => void;
}) {
  if (entry === undefined) return <MissingSheet title="Dispatch Event" />;
  const structured = entry.event.structured;
  const reportPacket = isReportPacket(structured) ? structured : undefined;
  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>{eventTitle(entry.event)}</SheetTitle>
          <SheetMeta>
            <Token>{entry.event._tag}</Token>
            <Token>event {target.eventIndex}</Token>
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        {entry.event._tag === "CortexRendered" && entry.event.iteration !== undefined && (
          <SheetSection>
            <Button
              size="sm"
              onClick={() =>
                onOpenCortex(target.missionId, target.dispatchId, entry.event.iteration ?? 0)
              }
            >
              open cortex frame
            </Button>
          </SheetSection>
        )}
        {reportPacket !== undefined && (
          <SheetSection>
            <Button
              size="sm"
              onClick={() => onOpenDispatch(target.missionId, reportPacket.dispatchId)}
            >
              open child dispatch
            </Button>
          </SheetSection>
        )}
        <SheetSection>
          <p className="eyebrow">detail</p>
          <EventDetail event={entry.event} />
        </SheetSection>
        <SheetSection>
          <p className="eyebrow">event</p>
          <PayloadView value={entry.event} format="json" />
        </SheetSection>
      </SheetBody>
    </>
  );
}

function EventDetail({ event }: { readonly event: DispatchEvent }) {
  if (event._tag === "ToolCalling") {
    return (
      <div className="event-detail-grid">
        <DetailField label="tool" value={event.tool ?? "tool"} />
        <DetailBlock label="args" value={event.args} format="json" />
      </div>
    );
  }
  if (event._tag === "ToolResult") {
    return (
      <div className="event-detail-grid">
        <DetailField label="tool" value={event.tool ?? "tool"} />
        <DetailField label="status" value={event.isError ? "error" : "success"} />
        <DetailBlock label="content" value={event.content ?? ""} format="markdown" />
        {event.structured !== undefined && (
          <DetailBlock label="structured" value={event.structured} format="json" />
        )}
      </div>
    );
  }
  if (event._tag === "ToolError") {
    return (
      <div className="event-detail-grid">
        <DetailField label="tool" value={event.tool ?? "tool"} />
        <DetailBlock label="error" value={event.error} format="json" />
      </div>
    );
  }
  if (event._tag === "Text" || event._tag === "Done") {
    return <PayloadView value={eventDetailLine(event)} format="markdown" />;
  }
  return <PayloadView value={eventDetailLine(event)} format="text" />;
}

function DetailField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="event-detail-field">
      <span className="eyebrow">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  format,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly format: "json" | "markdown" | "text";
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <PayloadView value={value} format={format} />
    </div>
  );
}
