import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetMeta,
  SheetOverlay,
  SheetSection,
  SheetTitle,
} from "@/components/ui/sheet";
import { Token } from "@/components/ui/token";
import type { ToolCall } from "./types";

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function ToolDetailsSheet({
  tool,
  onClose,
}: {
  tool: ToolCall | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={tool !== null}>
      <SheetOverlay onClick={onClose} />
      <SheetContent>
        <SheetHeader>
          <div className="rhythm">
            <SheetTitle>Tool Details</SheetTitle>
            <SheetMeta>
              {tool ? (
                <>
                  <Token label="tool" value={tool.tool} tone={tool.tone} />
                  <Token label="id" value={tool.id} />
                </>
              ) : null}
            </SheetMeta>
          </div>
          <Button variant="ghost" onClick={onClose}>
            close
          </Button>
        </SheetHeader>
        {tool ? (
          <SheetBody>
            <SheetSection>
              <p className="label-text">Summary</p>
              <p>{tool.summary}</p>
            </SheetSection>
            <SheetSection>
              <p className="label-text">Input</p>
              <pre className="payload-block">{formatPayload(tool.input)}</pre>
            </SheetSection>
            <SheetSection>
              <p className="label-text">Output</p>
              <pre className="payload-block">{formatPayload(tool.output)}</pre>
            </SheetSection>
          </SheetBody>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
