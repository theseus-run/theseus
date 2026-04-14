import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { LedgerRow, LedgerRowBody } from "@/components/ui/ledger-row";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { PromptField } from "@/components/ui/prompt-field";
import {
  QueueItem,
  QueueItemHeader,
  QueueItemMeta,
  QueueItemSummary,
  QueueItemTitle,
} from "@/components/ui/queue-item";
import { Checklist, ChecklistItem } from "@/components/ui/checklist";
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetMeta,
  SheetOverlay,
  SheetSection,
  SheetTitle,
} from "@/components/ui/sheet";
import { XStack, YStack } from "@/components/ui/stack";
import { StatBlock, StatBlockLabel, StatBlockValue } from "@/components/ui/stat-block";
import { StatusMark } from "@/components/ui/status-mark";
import { StatusStrip, StatusStripItem } from "@/components/ui/status-strip";
import { Token } from "@/components/ui/token";
import {
  ToolCallRow,
  ToolCallRowBody,
  ToolCallRowMeta,
  ToolCallRowPrefix,
} from "@/components/ui/tool-call-row";
import {
  Transcript,
  TranscriptRow,
  TranscriptRowBody,
  TranscriptRowMeta,
  TranscriptRowPrefix,
} from "@/components/ui/transcript";

type MissionStatus = "defining" | "active" | "review" | "paused";

type Tone = "good" | "process" | "danger" | "muted";

type RedesignPage = "dashboard" | "showcase";

type Mission = {
  id: string;
  title: string;
  owner: string;
  status: MissionStatus;
  summary: string;
  brief: string;
  updated: string;
  queue: number;
  acceptance: string[];
  timeline: Array<{ stamp: string; label: string; detail: string }>;
};

type ToolCall = {
  id: string;
  tool: string;
  command: string;
  tone: Tone;
  summary: string;
  input: string[];
  output: string[];
};

const missions: Mission[] = [
  {
    id: "m-2048",
    title: "Redesign icarus-web control room",
    owner: "roman",
    status: "defining",
    summary:
      "Move from centered mockup to a full-width control surface with clearer command structure.",
    brief:
      "Build a three-column dashboard that feels operational instead of editorial. Left column tracks missions, center column owns the selected mission, right column exposes control state and prompt entry.",
    updated: "4m ago",
    queue: 3,
    acceptance: [
      "Three columns hold on desktop without collapsing the information hierarchy.",
      "Mission detail reads as a calm terminal dashboard rather than a marketing page.",
      "Controls and prompt input stay visible without competing with the main work surface.",
    ],
    timeline: [
      {
        stamp: "09:12",
        label: "spec",
        detail: "Target layout narrowed to missing-control style dashboard.",
      },
      {
        stamp: "09:28",
        label: "ui",
        detail: "Monospace-web tokens retained, width constraint removed.",
      },
      {
        stamp: "09:41",
        label: "next",
        detail: "Need interactive mission selection and control grouping.",
      },
    ],
  },
  {
    id: "m-2041",
    title: "Calm dispatch activity log",
    owner: "ops",
    status: "active",
    summary: "Reduce ornamental UI and make runtime activity scannable at a glance.",
    brief:
      "The event stream should read like a technical ledger: dense, stable, and easy to inspect while prompts continue to arrive.",
    updated: "18m ago",
    queue: 8,
    acceptance: [
      "System activity remains visible alongside mission drafting.",
      "Status badges do not rely on color alone.",
      "Action affordances feel deliberate, not app-store glossy.",
    ],
    timeline: [
      {
        stamp: "08:55",
        label: "audit",
        detail: "Collected current prompt-kit patterns from legacy app.",
      },
      {
        stamp: "09:03",
        label: "risk",
        detail: "Single-column chat wastes available landscape width.",
      },
      {
        stamp: "09:19",
        label: "plan",
        detail: "Split queue, mission detail, and controls into separate zones.",
      },
    ],
  },
  {
    id: "m-2032",
    title: "Readable acceptance criteria",
    owner: "systems",
    status: "review",
    summary: "Keep high-density requirements legible without losing operational tone.",
    brief:
      "Acceptance criteria should stay embedded in the mission rather than hidden behind separate flows.",
    updated: "1d ago",
    queue: 1,
    acceptance: [
      "Definition copy stays concise and concrete.",
      "Review state is obvious from layout and controls.",
    ],
    timeline: [
      {
        stamp: "Yesterday",
        label: "draft",
        detail: "Reframed criteria as checklist-like statements.",
      },
      { stamp: "Yesterday", label: "handoff", detail: "Waiting on final dashboard treatment." },
    ],
  },
  {
    id: "m-2027",
    title: "Interrupt handling",
    owner: "runtime",
    status: "paused",
    summary: "Clarify what operators can stop, resume, or requeue from the dashboard surface.",
    brief:
      "Interruption needs a stronger control vocabulary so users understand whether they are stopping execution, editing definition, or replacing the active prompt.",
    updated: "2d ago",
    queue: 5,
    acceptance: [
      "Pause state is distinct from review state.",
      "Unsafe actions are visually isolated.",
    ],
    timeline: [
      {
        stamp: "Mon",
        label: "open",
        detail: "Interrupt affordance still too easy to confuse with reset.",
      },
      { stamp: "Mon", label: "hold", detail: "Pending broader control panel redesign." },
    ],
  },
];

