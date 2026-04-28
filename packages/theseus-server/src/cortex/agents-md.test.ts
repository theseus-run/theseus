import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Dispatch from "@theseus.run/core/Dispatch";
import { Effect } from "effect";
import { RootAgentsMdCortexNode } from "./agents-md.ts";

const renderRootAgentsMd = (workspace: string) =>
  Effect.gen(function* () {
    const cortex = yield* Dispatch.Cortex;
    return yield* cortex.render({
      history: [{ role: "user", content: "task" }],
      dispatch: {
        dispatchId: "dispatch-1",
        name: "runner",
        task: "task",
        iteration: 0,
      },
    });
  }).pipe(Effect.provide(Dispatch.CortexStack([RootAgentsMdCortexNode(workspace)])));

describe("RootAgentsMdCortexNode", () => {
  test("loads root AGENTS.md as workspace developer context", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "theseus-agents-md-"));
    await writeFile(join(workspace, "AGENTS.md"), "Follow the workspace rules.", "utf8");

    const frame = await Effect.runPromise(renderRootAgentsMd(workspace));

    expect(frame.signals).toEqual([
      {
        id: "root-agents-md:AGENTS.md",
        nodeId: "root-agents-md",
        slot: "workspace",
        authority: "developer",
        priority: 0,
        text: "Workspace instructions from AGENTS.md:\n\nFollow the workspace rules.",
      },
    ]);
    expect(frame.messages).toEqual([
      {
        role: "system",
        content: "Workspace instructions from AGENTS.md:\n\nFollow the workspace rules.",
      },
      { role: "user", content: "task" },
    ]);
  });

  test("is silent when root AGENTS.md is absent", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "theseus-no-agents-md-"));

    const frame = await Effect.runPromise(renderRootAgentsMd(workspace));

    expect(frame.signals).toEqual([]);
    expect(frame.messages).toEqual([{ role: "user", content: "task" }]);
  });

  test("surfaces non-missing AGENTS.md read failures", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "theseus-bad-agents-md-"));
    await mkdir(join(workspace, "AGENTS.md"));

    await expect(Effect.runPromise(renderRootAgentsMd(workspace))).rejects.toThrow(
      "AgentsMdReadFailed",
    );
  });
});
