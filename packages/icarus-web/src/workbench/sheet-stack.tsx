import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function WorkbenchSheet({
  open,
  onClose,
  children,
  depth = 0,
  frontmost = true,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly depth?: number;
  readonly frontmost?: boolean;
}) {
  const closing = useRef(false);
  const [presented, setPresented] = useState(open);
  const requestClose = useCallback(() => {
    closing.current = true;
    setPresented(false);
  }, []);
  const onSafeToUnmountChange = useCallback(
    (safeToUnmount: boolean) => {
      if (safeToUnmount && closing.current) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      closing.current = false;
      setPresented(true);
    } else {
      requestClose();
    }
  }, [open, requestClose]);

  return (
    <Sheet
      open={presented}
      onOpenChange={(next) => (next ? setPresented(true) : requestClose())}
      onSafeToUnmountChange={onSafeToUnmountChange}
    >
      <SheetContent
        className={`sheet-depth-${depth}`}
        dismissible={frontmost}
        showOverlay={frontmost}
        onDismissRequest={requestClose}
      >
        {frontmost ? (
          <Button variant="ghost" size="sm" className="sheet-close-button" onClick={requestClose}>
            close
          </Button>
        ) : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
