import { SheetBody, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function MissingSheet({ title }: { readonly title: string }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>
      <SheetBody>
        <div className="text-muted-foreground">-- not found --</div>
      </SheetBody>
    </>
  );
}
