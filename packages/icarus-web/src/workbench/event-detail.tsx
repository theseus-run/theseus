import { Button } from "@/components/ui/button";
import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import type { DispatchEventEntry } from "@/lib/rpc-client";
import { MissingSheet } from "./missing-sheet";
import { eventLine, eventTitle, isReportPacket } from "./projection";
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
          <p className="eyebrow">compact</p>
          <pre className="payload-block">{eventLine(entry.event)}</pre>
        </SheetSection>
        <SheetSection>
          <p className="eyebrow">event</p>
          <pre className="payload-block">{JSON.stringify(entry.event, null, 2)}</pre>
        </SheetSection>
      </SheetBody>
    </>
  );
}
