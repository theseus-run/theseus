import { Link } from "@tanstack/react-router";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StackItem } from "@/components/ui/stack-item";

const pages = [
  { to: "/showcase/typography", label: "Typography" },
  { to: "/showcase/status", label: "Status" },
  { to: "/showcase/fields", label: "Fields" },
  { to: "/showcase/patterns", label: "Patterns" },
] as const;

export function ShowcaseIndexPage() {
  return (
    <>
      <header className="dashboard-header rhythm border-b-[calc(var(--border)*3)] border-border pb-[var(--lh)]">
        <div className="rhythm">
          <p className="label-text">Theseus / Icarus-Web / Showcase</p>
          <h1 className="heading-1 max-w-[30ch]">Design system surface for the redesign.</h1>
          <p className="lede max-w-[72ch]">
            One page per component family or pattern. Use this as the local reference surface.
          </p>
        </div>
      </header>

      <section className="showcase-grid">
        {pages.map((page) => (
          <Panel key={page.to}>
            <PanelHeader>
              <PanelTitle>{page.label}</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <StackItem>
                <Link to={page.to} className="underline-dotted">
                  Open {page.label}
                </Link>
              </StackItem>
            </PanelBody>
          </Panel>
        ))}
      </section>
    </>
  );
}
