import { SheetBody, SheetHeader, SheetMeta, SheetSection, SheetTitle } from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import { MissingSheet } from "./missing-sheet";
import { dispatchForNode, modelLabel, stateTone } from "./projection";
import type { WorkbenchState } from "./types";

export function WorkNodeSheet({
  node,
  dispatches,
}: {
  readonly node: WorkbenchState["nodes"][number] | undefined;
  readonly dispatches: WorkbenchState["dispatches"];
}) {
  if (node === undefined) return <MissingSheet title="Work Node" />;
  const dispatch = dispatchForNode(node, dispatches);
  return (
    <>
      <SheetHeader>
        <div>
          <SheetTitle>{node.label}</SheetTitle>
          <SheetMeta>
            <Token>{node.kind}</Token>
            <Token>{node.relation}</Token>
            <Token tone={stateTone(node.state)}>{node.state}</Token>
            {dispatch && <Token>{modelLabel(dispatch)}</Token>}
          </SheetMeta>
        </div>
      </SheetHeader>
      <SheetBody>
        <SheetSection>
          <pre className="payload-block">{JSON.stringify(node, null, 2)}</pre>
        </SheetSection>
      </SheetBody>
    </>
  );
}
