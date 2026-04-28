import type { ReactNode } from "react";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function WorkbenchSheet({
  open,
  onClose,
  children,
  depth = 0,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly depth?: number;
}) {
  const closing = useRef(false);
  const closeOnce = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    onClose();
  }, [onClose]);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeOnce()}>
      <SheetContent
        className={`sheet-depth-${depth}`}
        showOverlay={depth === 0}
        onDismissed={closeOnce}
      >
        <Button variant="ghost" size="sm" className="sheet-close-button" onClick={closeOnce}>
          close
        </Button>
        {children}
      </SheetContent>
    </Sheet>
  );
}
