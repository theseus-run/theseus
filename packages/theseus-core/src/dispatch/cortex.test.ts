import { describe, expect, test } from "bun:test";
import { Effect, Match } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import {
  Cortex,
  CortexDiffs,
  type CortexDiff as CortexDiffType,
  type CortexNode,
  CortexSignals,
  CortexStack,
  NoopCortex,
} from "./cortex.ts";

const renderWith = (
  node: CortexNode,
  history: ReadonlyArray<Prompt.MessageEncoded> = [{ role: "user", content: "task" }],
) =>
  Effect.gen(function* () {
    const cortex = yield* Cortex;
    return yield* cortex.render({
      history,
      dispatch: {
        dispatchId: "dispatch-1",
        name: "runner",
        task: "task",
        iteration: 0,
      },
    });
  }).pipe(Effect.provide(CortexStack([node])));

describe("CortexStack", () => {
  test("NoopCortex preserves dispatch history", async () => {
    const history: ReadonlyArray<Prompt.MessageEncoded> = [{ role: "user", content: "task" }];

    const frame = await Effect.runPromise(
      Effect.gen(function* () {
        const cortex = yield* Cortex;
        return yield* cortex.render({
          history,
          dispatch: {
            dispatchId: "dispatch-1",
            name: "runner",
            task: "task",
            iteration: 0,
          },
        });
      }).pipe(Effect.provide(NoopCortex)),
    );

    expect(frame.signals).toEqual([]);
    expect(frame.messages).toEqual(history);
  });

  test("renders node signals before dispatch history", async () => {
    const node: CortexNode<{ readonly instruction: string }> = {
      id: "test-node",
      snapshot: () => Effect.succeed({ instruction: "follow workspace rules" }),
      diff: (_previous, next): CortexDiffType<{ readonly instruction: string }> =>
        CortexDiffs.initial(next),
      emit: (state) =>
        Effect.succeed([
          CortexSignals.text({
            id: "test-node:workspace",
            nodeId: "test-node",
            slot: "workspace",
            authority: "developer",
            text: state.instruction,
          }),
        ]),
    };

    const frame = await Effect.runPromise(renderWith(node));

    expect(frame.signals.map((signal) => signal.id)).toEqual(["test-node:workspace"]);
    expect(frame.messages).toEqual([
      { role: "system", content: "follow workspace rules" },
      { role: "user", content: "task" },
    ]);
  });

  test("orders signals by authority, slot, priority, and stable ids", async () => {
    const node: CortexNode<void> = {
      id: "ordering-node",
      snapshot: () => Effect.void,
      diff: (): CortexDiffType<void> => CortexDiffs.initial(undefined),
      emit: () =>
        Effect.succeed([
          CortexSignals.text({
            id: "mission",
            nodeId: "ordering-node",
            slot: "mission",
            authority: "user",
            text: "mission",
          }),
          CortexSignals.text({
            id: "workspace",
            nodeId: "ordering-node",
            slot: "workspace",
            authority: "developer",
            text: "workspace",
          }),
          CortexSignals.text({
            id: "harness-low",
            nodeId: "ordering-node",
            slot: "harness",
            authority: "developer",
            priority: 10,
            text: "harness low",
          }),
          CortexSignals.text({
            id: "harness-high",
            nodeId: "ordering-node",
            slot: "harness",
            authority: "developer",
            priority: 0,
            text: "harness high",
          }),
          CortexSignals.text({
            id: "system",
            nodeId: "ordering-node",
            slot: "observations",
            authority: "system",
            text: "system",
          }),
        ]),
    };

    const frame = await Effect.runPromise(renderWith(node));

    expect(frame.signals.map((signal) => signal.id)).toEqual([
      "system",
      "harness-high",
      "harness-low",
      "workspace",
      "mission",
    ]);
  });

  test("passes previous node snapshot into node-local diff", async () => {
    const diffs: string[] = [];
    let value = "first";
    const node: CortexNode<{ readonly value: string }> = {
      id: "diff-node",
      snapshot: () => Effect.sync(() => ({ value })),
      diff: (previous, next): CortexDiffType<{ readonly value: string }> => {
        diffs.push(
          Match.value(previous).pipe(
            Match.when(undefined, () => `initial:${next.value}`),
            Match.orElse((existing) => `${existing.value}->${next.value}`),
          ),
        );
        return Match.value(previous).pipe(
          Match.when(undefined, () => CortexDiffs.initial(next)),
          Match.orElse((existing) => CortexDiffs.changed(existing, next)),
        );
      },
      emit: (state) =>
        Effect.succeed([
          CortexSignals.text({
            id: "diff-node:value",
            nodeId: "diff-node",
            slot: "observations",
            authority: "user",
            text: state.value,
          }),
        ]),
    };

    const program = Effect.gen(function* () {
      const cortex = yield* Cortex;
      yield* cortex.render({
        history: [],
        dispatch: {
          dispatchId: "dispatch-1",
          name: "runner",
          task: "task",
          iteration: 0,
        },
      });
      value = "second";
      yield* cortex.render({
        history: [],
        dispatch: {
          dispatchId: "dispatch-1",
          name: "runner",
          task: "task",
          iteration: 1,
        },
      });
    }).pipe(Effect.provide(CortexStack([node])));

    await Effect.runPromise(program);

    expect(diffs).toEqual(["initial:first", "first->second"]);
  });

  test("keeps node snapshot diffs scoped to a dispatch", async () => {
    const diffs: string[] = [];
    const node: CortexNode<{ readonly dispatchId: string }> = {
      id: "scope-node",
      snapshot: (input) => Effect.succeed({ dispatchId: input.dispatch.dispatchId }),
      diff: (previous, next): CortexDiffType<{ readonly dispatchId: string }> => {
        diffs.push(
          Match.value(previous).pipe(
            Match.when(undefined, () => `initial:${next.dispatchId}`),
            Match.orElse(() => "changed"),
          ),
        );
        return Match.value(previous).pipe(
          Match.when(undefined, () => CortexDiffs.initial(next)),
          Match.orElse((existing) => CortexDiffs.changed(existing, next)),
        );
      },
      emit: () => Effect.succeed([]),
    };

    const program = Effect.gen(function* () {
      const cortex = yield* Cortex;
      yield* cortex.render({
        history: [],
        dispatch: {
          dispatchId: "dispatch-1",
          name: "runner",
          task: "task",
          iteration: 0,
        },
      });
      yield* cortex.render({
        history: [],
        dispatch: {
          dispatchId: "dispatch-2",
          name: "runner",
          task: "task",
          iteration: 0,
        },
      });
    }).pipe(Effect.provide(CortexStack([node])));

    await Effect.runPromise(program);

    expect(diffs).toEqual(["initial:dispatch-1", "initial:dispatch-2"]);
  });
});
