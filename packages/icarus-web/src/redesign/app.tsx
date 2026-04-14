import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlinePrompt, Input, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";

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

export function RedesignApp() {
  const [page, setPage] = useState<RedesignPage>("dashboard");
  const [selectedMissionId, setSelectedMissionId] = useState(missions[0]!.id);
  const [draftTitle, setDraftTitle] = useState(missions[0]!.title);
  const [draftBrief, setDraftBrief] = useState(missions[0]!.brief);
  const [prompt, setPrompt] = useState("");
  const [liveFrameIndex, setLiveFrameIndex] = useState(0);

  const mission = useMemo(
    () => missions.find((entry) => entry.id === selectedMissionId) ?? missions[0]!,
    [selectedMissionId],
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

  if (page === "showcase") {
    return (
      <main className="page-shell dashboard-shell">
        <div className="dashboard-frame rhythm">
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
                <PanelTitle>Typography</PanelTitle>
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
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Buttons</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <div className="flex flex-wrap gap-[calc(var(--lh)/2)]">
                  <Button>Default action</Button>
                  <Button variant="confirm">Confirm action</Button>
                  <Button variant="danger">Danger action</Button>
                  <Button variant="ghost">Ghost action</Button>
                  <Button size="sm">Small action</Button>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Inputs</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <div className="rhythm">
                  <div className="rhythm">
                    <label htmlFor="showcase-input" className="label-text block">
                      Input
                    </label>
                    <Input id="showcase-input" defaultValue="Mission title" />
                  </div>
                  <div className="rhythm">
                    <label htmlFor="showcase-textarea" className="label-text block">
                      Textarea
                    </label>
                    <Textarea
                      id="showcase-textarea"
                      defaultValue="Multi-line definition copy that should still feel terminal-like."
                    />
                  </div>
                  <div className="rhythm">
                    <label htmlFor="showcase-prompt" className="label-text block">
                      Prompt row
                    </label>
                    <InlinePrompt id="showcase-prompt" defaultValue="Refine acceptance criteria." />
                  </div>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Tones</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <div className="rhythm">
                  {showcaseRows.map((row) => (
                    <div key={row.label} className="dashboard-signal-row">
                      <span
                        className={`dashboard-signal-symbol ${toneClass(row.tone)}`}
                        aria-hidden="true"
                      >
                        {row.sample.slice(0, 1)}
                      </span>
                      <span className="strong-text">{row.label}</span>
                      <span aria-hidden="true">·</span>
                      <span className={toneClass(row.tone)}>{row.sample}</span>
                    </div>
                  ))}
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Panels And Lists</PanelTitle>
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
                <article className="dashboard-ledger-row">
                  <div className="flex flex-wrap gap-x-[2ch] gap-y-[calc(var(--lh)/3)]">
                    <span className="text-foreground">09:53</span>
                    <span aria-hidden="true">·</span>
                    <span className="tone-process">[system]</span>
                    <span aria-hidden="true">→</span>
                    <span>Ledger row sample with symbolic separators.</span>
                  </div>
                </article>
                <ul className="dashboard-checklist">
                  <li>Checklist marker is passive, not a clickable checkbox.</li>
                  <li>Spacing should align with panel rhythm.</li>
                  <li>Everything stays text-first.</li>
                </ul>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader>
                <PanelTitle>Status And Signals</PanelTitle>
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
                    <div key={row.label} className={`dashboard-stat-card ${toneClass(row.tone)}`}>
                      <span className="label-text">{row.label}</span>
                      <p>{row.value}</p>
                    </div>
                  ))}
                </div>
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
                  <p className={toneClass(statusTone[mission.status].tone)}>
                    {statusTone[mission.status].label}
                  </p>
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
                      <button
                        key={entry.id}
                        type="button"
                        className={[
                          "dashboard-list-item w-full text-left",
                          selected ? "dashboard-list-item-active" : "",
                        ].join(" ")}
                        onClick={() => selectMission(entry)}
                      >
                        <div className="flex items-start justify-between gap-[1ch]">
                          <div className="rhythm flex-1">
                            <p className="strong-text text-foreground">{entry.title}</p>
                            <p className="text-muted-foreground">{entry.summary}</p>
                          </div>
                          <span className="shrink-0 text-muted-foreground">{entry.updated}</span>
                        </div>

                        <div className="mt-[calc(var(--lh)/2)] flex flex-wrap gap-x-[2ch] gap-y-[calc(var(--lh)/3)] text-muted-foreground">
                          <span className={toneClass(statusTone[entry.status].tone)}>
                            {statusTone[entry.status].label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>{entry.queue} queued</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PanelBody>
            </Panel>
          </aside>

          <section className="dashboard-column dashboard-column-main rhythm">
            <Panel>
              <PanelHeader className="flex flex-wrap items-center justify-between gap-[var(--lh)]">
                <PanelTitle>Mission Definition</PanelTitle>
                <div className="flex flex-wrap gap-[calc(var(--lh)/2)] text-muted-foreground">
                  <span>{mission.owner}</span>
                  <span aria-hidden="true">·</span>
                  <span>{mission.updated}</span>
                  <span aria-hidden="true">·</span>
                  <span className={toneClass(statusTone[mission.status].tone)}>
                    {statusTone[mission.status].label}
                  </span>
                </div>
              </PanelHeader>
              <PanelBody>
                <div className="rhythm">
                  <label htmlFor="mission-title" className="label-text block">
                    Title
                  </label>
                  <Input
                    id="mission-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                  />
                </div>

                <div className="rhythm">
                  <label htmlFor="mission-brief" className="label-text block">
                    Mission Brief
                  </label>
                  <Textarea
                    id="mission-brief"
                    value={draftBrief}
                    onChange={(event) => setDraftBrief(event.target.value)}
                    className="min-h-[calc(var(--lh)*10)]"
                  />
                </div>

                <div className="dashboard-subgrid">
                  <div className="rhythm">
                    <h3 className="heading-3">Acceptance Criteria</h3>
                    <ul className="dashboard-checklist">
                      {mission.acceptance.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
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
                <PanelTitle>Activity Ledger</PanelTitle>
              </PanelHeader>
              <PanelBody>
                <div className="rhythm">
                  {queueRows.map((row) => (
                    <article key={`${row.at}-${row.text}`} className="dashboard-ledger-row">
                      <div className="flex flex-wrap gap-x-[2ch] gap-y-[calc(var(--lh)/3)]">
                        <span className="text-foreground">{row.at}</span>
                        <span aria-hidden="true">·</span>
                        <span className={toneClass(row.tone)}>[{row.source}]</span>
                        <span aria-hidden="true">→</span>
                        <span>{row.text}</span>
                      </div>
                    </article>
                  ))}
                </div>
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
                    <div key={row.label} className={`dashboard-stat-card ${toneClass(row.tone)}`}>
                      <span className="label-text">{row.label}</span>
                      <p>{row.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rhythm">
                  <h3 className="heading-3">Signals</h3>
                  <div className="rhythm">
                    {signalRows.map((row) => (
                      <div key={row.label} className="dashboard-signal-row">
                        <span
                          className={`dashboard-signal-symbol ${toneClass(row.tone)}`}
                          aria-hidden="true"
                        >
                          {row.symbol}
                        </span>
                        <span className="strong-text">{row.label}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-muted-foreground">{row.value}</span>
                      </div>
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

                <div className="rhythm">
                  <label htmlFor="operator-prompt" className="label-text block">
                    Operator Prompt
                  </label>
                  <InlinePrompt
                    id="operator-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Refine the selected mission, inject constraints, or request implementation details..."
                  />
                </div>

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
