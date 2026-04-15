import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PromptField } from "@/components/ui/prompt-field";
import { XStack, YStack } from "@/components/ui/stack";
import { StackItem } from "@/components/ui/stack-item";

export function ShowcaseFieldsPage() {
  return (
    <section className="showcase-grid">
      <Panel>
        <PanelHeader>
          <PanelTitle>Actions</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <StackItem>
            <XStack gap="sm" wrap>
              <Button>Default action</Button>
              <Button variant="confirm">Confirm action</Button>
              <Button variant="danger">Danger action</Button>
              <Button variant="ghost">Ghost action</Button>
              <Button size="sm">Small action</Button>
            </XStack>
          </StackItem>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Fields</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <YStack gap="md">
            <Field>
              <FieldLabel>Field label</FieldLabel>
              <FieldHint>Field hint / supporting guidance below the control.</FieldHint>
            </Field>
            <Field>
              <FieldLabel>Input</FieldLabel>
              <Input id="showcase-input" defaultValue="Mission title" />
              <FieldHint>Single-line command or definition label.</FieldHint>
            </Field>
            <Field>
              <FieldLabel>Textarea</FieldLabel>
              <Textarea
                id="showcase-textarea"
                defaultValue="Multi-line definition copy that should still feel terminal-like."
              />
              <FieldHint>Multi-line text with the same frame language.</FieldHint>
            </Field>
            <Field>
              <FieldLabel>Prompt row</FieldLabel>
              <PromptField
                id="showcase-prompt"
                value="Refine acceptance criteria."
                onChange={() => {}}
                hint="Prompt lead plus autosizing text entry treatment."
              />
            </Field>
          </YStack>
        </PanelBody>
      </Panel>
    </section>
  );
}
