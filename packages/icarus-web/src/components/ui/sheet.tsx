import { Sheet as SilkSheet, SheetStack as SilkSheetStack } from "@silk-hq/components";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <SilkSheet.Root
      license="commercial"
      forComponent="closest"
      presented={open}
      onPresentedChange={(presented) => onOpenChange?.(presented)}
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
  showOverlay = true,
  onDismissed,
  ...props
}: HTMLAttributes<HTMLElement> & {
  readonly showOverlay?: boolean;
  readonly onDismissed?: () => void;
}) {
  return (
    <SilkSheet.Portal>
      <SilkSheet.View
        className="sheet-view"
        contentPlacement="right"
        tracks="right"
        nativeEdgeSwipePrevention={true}
        onTravelStatusChange={(status) => {
          if (status === "idleOutside") onDismissed?.();
        }}
      >
        {showOverlay && <SheetOverlay />}
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
