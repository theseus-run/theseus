import { StatusMark } from "@/components/ui/status-mark";
import { StatusStrip, StatusStripItem } from "@/components/ui/status-strip";
import { Token } from "@/components/ui/token";
import { XStack, YStack } from "@/components/ui/stack";
import { StackItem } from "@/components/ui/stack-item";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";

export function ShowcaseStatusPage() {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Status</PanelTitle>
      </PanelHeader>
      <PanelBody>
        <StackItem>
          <YStack gap="sm" align="start">
            <XStack gap="md" align="baseline" wrap>
              <StatusMark symbol="◆" tone="good">
                Active status mark
              </StatusMark>
              <StatusMark symbol="→" tone="process">
                Process status mark
              </StatusMark>
            </XStack>
            <XStack gap="md" align="baseline" wrap>
              <StatusMark symbol="×" tone="danger">
                Danger status mark
              </StatusMark>
              <StatusMark symbol="◦" tone="muted">
                Muted status mark
              </StatusMark>
            </XStack>
            <XStack gap="sm" wrap>
              <Token label="token" value="sample" />
              <Token label="mode" value="planning" tone="process" />
              <Token label="state" value="connected" tone="good" />
              <Token tone="danger">[interrupt]</Token>
            </XStack>
          </YStack>
        </StackItem>
        <StackItem>
          <StatusStrip>
            <StatusStripItem>icarus</StatusStripItem>
            <StatusStripItem>mode showcase</StatusStripItem>
            <StatusStripItem>
              <StatusMark symbol="→" tone="process">
                planning
              </StatusMark>
            </StatusStripItem>
          </StatusStrip>
        </StackItem>
      </PanelBody>
    </Panel>
  );
}
