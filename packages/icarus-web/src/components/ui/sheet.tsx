import { Sheet as SilkSheet, SheetStack as SilkSheetStack } from "@silk-hq/components";
import type { HTMLAttributes, ReactNode } from "react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const ROUTE_DISMISS_PROGRESS = 0.86;

export function SheetStack({ children }: { readonly children: ReactNode }) {
  return (
    <SilkSheetStack.Root className="sheet-stack-root">
      <SilkSheetStack.Outlet className="sheet-stack-outlet">{null}</SilkSheetStack.Outlet>
      {children}
    </SilkSheetStack.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  onSafeToUnmountChange,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onSafeToUnmountChange?: (safeToUnmount: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <SilkSheet.Root
      license="commercial"
      forComponent="closest"
      presented={open}
      onPresentedChange={(presented) => onOpenChange?.(presented)}
      onSafeToUnmountChange={onSafeToUnmountChange}
    >
      {children}
    </SilkSheet.Root>
  );
}

export function SheetOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <SilkSheet.Backdrop className={cn("sheet-overlay", className)} {...props} />;
}

export function SheetContent({
  className,
  children,
  dismissible = true,
  showOverlay = true,
  onDismissRequest = () => {},
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly dismissible?: boolean;
  readonly showOverlay?: boolean;
  readonly onDismissRequest?: () => void;
}) {
  const userStepping = useRef(false);
  const requestDismiss = useCallback(() => onDismissRequest(), [onDismissRequest]);

  return (
    <SilkSheet.Portal>
      <SilkSheet.View
        className="sheet-view"
        contentPlacement="right"
        tracks="right"
        nativeEdgeSwipePrevention={false}
        onClickOutside={{ dismiss: dismissible, stopOverlayPropagation: true }}
        onEscapeKeyDown={{
          nativePreventDefault: true,
          dismiss: dismissible,
          stopOverlayPropagation: true,
        }}
        swipe={dismissible}
        swipeDismissal={dismissible}
        onTravelStatusChange={(status) => {
          userStepping.current = status === "stepping";
        }}
        onTravel={({ progress }) => {
          if (dismissible && userStepping.current && progress < ROUTE_DISMISS_PROGRESS) {
            requestDismiss();
          }
        }}
      >
        {showOverlay ? <SheetOverlay onClick={dismissible ? requestDismiss : undefined} /> : null}
        <SilkSheet.Content className={cn("sheet-content", className)} {...props}>
          <SilkSheet.BleedingBackground className="sheet-bleeding-background" />
          {children}
        </SilkSheet.Content>
      </SilkSheet.View>
    </SilkSheet.Portal>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet-header", className)} {...props} />;
}

export function SheetTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("heading-2", className)}>{children}</h2>;
}

export function SheetMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("sheet-meta", className)}>{children}</div>;
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sheet-body rhythm", className)} {...props} />;
}

export function SheetSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("sheet-section", className)} {...props} />;
}
