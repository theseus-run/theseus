import { Effect, Layer, Ref } from "effect";
import { cortexSignalToMessage, orderedCortexSignals } from "./cortex-signals.ts";
import type { CortexNode, CortexRenderInput, CortexSignal } from "./cortex-types.ts";
import { Cortex } from "./cortex-types.ts";

type CortexSnapshotKey = string;

const unsafePreviousSnapshotFor = <State>(
  snapshots: ReadonlyMap<CortexSnapshotKey, unknown>,
  key: CortexSnapshotKey,
): State | undefined => snapshots.get(key) as State | undefined;

const snapshotKeyFor = (input: CortexRenderInput, node: CortexNode): CortexSnapshotKey =>
  `${input.dispatch.dispatchId}:${node.id}`;

const renderNode = <State>(
  node: CortexNode<State>,
  input: CortexRenderInput,
  snapshotsRef: Ref.Ref<ReadonlyMap<CortexSnapshotKey, unknown>>,
): Effect.Effect<ReadonlyArray<CortexSignal>> =>
  Effect.gen(function* () {
    const snapshots = yield* Ref.get(snapshotsRef);
    const key = snapshotKeyFor(input, node);
    const previous = unsafePreviousSnapshotFor<State>(snapshots, key);
    const state = yield* node.snapshot(input);
    const diff = node.diff(previous, state);
    yield* Ref.update(snapshotsRef, (current) => new Map([...current, [key, state]]));
    return yield* node.emit(state, diff);
  });

export const CortexStack = (nodes: ReadonlyArray<CortexNode>): Layer.Layer<Cortex> =>
  Layer.effect(Cortex)(
    Effect.gen(function* () {
      const snapshotsRef = yield* Ref.make<ReadonlyMap<CortexSnapshotKey, unknown>>(new Map());
      return Cortex.of({
        render: (input) =>
          Effect.gen(function* () {
            const signalGroups = yield* Effect.forEach(nodes, (node) =>
              renderNode(node, input, snapshotsRef),
            );
            const signals = orderedCortexSignals(signalGroups.flat());
            return {
              signals,
              messages: [...signals.map(cortexSignalToMessage), ...input.history],
            };
          }),
      });
    }),
  );

export const NoopCortex = Layer.succeed(Cortex)(
  Cortex.of({
    render: ({ history }) => Effect.succeed({ signals: [], messages: history }),
  }),
);
