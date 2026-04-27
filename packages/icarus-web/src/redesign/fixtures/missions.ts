import type { Mission } from "../types";

export const missions: Mission[] = [
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
        detail: "Collected current runtime UI interaction patterns.",
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
