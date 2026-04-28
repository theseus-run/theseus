import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import { MissingSheet } from "./missing-sheet";
import { finalTextFromEvents, modelLabel, reportFromEvents, stateTone } from "./projection";
import { DispatchTranscriptView } from "./transcript";
import type { DispatchTranscript, WorkbenchState } from "./types";

export function DispatchSheet({
  missionId,
  dispatch,
  transcript,
  onOpenEvent,
  onOpenCortex,
}: {
  readonly missionId: string;
  readonly dispatch: WorkbenchState["dispatches"][number] | undefined;
  readonly transcript: DispatchTranscript | undefined;
  readonly onOpenEvent: (missionId: string, dispatchId: string, eventIndex: number) => void;
  readonly onOpenCortex: (missionId: string, dispatchId: string, iteration: number) => void;
}) {
  if (dispatch === undefined) return <MissingSheet title="Dispatch" />;
  const report = transcript === undefined ? undefined : reportFromEvents(transcript.events);
  const final = transcript === undefined ? undefined : finalTextFromEvents(transcript.events);
  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>{dispatch.name}</SheetTitle>
          <SheetMeta>
            <Token>{dispatch.dispatchId}</Token>
            <Token tone={stateTone(dispatch.state)}>{dispatch.state}</Token>
            <Token>{modelLabel(dispatch)}</Token>
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        {final !== undefined && (
          <SheetSection>
            <p className="eyebrow">final</p>
            <p className="whitespace-pre-wrap">{final}</p>
          </SheetSection>
        )}
        {report !== undefined && (
          <SheetSection>
            <p className="eyebrow">structured report</p>
            <p>{report._tag === "Reported" ? report.report?.summary : report.salvage?.summary}</p>
            <pre className="payload-block mt-[calc(var(--lh)/2)]">
              {report._tag === "Reported" ? report.report?.content : report.salvage?.content}
            </pre>
          </SheetSection>
        )}
        <SheetSection>
          <p className="eyebrow">transcript</p>
          <DispatchTranscriptView
            missionId={missionId}
            dispatchId={dispatch.dispatchId}
            transcript={transcript}
            onOpenEvent={onOpenEvent}
            onOpenCortex={onOpenCortex}
          />
        </SheetSection>
      </SheetBody>
    </>
  );
}
