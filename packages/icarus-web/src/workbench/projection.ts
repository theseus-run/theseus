import { Match } from "effect";
import type {
  DispatchEvent,
  DispatchEventEntry,
  DispatchSession,
  MissionSession,
  WorkNodeSession,
  WorkNodeState,
} from "@/lib/rpc-client";
import type { DispatchTranscript, ReportPacket } from "./types";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isReportPacket = (value: unknown): value is ReportPacket =>
  isRecord(value) &&
  (value["_tag"] === "Reported" || value["_tag"] === "Unstructured") &&
  typeof value["target"] === "string" &&
  typeof value["dispatchId"] === "string";

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const mergeBy = <A, K>(
  current: ReadonlyArray<A>,
  incoming: A,
  key: (value: A) => K,
): ReadonlyArray<A> => {
  const incomingKey = key(incoming);
  return [incoming, ...current.filter((value) => key(value) !== incomingKey)];
};

export const sortMissions = (
  missions: ReadonlyArray<MissionSession>,
): ReadonlyArray<MissionSession> =>
  [...missions].sort((left, right) => right.capsuleId.localeCompare(left.capsuleId));

export const stateTone = (state: WorkNodeState | MissionSession["state"]) =>
  Match.value(state).pipe(
    Match.when("done", () => "good" as const),
    Match.when("running", () => "process" as const),
    Match.when("pending", () => "process" as const),
    Match.when("failed", () => "danger" as const),
    Match.when("aborted", () => "danger" as const),
    Match.orElse(() => "muted" as const),
  );

export const stateSymbol = (state: WorkNodeState | MissionSession["state"]) =>
  Match.value(state).pipe(
    Match.when("done", () => "ok"),
    Match.when("running", () => ">>"),
    Match.when("pending", () => ".."),
    Match.when("failed", () => "!!"),
    Match.when("aborted", () => "!!"),
    Match.orElse(() => "--"),
  );

export const modelLabel = (session: DispatchSession | undefined): string =>
  session?.modelRequest == null
    ? "model --"
    : `${session.modelRequest.provider}/${session.modelRequest.model}`;

export const eventTitle = (event: DispatchEvent): string =>
  Match.value(event).pipe(
    Match.when({ _tag: "CortexRendered" }, () => "cortex"),
    Match.when({ _tag: "ToolCalling" }, (value) => value.tool ?? "tool"),
    Match.when({ _tag: "ToolResult" }, (value) => value.tool ?? "tool result"),
    Match.when({ _tag: "ToolError" }, (value) => value.tool ?? "tool error"),
    Match.orElse((value) => value._tag),
  );

export const eventLine = (event: DispatchEvent): string =>
  Match.value(event).pipe(
    Match.when({ _tag: "Calling" }, (value) => `calling iteration ${value.iteration ?? "?"}`),
    Match.when(
      { _tag: "CortexRendered" },
      (value) =>
        `cortex ${value.signals?.length ?? 0} signals / ${value.promptMessageCount ?? 0} prompt messages`,
    ),
    Match.when({ _tag: "Text" }, (value) => value.content ?? ""),
    Match.when({ _tag: "Thinking" }, (value) => `[thinking] ${value.content ?? ""}`),
    Match.when(
      { _tag: "ToolCalling" },
      (value) => `-> ${value.tool ?? "tool"} ${JSON.stringify(value.args ?? {})}`,
    ),
    Match.when(
      { _tag: "ToolResult" },
      (value) =>
        `<- ${value.tool ?? "tool"}${value.isError ? " error" : ""}: ${value.content ?? ""}`,
    ),
    Match.when(
      { _tag: "ToolError" },
      (value) => `tool error ${value.tool ?? "tool"}: ${JSON.stringify(value.error ?? {})}`,
    ),
    Match.when(
      { _tag: "Injected" },
      (value) => `injected ${value.injection ?? ""}${value.detail ? `: ${value.detail}` : ""}`,
    ),
    Match.when({ _tag: "Done" }, (value) => `done: ${value.result?.content ?? ""}`),
    Match.when({ _tag: "Failed" }, (value) => `failed: ${value.reason ?? "unknown reason"}`),
    Match.when(
      { _tag: "SatelliteAction" },
      (value) => `satellite ${value.satellite ?? ""} ${value.phase ?? ""}: ${value.action ?? ""}`,
    ),
    Match.orElse((value) => value._tag),
  );

export const eventGlyph = (event: DispatchEvent): string =>
  Match.value(event).pipe(
    Match.when({ _tag: "ToolCalling" }, () => ">>"),
    Match.when({ _tag: "ToolResult" }, () => "<<"),
    Match.when({ _tag: "CortexRendered" }, () => "cx"),
    Match.when({ _tag: "Text" }, () => "tx"),
    Match.when({ _tag: "Thinking" }, () => ".."),
    Match.when({ _tag: "Done" }, () => "ok"),
    Match.when({ _tag: "Failed" }, () => "!"),
    Match.orElse(() => "·"),
  );

export const reportFromEvents = (
  events: ReadonlyArray<DispatchEventEntry>,
): ReportPacket | undefined => {
  const entry = [...events]
    .reverse()
    .find((candidate) => isReportPacket(candidate.event.structured));
  return entry !== undefined && isReportPacket(entry.event.structured)
    ? entry.event.structured
    : undefined;
};

export const finalTextFromEvents = (
  events: ReadonlyArray<DispatchEventEntry>,
): string | undefined =>
  [...events].reverse().find((entry) => entry.event._tag === "Done")?.event.result?.content;

export const dispatchForNode = (
  node: WorkNodeSession | undefined,
  dispatches: ReadonlyArray<DispatchSession>,
): DispatchSession | undefined =>
  dispatches.find((candidate) => candidate.workNodeId === node?.workNodeId);

export const transcriptForDispatch = (
  dispatchId: string | undefined,
  transcripts: ReadonlyArray<DispatchTranscript>,
): DispatchTranscript | undefined =>
  transcripts.find((candidate) => candidate.dispatchId === dispatchId);

export const cortexEventsFromTranscript = (
  transcript: DispatchTranscript | undefined,
): ReadonlyArray<DispatchEventEntry> =>
  transcript?.events.filter((entry) => entry.event._tag === "CortexRendered") ?? [];
