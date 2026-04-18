import { Checklist, ChecklistItem } from "@/components/ui/checklist";
import { LedgerRow, LedgerRowBody } from "@/components/ui/ledger-row";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import {
  QueueItem,
  QueueItemHeader,
  QueueItemMeta,
  QueueItemSummary,
  QueueItemTitle,
} from "@/components/ui/queue-item";
import {
  SignalRow,
  SignalRowLabel,
  SignalRowSymbol,
  SignalRowValue,
} from "@/components/ui/signal-row";
import { XStack, YStack } from "@/components/ui/stack";
import { StatBlock, StatBlockLabel, StatBlockValue } from "@/components/ui/stat-block";
import { StatusMark } from "@/components/ui/status-mark";
import { Token } from "@/components/ui/token";
import { controlRows, signalRows } from "../fixtures/runtime";
import { toolCalls, transcriptRows } from "../fixtures/transcript";
import { useRedesignState } from "../state";
import { TranscriptFixturePanel } from "../transcript-panel";

export function ShowcasePatternsPage() {
  const { openTool } = useRedesignState();

  return (
    <YStack className="showcase-grid">
      <Panel>
        <PanelHeader>
          <PanelTitle>Panel And List</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <YStack gap="sm">
            <article className="dashboard-log-row">
              <XStack justify="between" align="baseline" wrap>
                <span className="strong-text">log row</span>
                <span className="text-muted-foreground">09:52</span>
              </XStack>
              <p className="text-muted-foreground">
                Reusable bordered content block for terminal notes.
              </p>
            </article>
            <LedgerRow>
              <LedgerRowBody>
                <span className="text-foreground">09:53</span>
                <span aria-hidden="true">·</span>
                <span className="tone-process">[system]</span>
                <span aria-hidden="true">→</span>
                <span>Ledger row sample with symbolic separators.</span>
              </LedgerRowBody>
            </LedgerRow>
            <Checklist>
              <ChecklistItem>Checklist marker is passive, not a clickable checkbox.</ChecklistItem>
              <ChecklistItem>Spacing should align with panel rhythm.</ChecklistItem>
              <ChecklistItem>Everything stays text-first.</ChecklistItem>
            </Checklist>
          </YStack>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Signals And Stats</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <YStack gap="sm">
            <div className="dashboard-stat-grid">
              {controlRows.map((row) => (
                <StatBlock key={row.label} tone={row.tone} className="interactive-subtle">
                  <StatBlockLabel>{row.label}</StatBlockLabel>
                  <StatBlockValue>{row.value}</StatBlockValue>
                </StatBlock>
              ))}
            </div>
            <YStack gap="sm">
              {signalRows.map((row) => (
                <SignalRow key={row.label}>
                  <SignalRowSymbol tone={row.tone}>{row.symbol}</SignalRowSymbol>
                  <SignalRowLabel>{row.label}</SignalRowLabel>
                  <span aria-hidden="true">·</span>
                  <SignalRowValue>{row.value}</SignalRowValue>
                </SignalRow>
              ))}
            </YStack>
          </YStack>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Queue Item</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <QueueItem className="interactive-subtle">
            <QueueItemHeader>
              <YStack gap="xs" className="flex-1">
                <QueueItemTitle>Redesign icarus-web control room</QueueItemTitle>
                <QueueItemSummary>
                  Move from centered mockup to a full-width control surface with clearer command
                  structure.
                </QueueItemSummary>
              </YStack>
              <span className="shrink-0 text-muted-foreground">4m ago</span>
            </QueueItemHeader>
            <QueueItemMeta>
              <StatusMark symbol="·" tone="process">
                defining
              </StatusMark>
              <Token variant="plain">m-2048</Token>
              <Token variant="plain">3 queued</Token>
            </QueueItemMeta>
          </QueueItem>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Transcript</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <TranscriptFixturePanel
            rows={transcriptRows}
            toolCalls={toolCalls}
            onSelectTool={openTool}
          />
        </PanelBody>
      </Panel>
    </YStack>
  );
}
