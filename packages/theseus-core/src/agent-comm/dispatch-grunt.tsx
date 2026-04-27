/** @jsxImportSource @theseus.run/jsx-md */

/**
 * theseus_dispatch_grunt — issue a structured order to a runtime-owned grunt.
 */

import { render } from "@theseus.run/jsx-md";
import { Cause, Context, Effect, Exit, Fiber, Match, Ref, Schema, Stream } from "effect";
import { type Blueprint, BlueprintRegistry } from "../agent/index.ts";
import { dispatch as dispatchLoop } from "../dispatch/index.ts";
import type { LanguageModelGateway } from "../dispatch/model-gateway.ts";
import { CurrentDispatch, type DispatchStore } from "../dispatch/store.ts";
import type { DispatchEvent, DispatchHandle, DispatchSpec } from "../dispatch/types.ts";
import type { SatelliteRing } from "../satellite/ring.ts";
import { defineTool, type Tool, type ToolAnyWith, textPresentation } from "../tool/index.ts";
import { GruntPrompt } from "./briefing.tsx";
import { type DispatchGruntInput, DispatchGruntInputSchema } from "./order.ts";
import { type Report, ReportSchema, report } from "./report.ts";
import {
  DispatchGruntResult,
  DispatchGruntResultSchema,
  type DispatchGruntResult as DispatchGruntResultType,
} from "./result.ts";

export class DispatchGruntFailed extends Schema.TaggedErrorClass<DispatchGruntFailed>()(
  "DispatchGruntFailed",
  {
    reason: Schema.String,
  },
) {}

export interface DispatchGruntLaunchInput<R> {
  readonly target: string;
  readonly blueprint: Blueprint<R>;
  readonly systemPrompt: string;
  readonly task: string;
}

export class DispatchGruntLauncher extends Context.Service<
  DispatchGruntLauncher,
  {
    readonly launch: <R>(
      input: DispatchGruntLaunchInput<R>,
    ) => Effect.Effect<DispatchHandle, DispatchGruntFailed, R | CurrentDispatch>;
  }
>()("DispatchGruntLauncher") {}

export const DispatchGruntLauncherLive = Effect.gen(function* () {
  return DispatchGruntLauncher.of({
    launch: <R,>({ blueprint, systemPrompt, task }: DispatchGruntLaunchInput<R>) =>
      Effect.gen(function* () {
        const parentDispatch = yield* CurrentDispatch;
        return yield* dispatchLoop(
          {
            ...blueprint,
            systemPrompt,
            tools: [...blueprint.tools, report] as ReadonlyArray<ToolAnyWith<unknown>>,
          } as DispatchSpec<unknown>,
          task,
          { parentDispatchId: parentDispatch.id },
        ).pipe(
          Effect.mapError(
            (cause) =>
              new DispatchGruntFailed({
                reason: `Unable to launch grunt dispatch: ${String(Cause.squash(cause))}`,
              }),
          ),
        );
      }) as Effect.Effect<DispatchHandle, DispatchGruntFailed, R | CurrentDispatch>,
  });
});

const parseJson = (content: string): unknown | undefined => {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
};

const decodeReportContent = (content: string): Effect.Effect<Report | undefined> => {
  const parsed = parseJson(content);
  if (parsed === undefined) return Effect.as(Effect.void, undefined);
  return Schema.decodeUnknownEffect(ReportSchema)(parsed).pipe(
    Effect.matchEffect({
      onFailure: () => Effect.as(Effect.void, undefined),
      onSuccess: (decoded) => Effect.succeed(decoded),
    }),
  );
};

const captureReport = (
  event: DispatchEvent,
  reportRef: Ref.Ref<Report | undefined>,
): Effect.Effect<void> =>
  event._tag === "ToolResult" && event.tool === report.name && !event.isError
    ? Effect.gen(function* () {
        const existing = yield* Ref.get(reportRef);
        if (existing !== undefined) return;
        const decoded = yield* decodeReportContent(event.content);
        if (decoded !== undefined) yield* Ref.set(reportRef, decoded);
      })
    : Effect.void;

const presentDispatchGruntResult = (result: DispatchGruntResultType): string => {
  return Match.value(result).pipe(
    Match.tag("Reported", ({ report: packet }) => {
      const evidence =
        packet.evidence && packet.evidence.length > 0
          ? `\n\nEvidence:\n${packet.evidence.map((e) => `- ${e.ref ? `${e.ref}: ` : ""}${e.text}`).join("\n")}`
          : "";
      return `[${packet.channel}] ${packet.summary}\n\n${packet.content}${evidence}`;
    }),
    Match.tag(
      "Unstructured",
      ({ salvage }) => `[unstructured] ${salvage.summary}\n\n${salvage.content}`,
    ),
    Match.exhaustive,
  );
};

export const dispatchGruntTool: Tool<
  DispatchGruntInput,
  DispatchGruntResultType,
  DispatchGruntFailed,
  | BlueprintRegistry
  | DispatchGruntLauncher
  | LanguageModelGateway
  | SatelliteRing
  | DispatchStore
  | CurrentDispatch
> = defineTool({
  name: "theseus_dispatch_grunt",
  description:
    "Dispatch a runtime-owned grunt with a structured order. Returns a protocol report or explicit unstructured salvage.",
  input: DispatchGruntInputSchema,
  output: DispatchGruntResultSchema,
  failure: DispatchGruntFailed,
  policy: { interaction: "write" },
  execute: ({ target, order }) =>
    Effect.gen(function* () {
      const registry = yield* BlueprintRegistry;
      const launcher = yield* DispatchGruntLauncher;
      const gruntBlueprint = yield* registry
        .get(target)
        .pipe(
          Effect.mapError(() => new DispatchGruntFailed({ reason: `Unknown target: ${target}` })),
        );

      const systemPrompt = render(
        <GruntPrompt basePrompt={gruntBlueprint.systemPrompt} order={order} />,
      );
      const handle = yield* launcher.launch({
        target,
        blueprint: gruntBlueprint,
        systemPrompt,
        task: order.objective,
      });
      const reportRef = yield* Ref.make<Report | undefined>(undefined);
      const drainFiber = yield* handle.events.pipe(
        Stream.runForEach((event) => captureReport(event, reportRef)),
        Effect.forkChild,
      );

      const exit = yield* Effect.exit(handle.result);
      yield* Fiber.join(drainFiber);

      const captured = yield* Ref.get(reportRef);

      if (Exit.isSuccess(exit)) {
        if (captured !== undefined) {
          return DispatchGruntResult.reported({
            target,
            dispatchId: exit.value.dispatchId,
            report: captured,
            usage: exit.value.usage,
          });
        }

        return DispatchGruntResult.unstructured({
          target,
          dispatchId: exit.value.dispatchId,
          reason: `No valid ${report.name} packet was captured before the grunt stopped.`,
          salvage: {
            summary: "No valid protocol report",
            content: exit.value.content,
          },
          usage: exit.value.usage,
        });
      }

      return yield* new DispatchGruntFailed({
        reason: `Grunt dispatch failed: ${String(Cause.squash(exit.cause))}`,
      });
    }),
  present: (value) =>
    Effect.succeed(
      Match.value(value).pipe(
        Match.tag("Success", ({ output }) =>
          textPresentation(presentDispatchGruntResult(output), { structured: output }),
        ),
        Match.tag("Failure", ({ failure }) =>
          textPresentation(failure.reason, { isError: true, structured: failure }),
        ),
        Match.exhaustive,
      ),
    ),
});
