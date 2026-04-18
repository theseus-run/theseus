import { Button } from "@/components/ui/button";
import { Checklist, ChecklistItem } from "@/components/ui/checklist";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PromptField } from "@/components/ui/prompt-field";
import {
  QueueItem,
  QueueItemHeader,
  QueueItemMeta,
  QueueItemSummary,
  QueueItemTitle,
} from "@/components/ui/queue-item";
import {
  SectionHeader,
  SectionHeaderMeta,
  SectionHeaderTitle,
} from "@/components/ui/section-header";
import {
  SignalRow,
  SignalRowLabel,
  SignalRowSymbol,
  SignalRowValue,
} from "@/components/ui/signal-row";
import { StatBlock, StatBlockLabel, StatBlockValue } from "@/components/ui/stat-block";
import { StatusMark } from "@/components/ui/status-mark";
import { Token } from "@/components/ui/token";
import { controlRows, queueRows, signalRows, statusTone } from "../fixtures/runtime";
import { toolCalls } from "../fixtures/transcript";
import { statusSymbol } from "../helpers";
import { useRedesignState } from "../state";
import { RuntimeTranscriptPanel } from "../transcript-panel";

export function DashboardPage() {
  const {
    mission,
    missions,
    draftTitle,
    draftBrief,
    prompt,
    selectMission,
    openTool,
    setDraftTitle,
    setDraftBrief,
    setPrompt,
  } = useRedesignState();

  return (
    <>
      <header className="dashboard-header rhythm border-b-[calc(var(--border)*3)] border-border pb-[var(--lh)]">
        <div className="flex flex-col gap-[calc(var(--lh)/2)] xl:flex-row xl:items-end xl:justify-between">
          <div className="rhythm">
            <p className="label-text">Theseus / Icarus-Web / Redesign</p>
            <h1 className="heading-1 max-w-[28ch]">
              Full-width mission control built from monospace primitives.
            </h1>
            <p className="lede max-w-[72ch]">
              The centered editorial layout is gone. This version aims at a missing-control style
              dashboard: left rail for missions, center for the active definition surface, right
              rail for system state and prompt controls.
            </p>
          </div>

          <div className="dashboard-kpis">
            <div>
              <span className="eyebrow">active mission</span>
              <p>{mission.id}</p>
            </div>
            <div>
              <span className="eyebrow">queue</span>
              <p>{mission.queue} pending</p>
            </div>
            <div>
              <span className="eyebrow">status</span>
              <StatusMark
                symbol={statusSymbol(mission.status)}
                tone={statusTone[mission.status].tone}
              >
                {statusTone[mission.status].label.slice(2)}
              </StatusMark>
            </div>
          </div>
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="dashboard-column rhythm">
          <Panel className="min-h-full">
            <PanelHeader>
              <PanelTitle>Mission Queue</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <div className="rhythm">
                {missions.map((entry) => {
                  const selected = entry.id === mission.id;

                  return (
                    <QueueItem
                      key={entry.id}
                      className={[
                        "interactive-subtle w-full text-left",
                        selected ? "dashboard-list-item-active" : "",
                      ].join(" ")}
                      onClick={() => selectMission(entry)}
                    >
                      <QueueItemHeader>
                        <div className="rhythm flex-1">
                          <QueueItemTitle>{entry.title}</QueueItemTitle>
                          <QueueItemSummary>{entry.summary}</QueueItemSummary>
                        </div>
                        <span className="shrink-0 text-muted-foreground">{entry.updated}</span>
                      </QueueItemHeader>
                      <QueueItemMeta>
                        <StatusMark
                          symbol={statusSymbol(entry.status)}
                          tone={statusTone[entry.status].tone}
                        >
                          {statusTone[entry.status].label.slice(2)}
                        </StatusMark>
                        <Token variant="plain">{entry.id}</Token>
                        <Token variant="plain">{entry.queue} queued</Token>
                      </QueueItemMeta>
                    </QueueItem>
                  );
                })}
              </div>
            </PanelBody>
          </Panel>
        </aside>

        <section className="dashboard-column dashboard-column-main rhythm">
          <Panel>
            <PanelHeader>
              <SectionHeader>
                <SectionHeaderTitle>
                  <PanelTitle>Mission Definition</PanelTitle>
                </SectionHeaderTitle>
                <SectionHeaderMeta>
                  <Token>{mission.owner}</Token>
                  <Token>{mission.updated}</Token>
                  <StatusMark
                    symbol={statusSymbol(mission.status)}
                    tone={statusTone[mission.status].tone}
                  >
                    {statusTone[mission.status].label.slice(2)}
                  </StatusMark>
                </SectionHeaderMeta>
              </SectionHeader>
            </PanelHeader>
            <PanelBody>
              <Field>
                <FieldLabel>Title</FieldLabel>
                <Input
                  id="mission-title"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />
                <FieldHint>Short operational name for the current workspace.</FieldHint>
              </Field>

              <Field>
                <FieldLabel>Mission Brief</FieldLabel>
                <Textarea
                  id="mission-brief"
                  value={draftBrief}
                  onChange={(event) => setDraftBrief(event.target.value)}
                  className="min-h-[calc(var(--lh)*10)]"
                />
                <FieldHint>
                  State the goal, constraints, and what success should look like.
                </FieldHint>
              </Field>

              <div className="dashboard-subgrid">
                <div className="rhythm">
                  <h3 className="heading-3">Acceptance Criteria</h3>
                  <Checklist>
                    {mission.acceptance.map((item) => (
                      <ChecklistItem key={item}>{item}</ChecklistItem>
                    ))}
                  </Checklist>
                </div>

                <div className="rhythm">
                  <h3 className="heading-3">Timeline</h3>
                  <div className="rhythm">
                    {mission.timeline.map((item) => (
                      <article key={`${item.stamp}-${item.label}`} className="dashboard-log-row">
                        <div className="flex flex-wrap items-baseline justify-between gap-[1ch]">
                          <span className="strong-text text-foreground">{item.label}</span>
                          <span className="text-muted-foreground">{item.stamp}</span>
                        </div>
                        <p className="text-muted-foreground">{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>Activity Transcript</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <RuntimeTranscriptPanel
                rows={queueRows}
                toolCalls={toolCalls}
                onSelectTool={openTool}
              />
            </PanelBody>
          </Panel>
        </section>

        <aside className="dashboard-column rhythm">
          <Panel>
            <PanelHeader>
              <PanelTitle>Control Stack</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <div className="dashboard-stat-grid">
                {controlRows.map((row) => (
                  <StatBlock key={row.label} tone={row.tone} className="interactive-subtle">
                    <StatBlockLabel>{row.label}</StatBlockLabel>
                    <StatBlockValue>{row.value}</StatBlockValue>
                  </StatBlock>
                ))}
              </div>

              <div className="rhythm">
                <h3 className="heading-3">Signals</h3>
                <div className="rhythm">
                  {signalRows.map((row) => (
                    <SignalRow key={row.label}>
                      <SignalRowSymbol tone={row.tone}>{row.symbol}</SignalRowSymbol>
                      <SignalRowLabel>{row.label}</SignalRowLabel>
                      <span aria-hidden="true">·</span>
                      <SignalRowValue>{row.value}</SignalRowValue>
                    </SignalRow>
                  ))}
                </div>
              </div>

              <hr />

              <div className="rhythm">
                <h3 className="heading-3">Actions</h3>
                <div className="flex flex-wrap gap-[calc(var(--lh)/2)]">
                  <Button className="min-w-[16ch]">New mission</Button>
                  <Button variant="confirm" className="min-w-[16ch]">
                    Lock definition
                  </Button>
                  <Button variant="danger" className="min-w-[16ch]">
                    Interrupt run
                  </Button>
                </div>
              </div>

              <Field>
                <FieldLabel>Operator Prompt</FieldLabel>
                <PromptField
                  id="operator-prompt"
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Refine the selected mission, inject constraints, or request implementation details..."
                  hint="Enter sends intent to the active mission surface. Shift+Enter inserts a newline."
                />
              </Field>

              <div className="dashboard-note">
                <h3 className="heading-3">Control Intent</h3>
                <p>
                  Right rail stays dedicated to runtime posture and intervention. It should feel
                  adjacent to the mission, not mixed into the authoring surface.
                </p>
              </div>
            </PanelBody>
          </Panel>
        </aside>
      </section>
    </>
  );
}
