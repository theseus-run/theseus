import { Match } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type {
  CortexAuthority,
  CortexNodeId,
  CortexSignal,
  CortexSignalId,
  CortexSlot,
} from "./cortex-types.ts";

const slotRank: Record<CortexSlot, number> = {
  harness: 0,
  workspace: 1,
  mission: 2,
  "work-node": 3,
  observations: 4,
  recall: 5,
  history: 6,
};

const authorityRank: Record<CortexAuthority, number> = {
  system: 0,
  developer: 1,
  user: 2,
  assistant: 3,
  tool: 4,
};

export const orderedCortexSignals = (
  signals: ReadonlyArray<CortexSignal>,
): ReadonlyArray<CortexSignal> =>
  [...signals].sort(
    (a, b) =>
      authorityRank[a.authority] - authorityRank[b.authority] ||
      slotRank[a.slot] - slotRank[b.slot] ||
      a.priority - b.priority ||
      a.nodeId.localeCompare(b.nodeId) ||
      a.id.localeCompare(b.id),
  );

const toolSignalMessage = (signal: CortexSignal): Prompt.MessageEncoded => ({
  role: "tool",
  content: [
    {
      type: "tool-result",
      id: signal.id,
      name: signal.nodeId,
      isFailure: false,
      result: signal.text,
    },
  ],
});

const systemSignalMessage = (signal: CortexSignal): Prompt.MessageEncoded => ({
  role: "system",
  content: signal.text,
});

const userSignalMessage = (signal: CortexSignal): Prompt.MessageEncoded => ({
  role: "user",
  content: signal.text,
});

const assistantSignalMessage = (signal: CortexSignal): Prompt.MessageEncoded => ({
  role: "assistant",
  content: signal.text,
});

export const cortexSignalToMessage = (signal: CortexSignal): Prompt.MessageEncoded =>
  Match.value(signal.authority).pipe(
    Match.when("system", () => systemSignalMessage(signal)),
    Match.when("developer", () => systemSignalMessage(signal)),
    Match.when("user", () => userSignalMessage(signal)),
    Match.when("assistant", () => assistantSignalMessage(signal)),
    Match.when("tool", () => toolSignalMessage(signal)),
    Match.exhaustive,
  );

const normalizePriority = (priority: number | undefined): number =>
  Match.value(priority).pipe(
    Match.when(undefined, () => 0),
    Match.orElse((value) => value),
  );

export const CortexSignals = {
  text: (input: {
    readonly id: CortexSignalId;
    readonly nodeId: CortexNodeId;
    readonly slot: CortexSlot;
    readonly authority: CortexAuthority;
    readonly priority?: number;
    readonly text: string;
  }): CortexSignal => ({
    id: input.id,
    nodeId: input.nodeId,
    slot: input.slot,
    authority: input.authority,
    priority: normalizePriority(input.priority),
    text: input.text,
  }),
};
