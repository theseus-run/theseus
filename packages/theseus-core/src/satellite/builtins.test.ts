import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { textPresentation } from "../tool/index.ts";
import {
  DispatchModelFailed,
  ToolCallBadArgs,
  ToolCallFailed,
  ToolCallUnknown,
  type ToolCall,
  type ToolCallResult,
} from "../dispatch/types.ts";
import { toolGuard } from "./tool-guard.ts";
import { toolRecovery } from "./tool-recovery.ts";
import { tokenBudget } from "./token-budget.ts";

const ctx = { dispatchId: "d", name: "runner", task: "task", iteration: 0 };

const tool: ToolCall = {
  id: "call-1",
  name: "read_file",
  arguments: "{}",
};

const result: ToolCallResult = {
  callId: "call-1",
  name: "read_file",
  args: {},
  presentation: textPresentation("ok"),
  textContent: "ok",
};

describe("toolRecovery", () => {
  test("recovers unknown tools as error tool results", async () => {
    const state = await Effect.runPromise(toolRecovery.open({ ...ctx }));
    const recovered = await Effect.runPromise(
      toolRecovery.toolError?.(
        { tool, error: new ToolCallUnknown({ callId: tool.id, name: "missing" }) },
        ctx,
        state,
      ) ?? Effect.die("missing hook"),
    );

    expect(recovered.decision._tag).toBe("RecoverToolError");
    if (recovered.decision._tag === "RecoverToolError") {
      expect(recovered.decision.result.presentation.isError).toBe(true);
      expect(recovered.decision.result.textContent).toContain("unknown tool");
    }
  });

  test("recovers malformed args as error tool results", async () => {
    const state = await Effect.runPromise(toolRecovery.open({ ...ctx }));
    const recovered = await Effect.runPromise(
      toolRecovery.toolError?.(
        { tool, error: new ToolCallBadArgs({ callId: tool.id, name: tool.name, raw: "{" }) },
        ctx,
        state,
      ) ?? Effect.die("missing hook"),
    );

    expect(recovered.decision._tag).toBe("RecoverToolError");
    if (recovered.decision._tag === "RecoverToolError") {
      expect(recovered.decision.result.presentation.isError).toBe(true);
      expect(recovered.decision.result.textContent).toContain("invalid JSON");
    }
  });

  test("recovers tool dispatch failures as error tool results", async () => {
    const state = await Effect.runPromise(toolRecovery.open({ ...ctx }));
    const recovered = await Effect.runPromise(
      toolRecovery.toolError?.(
        {
          tool,
          error: new ToolCallFailed({
            callId: tool.id,
            name: tool.name,
            args: {},
            cause: new DispatchModelFailed({
              dispatchId: "d",
              name: "runner",
              message: "model broke",
            }) as never,
          }),
        },
        ctx,
        state,
      ) ?? Effect.die("missing hook"),
    );

    expect(recovered.decision._tag).toBe("RecoverToolError");
    if (recovered.decision._tag === "RecoverToolError") {
      expect(recovered.decision.result.presentation.isError).toBe(true);
      expect(recovered.decision.result.textContent).toContain("model broke");
    }
  });
});

describe("toolGuard", () => {
  test("blocks configured tools with error presentation", async () => {
    const guard = toolGuard(["read_file"]);
    const state = await Effect.runPromise(guard.open({ ...ctx }));
    const blocked = await Effect.runPromise(
      guard.beforeTool?.({ tool }, ctx, state) ?? Effect.die("missing hook"),
    );

    expect(blocked.decision._tag).toBe("BlockTool");
    if (blocked.decision._tag === "BlockTool") {
      expect(blocked.decision.presentation.isError).toBe(true);
      expect(blocked.decision.presentation.content[0]?._tag).toBe("text");
    }
  });

  test("passes tools that are not configured as blocked", async () => {
    const guard = toolGuard(["shell"]);
    const state = await Effect.runPromise(guard.open({ ...ctx }));
    const passed = await Effect.runPromise(
      guard.beforeTool?.({ tool }, ctx, state) ?? Effect.die("missing hook"),
    );

    expect(passed.decision._tag).toBe("Pass");
  });
});

describe("tokenBudget", () => {
  test("tracks usage below threshold", async () => {
    const budget = tokenBudget(10);
    const state = await Effect.runPromise(budget.open({ ...ctx }));
    const checked = await Effect.runPromise(
      budget.afterCall?.(
        { stepResult: { content: "", toolCalls: [], usage: { inputTokens: 2, outputTokens: 3 } } },
        ctx,
        state,
      ) ?? Effect.die("missing hook"),
    );

    expect(checked.decision._tag).toBe("Pass");
    expect(checked.state).toBe(5);
  });

  test("aborts when cumulative usage exceeds threshold", async () => {
    const budget = tokenBudget(4);
    const state = await Effect.runPromise(budget.open({ ...ctx }));
    const error = await Effect.runPromise(
      Effect.flip(
        budget.afterCall?.(
          {
            stepResult: {
              content: "",
              toolCalls: [],
              usage: { inputTokens: 2, outputTokens: 3 },
            },
          },
          ctx,
          state,
        ) ?? Effect.die("missing hook"),
      ),
    );

    expect(error._tag).toBe("SatelliteAbort");
    expect(error.satellite).toBe("token-budget");
  });
});
