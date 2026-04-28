import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import type { CortexSignal, DispatchEventEntry } from "@/lib/rpc-client";
import { MissingSheet } from "./missing-sheet";
import type { WorkbenchRoute } from "./route-state";

export function CortexFrameSheet({
  target,
  entry,
  onOpenSignal,
}: {
  readonly target: {
    readonly missionId: string;
    readonly dispatchId: string;
    readonly iteration: number;
  };
  readonly entry: DispatchEventEntry | undefined;
  readonly onOpenSignal: (
    missionId: string,
    dispatchId: string,
    iteration: number,
    signalId: string,
  ) => void;
}) {
  if (entry === undefined) return <MissingSheet title="Cortex Frame" />;
  const signals = entry.event.signals ?? [];
  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>Cortex frame {target.iteration}</SheetTitle>
          <SheetMeta>
            <Token>{signals.length} signals</Token>
            <Token>{entry.event.historyMessageCount ?? 0} history msg</Token>
            <Token>{entry.event.promptMessageCount ?? 0} prompt msg</Token>
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        <SheetSection>
          <div className="prompt-composition">
            <span>ctx:{entry.event.cortexMessageCount ?? 0}</span>
            <span>history:{entry.event.historyMessageCount ?? 0}</span>
            <span>total:{entry.event.promptMessageCount ?? 0}</span>
          </div>
        </SheetSection>
        <SheetSection>
          <p className="eyebrow">signals</p>
          <div className="event-chip-grid">
            {signals.length === 0 ? (
              <div className="text-muted-foreground">-- no signals --</div>
            ) : (
              signals.map((signal) => (
                <CortexSignalButton
                  key={signal.id}
                  signal={signal}
                  onOpen={() =>
                    onOpenSignal(target.missionId, target.dispatchId, target.iteration, signal.id)
                  }
                />
              ))
            )}
          </div>
        </SheetSection>
      </SheetBody>
    </>
  );
}

function CortexSignalButton({
  signal,
  onOpen,
}: {
  readonly signal: CortexSignal;
  readonly onOpen: () => void;
}) {
  return (
    <button type="button" className="event-chip" onClick={onOpen}>
      <span className="token-bracket" aria-hidden="true">
        [
      </span>
      {signal.slot} / {signal.authority}
      <span className="token-bracket" aria-hidden="true">
        ]
      </span>
    </button>
  );
}

export function CortexSignalSheet({
  target,
  signal,
}: {
  readonly target: Extract<WorkbenchRoute, { readonly _tag: "CortexSignal" }>;
  readonly signal: CortexSignal | undefined;
}) {
  if (signal === undefined) return <MissingSheet title="Cortex Signal" />;
  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>{signal.nodeId}</SheetTitle>
          <SheetMeta>
            <Token>{target.iteration}</Token>
            <Token>{signal.slot}</Token>
            <Token>{signal.authority}</Token>
            <Token>p{signal.priority}</Token>
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        <SheetSection>
          <pre className="payload-block">{signal.text}</pre>
        </SheetSection>
      </SheetBody>
    </>
  );
}
