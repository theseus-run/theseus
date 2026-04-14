import type { ControlRow, MissionStatus, QueueRow, SignalRowItem, Tone } from "../types";

export const statusTone: Record<MissionStatus, { label: string; tone: Tone }> = {
  defining: { label: "· defining", tone: "process" },
  active: { label: "◆ active", tone: "good" },
  review: { label: "◦ review", tone: "muted" },
  paused: { label: "× paused", tone: "danger" },
};

export const liveFrames = ["⠇", "⠋", "⠙", "⠸", "⠴", "⠦"];

export const queueRows: QueueRow[] = [
  {
    at: "09:37",
    source: "runtime",
    tone: "good",
    text: "Socket connected; syncing mission snapshots.",
  },
  {
    at: "09:39",
    source: "planner",
    tone: "process",
    text: "Definition branch updated with 3-column dashboard target.",
  },
  {
    at: "09:40",
    source: "ui",
    tone: "process",
    text: "Prompt surface still missing inline control grouping.",
  },
  {
    at: "09:42",
    source: "review",
    tone: "muted",
    text: "Need stronger distinction between mission metadata and actions.",
  },
];

export const controlRows: ControlRow[] = [
  { label: "runtime", value: "connected", tone: "good" },
  { label: "operator", value: "roman", tone: "muted" },
  { label: "view", value: "dashboard/3col", tone: "process" },
  { label: "theme", value: "dark monospace", tone: "process" },
];

export const signalRows: SignalRowItem[] = [
  { symbol: "◆", label: "socket", value: "stable", tone: "good" },
  { symbol: "·", label: "queue", value: "accepting input", tone: "process" },
  { symbol: "→", label: "focus", value: "mission definition", tone: "process" },
  { symbol: "◦", label: "review", value: "criteria visible", tone: "muted" },
];
