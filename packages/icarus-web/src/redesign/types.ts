export type MissionStatus = "defining" | "active" | "review" | "paused";

export type Tone = "good" | "process" | "danger" | "muted";

export type RedesignPage = "dashboard" | "showcase";

export type Mission = {
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

export type ToolCall = {
  id: string;
  tool: string;
  eventType: string;
  command: string;
  tone: Tone;
  summary: string;
  input: Record<string, unknown>;
  output: unknown;
};

export type QueueRow = {
  at: string;
  source: string;
  tone: Tone;
  text: string;
};

export type ControlRow = {
  label: string;
  value: string;
  tone: Tone;
};

export type SignalRowItem = {
  symbol: string;
  label: string;
  value: string;
  tone: Tone;
};

export type TranscriptFixtureRow = {
  prefix: string;
  tone: Tone;
  variant: "user" | "assistant" | "runtime" | "system";
  body: string;
  meta: string;
};

export type ShowcaseToneRow = {
  label: string;
  sample: string;
  tone: Tone;
};