const statusTone: Record<MissionStatus, { label: string; tone: Tone }> = {
  defining: { label: "· defining", tone: "process" },
  active: { label: "◆ active", tone: "good" },
  review: { label: "◦ review", tone: "muted" },
  paused: { label: "× paused", tone: "danger" },
};

const liveFrames = ["⠇", "⠋", "⠙", "⠸", "⠴", "⠦"];

const queueRows = [
  {
    at: "09:37",
    source: "runtime",
    tone: "good" as const,
    text: "Socket connected; syncing mission snapshots.",
  },
  {
    at: "09:39",
    source: "planner",
    tone: "process" as const,
    text: "Definition branch updated with 3-column dashboard target.",
  },
  {
    at: "09:40",
    source: "ui",
    tone: "process" as const,
    text: "Prompt surface still missing inline control grouping.",
  },
  {
    at: "09:42",
    source: "review",
    tone: "muted" as const,
    text: "Need stronger distinction between mission metadata and actions.",
  },
];

const controlRows = [
  { label: "runtime", value: "connected", tone: "good" as const },
  { label: "operator", value: "roman", tone: "muted" as const },
  { label: "view", value: "dashboard/3col", tone: "process" as const },
  { label: "theme", value: "dark monospace", tone: "process" as const },
];

const signalRows = [
  { symbol: "◆", label: "socket", value: "stable", tone: "good" as const },
  { symbol: "·", label: "queue", value: "accepting input", tone: "process" as const },
  { symbol: "→", label: "focus", value: "mission definition", tone: "process" as const },
  { symbol: "◦", label: "review", value: "criteria visible", tone: "muted" as const },
];

const transcriptRows = [
  {
    prefix: ">",
    tone: "muted" as const,
    variant: "user" as const,
    body: "We are continuing the redesign and aiming at a full-width dashboard.",
    meta: "user · 09:44",
  },
  {
    prefix: "→",
    tone: "process" as const,
    variant: "assistant" as const,
    body: "Three-column control layout selected; queue, workspace, and runtime rails split.",
    meta: "assistant · 09:45",
  },
  {
    prefix: "◆",
    tone: "good" as const,
    variant: "runtime" as const,
    body: "Socket connected; mission snapshots available.",
    meta: "runtime · 09:46",
  },
  {
    prefix: "×",
    tone: "danger" as const,
    variant: "system" as const,
    body: "Interrupt action remains isolated until confirmation design is added.",
    meta: "system · 09:47",
  },
];

const toolCalls: ToolCall[] = [
  {
    id: "tool-1",
    tool: "bash",
    command: "bun run dev",
    tone: "process",
    summary: "Development server started for redesign iteration.",
    input: ["command: bun run dev", "cwd: packages/icarus-web"],
    output: ["vite dev server listening", "hot reload active"],
  },
  {
    id: "tool-2",
    tool: "webfetch",
    command: "https://silkhq.com/",
    tone: "good",
    summary: "Fetched detached sheet references for tool details interaction.",
    input: ["url: https://silkhq.com/", "format: markdown"],
    output: ["detached sheet", "stacking", "keyboard handling", "unstyled API"],
  },
];

const showcaseRows = [
  { label: "good", sample: "◆ runtime stable", tone: "good" as const },
  { label: "process", sample: "→ planner running", tone: "process" as const },
  { label: "danger", sample: "× destructive action", tone: "danger" as const },
  { label: "muted", sample: "◦ passive metadata", tone: "muted" as const },
];

