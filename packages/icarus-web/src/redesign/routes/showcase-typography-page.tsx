import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StackItem } from "@/components/ui/stack-item";

export function ShowcaseTypographyPage() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Typography</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <StackItem className="rhythm">
          <p className="label-text">Label text / muted semantic label</p>
          <h1 className="heading-1">Heading 1 occupies two lines of rhythm.</h1>
          <h2 className="heading-2">Heading 2 uses the same scale, different structure.</h2>
          <h3 className="heading-3">Heading 3 for section boundaries.</h3>
          <p>Body text is neutral, direct, and dense enough for dashboard reading.</p>
          <p className="strong-text">Strong text handles emphasis without size changes.</p>
          <p className="text-muted-foreground">Muted text carries metadata and support copy.</p>
          <p>
            <em>Italic text stays reserved for actual content emphasis</em>, not structural UI.
          </p>
          <p>
            Mixed content can use <strong>strong</strong>, <em>italic</em>, and inline code like{" "}
            <code>dispatch.queue</code> without changing the base rhythm.
          </p>
          <div className="rhythm">
            <p className="underline-dotted">Dotted underline for quiet emphasis.</p>
            <p className="underline-dashed">Dashed underline for structural callouts.</p>
            <div className="rule-dotted" />
            <div className="rule-dashed" />
          </div>
        </StackItem>
      </PanelBody>
    </Panel>
  );
}
