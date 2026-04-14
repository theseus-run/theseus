import type { ShowcaseToneRow, ToolCall, TranscriptFixtureRow } from "../types";

export const transcriptRows: TranscriptFixtureRow[] = [
  {
    prefix: ">",
    tone: "muted",
    variant: "user",
    body: "We are continuing the redesign and aiming at a full-width dashboard.",
    meta: "user · 09:44",
  },
  {
    prefix: "→",
    tone: "process",
    variant: "assistant",
    body: "Three-column control layout selected; queue, workspace, and runtime rails split.",
    meta: "assistant · 09:45",
  },
  {
    prefix: "◆",
    tone: "good",
    variant: "runtime",
    body: "Socket connected; mission snapshots available.",
    meta: "runtime · 09:46",
  },
  {
    prefix: "×",
    tone: "danger",
    variant: "system",
    body: "Interrupt action remains isolated until confirmation design is added.",
    meta: "system · 09:47",
  },
];

export const toolCalls: ToolCall[] = [
  {
    id: "tool-1",
    tool: "bash",
    eventType: "tool.call",
    command: "bun run dev",
    tone: "process",
    summary: "Development server started for redesign iteration.",
    input: {
      command: "bun run dev",
      workdir: "packages/icarus-web",
      description: "Runs the local Vite development server",
    },
    output: {
      status: "ok",
      lines: ["vite dev server listening", "hot reload active"],
    },
  },
  {
    id: "tool-2",
    tool: "webfetch",
    eventType: "tool.research",
    command: "https://silkhq.com/",
    tone: "good",
    summary: "Fetched detached sheet references for tool details interaction.",
    input: {
      url: "https://silkhq.com/",
      format: "markdown",
      timeout: 20,
    },
    output: {
      patterns: ["detached sheet", "stacking", "keyboard handling", "unstyled API"],
      note: "Use interaction direction only; keep custom terminal styling.",
    },
  },
];

export const showcaseRows: ShowcaseToneRow[] = [
  { label: "good", sample: "◆ runtime stable", tone: "good" },
  { label: "process", sample: "→ planner running", tone: "process" },
  { label: "danger", sample: "× destructive action", tone: "danger" },
  { label: "muted", sample: "◦ passive metadata", tone: "muted" },
];