function toneClass(tone: Tone) {
  switch (tone) {
    case "good":
      return "tone-good";
    case "process":
      return "tone-process";
    case "danger":
      return "tone-danger";
    case "muted":
      return "tone-muted";
  }
}

function statusSymbol(status: MissionStatus) {
  switch (status) {
    case "defining":
      return "·";
    case "active":
      return "◆";
    case "review":
      return "◦";
    case "paused":
      return "×";
  }
}

export function RedesignApp() {
  const [page, setPage] = useState<RedesignPage>("dashboard");
  const [selectedMissionId, setSelectedMissionId] = useState(missions[0]!.id);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(missions[0]!.title);
  const [draftBrief, setDraftBrief] = useState(missions[0]!.brief);
  const [prompt, setPrompt] = useState("");
  const [liveFrameIndex, setLiveFrameIndex] = useState(0);

  const mission = useMemo(
    () => missions.find((entry) => entry.id === selectedMissionId) ?? missions[0]!,
    [selectedMissionId],
  );

  const selectedTool = useMemo(
    () => toolCalls.find((entry) => entry.id === selectedToolId) ?? null,
    [selectedToolId],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveFrameIndex((index) => (index + 1) % liveFrames.length);
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  const selectMission = (nextMission: Mission) => {
    setSelectedMissionId(nextMission.id);
    setDraftTitle(nextMission.title);
    setDraftBrief(nextMission.brief);
  };

  const pageTabs = (
    <div className="dashboard-tabs" role="tablist" aria-label="Redesign pages">
      <button
        type="button"
        role="tab"
        aria-selected={page === "dashboard"}
        className={`dashboard-tab ${page === "dashboard" ? "dashboard-tab-active" : ""}`}
        onClick={() => setPage("dashboard")}
      >
        dashboard
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={page === "showcase"}
        className={`dashboard-tab ${page === "showcase" ? "dashboard-tab-active" : ""}`}
        onClick={() => setPage("showcase")}
      >
        showcase
      </button>
    </div>
  );

  const toolSheet = (
    <Sheet open={selectedTool !== null}>
      <SheetOverlay onClick={() => setSelectedToolId(null)} />
      <SheetContent>
        <SheetHeader>
          <div className="rhythm">
            <SheetTitle>Tool Details</SheetTitle>
            <SheetMeta>
              {selectedTool ? (
                <>
                  <Token label="tool" value={selectedTool.tool} tone={selectedTool.tone} />
                  <Token label="id" value={selectedTool.id} />
                </>
              ) : null}
            </SheetMeta>
          </div>
          <Button variant="ghost" onClick={() => setSelectedToolId(null)}>
            close
          </Button>
        </SheetHeader>
        {selectedTool ? (
          <SheetBody>
            <SheetSection>
              <p className="label-text">Summary</p>
              <p>{selectedTool.summary}</p>
            </SheetSection>
            <SheetSection>
              <p className="label-text">Input</p>
              <Checklist>
                {selectedTool.input.map((item) => (
                  <ChecklistItem key={item}>{item}</ChecklistItem>
                ))}
              </Checklist>
            </SheetSection>
            <SheetSection>
              <p className="label-text">Output</p>
              <Transcript>
                {selectedTool.output.map((item) => (
                  <TranscriptRow key={item} variant="assistant">
                    <TranscriptRowPrefix tone={selectedTool.tone}>→</TranscriptRowPrefix>
                    <TranscriptRowBody>{item}</TranscriptRowBody>
                    <TranscriptRowMeta>{selectedTool.tool}</TranscriptRowMeta>
                  </TranscriptRow>
                ))}
              </Transcript>
            </SheetSection>
          </SheetBody>
        ) : null}
      </SheetContent>
    </Sheet>
  );

  if (page === "showcase") {
    return (
      <main className="page-shell dashboard-shell">
        <div className="dashboard-frame rhythm">
          {toolSheet}
          <StatusStrip>
            <StatusStripItem>icarus</StatusStripItem>
            <StatusStripItem>
              <StatusMark symbol="◆" tone="good">
                connected
              </StatusMark>
            </StatusStripItem>
            <StatusStripItem>
              <StatusMark symbol={liveFrames[liveFrameIndex]} tone="process">
                live runtime
              </StatusMark>
            </StatusStripItem>
            <StatusStripItem>/showcase</StatusStripItem>
          </StatusStrip>

          <header className="dashboard-header rhythm border-b-[calc(var(--border)*3)] border-border pb-[var(--lh)]">
            <div className="flex flex-col gap-[var(--lh)] xl:flex-row xl:items-end xl:justify-between">
              <div className="rhythm">
                <p className="label-text">Theseus / Icarus-Web / Showcase</p>
                <h1 className="heading-1 max-w-[30ch]">Design system surface for the redesign.</h1>
                <p className="lede max-w-[72ch]">
                  A local storybook-like page for checking terminal primitives, tone, spacing, and
                  composition without leaving the redesign entrypoint.
                </p>
              </div>
              {pageTabs}
            </div>
          </header>

          <section className="showcase-grid">
            <Panel>
              <PanelHeader>
                <PanelTitle>Foundations · Typography</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <p className="label-text">Label text / muted semantic label</p>
                <h1 className="heading-1">Heading 1 occupies two lines of rhythm.</h1>
                <h2 className="heading-2">Heading 2 uses the same scale, different structure.</h2>
                <h3 className="heading-3">Heading 3 for section boundaries.</h3>
                <p>Body text is neutral, direct, and dense enough for dashboard reading.</p>
                <p className="strong-text">Strong text handles emphasis without size changes.</p>
                <p className="text-muted-foreground">
                  Muted text carries metadata and support copy.
                </p>
                <p>
                  <em>Italic text stays reserved for actual content emphasis</em>, not structural
                  UI.
                </p>
                <p>
                  Mixed content can use <strong>strong</strong>, <em>italic</em>, and inline code
                  like <code>dispatch.queue</code> without changing the base rhythm.
                </p>
                <div className="rhythm">
                  <p className="underline-dotted">Dotted underline for quiet emphasis.</p>
                  <p className="underline-dashed">Dashed underline for structural callouts.</p>
                  <div className="rule-dotted" />
                  <div className="rule-dashed" />
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Foundations · Tone</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <div className="rhythm">
                  {showcaseRows.map((row) => (
                    <SignalRow key={row.label}>
                      <SignalRowSymbol tone={row.tone}>{row.sample.slice(0, 1)}</SignalRowSymbol>
                      <SignalRowLabel>{row.label}</SignalRowLabel>
                      <span aria-hidden="true">·</span>
                      <SignalRowValue className={toneClass(row.tone)}>{row.sample}</SignalRowValue>
                    </SignalRow>
                  ))}
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Primitives · Status</PanelTitle>
              </PanelHeader>
              <PanelBody>
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
                <StatusStrip>
                  <StatusStripItem>icarus</StatusStripItem>
                  <StatusStripItem>mode showcase</StatusStripItem>
                  <StatusStripItem>
                    <StatusMark symbol="→" tone="process">
                      planning
                    </StatusMark>
                  </StatusStripItem>
                </StatusStrip>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Primitives · Actions</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <XStack gap="sm" wrap>
                  <Button>Default action</Button>
                  <Button variant="confirm">Confirm action</Button>
                  <Button variant="danger">Danger action</Button>
                  <Button variant="ghost">Ghost action</Button>
                  <Button size="sm">Small action</Button>
                </XStack>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Primitives · Fields</PanelTitle>
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

            <Panel>
              <PanelHeader>
                <PanelTitle>Patterns · Panel And List</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <article className="dashboard-log-row">
                  <div className="flex flex-wrap items-baseline justify-between gap-[1ch]">
                    <span className="strong-text">log row</span>
                    <span className="text-muted-foreground">09:52</span>
                  </div>
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
                  <ChecklistItem>
                    Checklist marker is passive, not a clickable checkbox.
                  </ChecklistItem>
                  <ChecklistItem>Spacing should align with panel rhythm.</ChecklistItem>
                  <ChecklistItem>Everything stays text-first.</ChecklistItem>
                </Checklist>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Patterns · Signals And Stats</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <p className="dashboard-live-line text-muted-foreground">
                  <span className="dashboard-live-glyph tone-process" aria-hidden="true">
                    {liveFrames[liveFrameIndex]}
                  </span>
                  <span>live</span>
                  <span aria-hidden="true">·</span>
                  <span>showcase mode</span>
                </p>
                <div className="dashboard-stat-grid">
                  {controlRows.map((row) => (
                    <StatBlock key={row.label} tone={row.tone} className="interactive-subtle">
                      <StatBlockLabel>{row.label}</StatBlockLabel>
                      <StatBlockValue>{row.value}</StatBlockValue>
                    </StatBlock>
                  ))}
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Patterns · Queue Item</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <QueueItem className="interactive-subtle">
                  <QueueItemHeader>
                    <div className="rhythm flex-1">
                      <QueueItemTitle>Redesign icarus-web control room</QueueItemTitle>
                      <QueueItemSummary>
                        Move from centered mockup to a full-width control surface with clearer
                        command structure.
                      </QueueItemSummary>
                    </div>
                    <span className="shrink-0 text-muted-foreground">4m ago</span>
                  </QueueItemHeader>
                  <QueueItemMeta>
                    <StatusMark symbol="·" tone="process">
                      defining
                    </StatusMark>
                    <Token>m-2048</Token>
                    <Token>3 queued</Token>
                  </QueueItemMeta>
                </QueueItem>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Patterns · Transcript</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <YStack gap="sm">
                  <Transcript>
                    {transcriptRows.map((row) => (
                      <TranscriptRow key={`${row.meta}-${row.body}`} variant={row.variant}>
                        <TranscriptRowPrefix tone={row.tone}>{row.prefix}</TranscriptRowPrefix>
                        <TranscriptRowBody>{row.body}</TranscriptRowBody>
                        <TranscriptRowMeta>{row.meta}</TranscriptRowMeta>
                      </TranscriptRow>
                    ))}
                  </Transcript>
                  {toolCalls.map((tool) => (
                    <ToolCallRow
                      key={tool.id}
                      tone={tool.tone}
                      onClick={() => setSelectedToolId(tool.id)}
                    >
                      <ToolCallRowPrefix>↗</ToolCallRowPrefix>
                      <ToolCallRowBody>
                        <span className="strong-text">{tool.tool}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{tool.command}</span>
                      </ToolCallRowBody>
                      <ToolCallRowMeta>open details</ToolCallRowMeta>
                    </ToolCallRow>
                  ))}
                </YStack>
              </PanelBody>
            </Panel>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell dashboard-shell">
      <div className="dashboard-frame rhythm">
        {toolSheet}
        <StatusStrip>
          <StatusStripItem>icarus</StatusStripItem>
          <StatusStripItem>
            <StatusMark symbol="◆" tone="good">
              connected
            </StatusMark>
          </StatusStripItem>
          <StatusStripItem>
            <StatusMark symbol={liveFrames[liveFrameIndex]} tone="process">
              runtime nominal
            </StatusMark>
          </StatusStripItem>
          <StatusStripItem>{mission.id}</StatusStripItem>
        </StatusStrip>

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
              <p className="dashboard-live-line text-muted-foreground">
                <span className="dashboard-live-glyph" aria-hidden="true">
                  {liveFrames[liveFrameIndex]}
                </span>
                <span>live</span>
                <span aria-hidden="true">·</span>
                <span>runtime nominal</span>
                <span aria-hidden="true">·</span>
                <span>dispatch queue warm</span>
              </p>
            </div>

            <div className="rhythm">
              {pageTabs}
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
                          <Token>{entry.id}</Token>
                          <Token>{entry.queue} queued</Token>
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
                <YStack gap="sm">
                  <Transcript>
                    {queueRows.map((row) => (
                      <TranscriptRow
                        key={`${row.at}-${row.text}`}
                        variant={
                          row.source === "runtime"
                            ? "runtime"
                            : row.source === "review"
                              ? "system"
                              : "assistant"
                        }
                      >
                        <TranscriptRowPrefix tone={row.tone}>→</TranscriptRowPrefix>
                        <TranscriptRowBody>{row.text}</TranscriptRowBody>
                        <TranscriptRowMeta>
                          <span>{row.source}</span>
                          <span aria-hidden="true">·</span>
                          <span>{row.at}</span>
                        </TranscriptRowMeta>
                      </TranscriptRow>
                    ))}
                  </Transcript>
                  {toolCalls.map((tool) => (
                    <ToolCallRow
                      key={tool.id}
                      tone={tool.tone}
                      onClick={() => setSelectedToolId(tool.id)}
                    >
                      <ToolCallRowPrefix>↗</ToolCallRowPrefix>
                      <ToolCallRowBody>
                        <span className="strong-text">{tool.tool}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{tool.summary}</span>
                      </ToolCallRowBody>
                      <ToolCallRowMeta>{tool.command}</ToolCallRowMeta>
                    </ToolCallRow>
                  ))}
                </YStack>
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
      </div>
    </main>
  );
}
