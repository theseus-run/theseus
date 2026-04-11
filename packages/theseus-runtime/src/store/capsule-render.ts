/**
 * Capsule render functions — deterministic transforms from events to markdown.
 *
 * These produce the PR-ready artifacts. The raw events are in SQLite;
 * these functions are the human-facing view layer.
 *
 * Pure functions: (events) → string. No Effect, no DI.
 */

import type * as CapsuleNs from "@theseus.run/core/Capsule";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const byType = (events: ReadonlyArray<CapsuleNs.Event>, ...types: string[]) =>
  events.filter((e) => types.includes(e.type));

const formatTime = (iso: string): string =>
  new Date(iso).toISOString().slice(11, 19);

const dataField = (data: unknown, ...keys: string[]): string => {
  if (data == null || typeof data !== "object") return JSON.stringify(data);
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return JSON.stringify(data);
};

const bullet = (e: CapsuleNs.Event): string =>
  `- **${formatTime(e.at)}** [${e.by}] ${dataField(e.data, "summary", "message", "task")}`;

// ---------------------------------------------------------------------------
// renderFrictions — friction points encountered during the mission
// ---------------------------------------------------------------------------

export const renderFrictions = (events: ReadonlyArray<CapsuleNs.Event>): string => {
  const frictions = byType(events, "mission.friction");
  if (frictions.length === 0) return "## Frictions\n\nNone recorded.\n";
  return `## Frictions\n\n${frictions.map(bullet).join("\n")}\n`;
};

// ---------------------------------------------------------------------------
// renderDecisions — key decisions made during the mission
// ---------------------------------------------------------------------------

export const renderDecisions = (events: ReadonlyArray<CapsuleNs.Event>): string => {
  const decisions = byType(events, "mission.decide");
  if (decisions.length === 0) return "## Key Decisions\n\nNone recorded.\n";
  return `## Key Decisions\n\n${decisions.map(bullet).join("\n")}\n`;
};

// ---------------------------------------------------------------------------
// renderTimeline — chronological mission summary
// ---------------------------------------------------------------------------

export const renderTimeline = (events: ReadonlyArray<CapsuleNs.Event>): string => {
  if (events.length === 0) return "## Timeline\n\nNo events.\n";

  const lines = events.map((e) => {
    const detail = dataField(e.data, "summary", "message", "task", "result");
    return `| ${formatTime(e.at)} | \`${e.type}\` | ${e.by} | ${detail} |`;
  });

  return [
    "## Timeline",
    "",
    "| Time | Event | Agent | Detail |",
    "|------|-------|-------|--------|",
    ...lines,
    "",
  ].join("\n");
};

// ---------------------------------------------------------------------------
// renderCapsule — full PR-ready report
// ---------------------------------------------------------------------------

export const renderCapsule = (events: ReadonlyArray<CapsuleNs.Event>): string => {
  const sections = [
    renderTimeline(events),
    renderDecisions(events),
    renderFrictions(events),
  ];

  const learnings = byType(events, "mission.learning", "mission.note");
  if (learnings.length > 0) {
    sections.push(`## Notes & Learnings\n\n${learnings.map(bullet).join("\n")}\n`);
  }

  const concerns = byType(events, "mission.concern", "mission.error");
  if (concerns.length > 0) {
    sections.push(`## Concerns & Errors\n\n${concerns.map(bullet).join("\n")}\n`);
  }

  const dispatches = byType(events, "agent.dispatch", "agent.result");
  if (dispatches.length > 0) {
    sections.push(`## Agent Activity\n\n${dispatches.map(bullet).join("\n")}\n`);
  }

  return `# Mission Capsule\n\n${sections.join("\n")}\n`;
};
