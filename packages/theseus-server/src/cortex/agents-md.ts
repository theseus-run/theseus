import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { Data, Effect, Match } from "effect";

type AgentsMdContent =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Loaded"; readonly text: string };

interface AgentsMdSnapshot {
  readonly path: string;
  readonly content: AgentsMdContent;
}

class AgentsMdReadFailed extends Data.TaggedError("AgentsMdReadFailed")<{
  readonly cause: unknown;
}> {}

const nodeId = "root-agents-md";
const missingContent: AgentsMdContent = { _tag: "Missing" };
const missing = Effect.succeed(missingContent);
const loaded = (text: string): AgentsMdContent => ({ _tag: "Loaded", text });

const isNodeFsError = (cause: unknown): cause is { readonly code?: unknown } =>
  typeof cause === "object" && cause !== null && "code" in cause;

const isMissingFileError = (error: AgentsMdReadFailed): boolean =>
  isNodeFsError(error.cause) && error.cause.code === "ENOENT";

const dieReadFailure = (path: string, error: AgentsMdReadFailed): Effect.Effect<never> =>
  Effect.die(new Error(`AgentsMdReadFailed: ${path}`, { cause: error }));

const readOptionalText = (path: string): Effect.Effect<AgentsMdContent> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new AgentsMdReadFailed({ cause }),
  }).pipe(
    Effect.map(loaded),
    Effect.catchIf(isMissingFileError, () => missing),
    Effect.catch((error) => dieReadFailure(path, error)),
  );

const renderAgentsMd = (snapshot: AgentsMdSnapshot): ReadonlyArray<Dispatch.CortexSignal> =>
  Match.value(snapshot.content).pipe(
    Match.tag("Missing", () => []),
    Match.tag("Loaded", ({ text }) => [
      Dispatch.CortexSignals.text({
        id: `${nodeId}:${snapshot.path}`,
        nodeId,
        slot: "workspace",
        authority: "developer",
        priority: 0,
        text: `Workspace instructions from ${snapshot.path}:\n\n${text}`,
      }),
    ]),
    Match.exhaustive,
  );

const contentKey = (content: AgentsMdContent): string =>
  Match.value(content).pipe(
    Match.tag("Missing", () => "missing"),
    Match.tag("Loaded", ({ text }) => text),
    Match.exhaustive,
  );

const sameContent = (previous: AgentsMdSnapshot, next: AgentsMdSnapshot): boolean =>
  contentKey(previous.content) === contentKey(next.content);

const diffAgentsMdSnapshot = (
  previous: AgentsMdSnapshot | undefined,
  next: AgentsMdSnapshot,
): Dispatch.CortexDiff<AgentsMdSnapshot> =>
  Match.value(previous).pipe(
    Match.when(undefined, () => Dispatch.CortexDiffs.initial(next)),
    Match.when(
      (existing) => sameContent(existing, next),
      () => Dispatch.CortexDiffs.unchanged(next),
    ),
    Match.orElse((existing) => Dispatch.CortexDiffs.changed(existing, next)),
  );

export const RootAgentsMdCortexNode = (
  workspace: string,
): Dispatch.CortexNode<AgentsMdSnapshot> => {
  const path = join(workspace, "AGENTS.md");
  return {
    id: nodeId,
    snapshot: () =>
      Effect.gen(function* () {
        return {
          path: "AGENTS.md",
          content: yield* readOptionalText(path),
        };
      }),
    diff: diffAgentsMdSnapshot,
    emit: (snapshot) => Effect.succeed(renderAgentsMd(snapshot)),
  };
};
