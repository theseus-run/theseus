/**
 * AgentComm types — cross-agent communication protocol.
 *
 * DispatchGruntInput: what the orchestrator sends (blueprint + task + criteria + context).
 * ReportInput: what the worker sends back (result + summary + content).
 */

// ---------------------------------------------------------------------------
// DispatchGruntInput — orchestrator → grunt
// ---------------------------------------------------------------------------

/** Structured input for the theseus_dispatch_grunt tool. */
export interface DispatchGruntInput {
  /** Runtime-owned blueprint name to dispatch. */
  readonly blueprint: string;
  /** What the worker should accomplish. Be specific. */
  readonly task: string;
  /** How we know the task is done. */
  readonly criteria: ReadonlyArray<string>;
  /** File paths, inline data, or references for the worker. */
  readonly context?: string | undefined;
}

// ---------------------------------------------------------------------------
// ReportInput — worker → orchestrator (terminates loop)
// ---------------------------------------------------------------------------

/** Structured input for the theseus.report tool. */
export interface ReportInput {
  /** Routing signal: success (deliverable), error (actionable), defect (broken). */
  readonly result: "success" | "error" | "defect";
  /** One-line summary of what happened. */
  readonly summary: string;
  /** Full deliverable, error description, or defect details. */
  readonly content: string;
}
