import { describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { runToolCall } from "../dispatch/step.ts";
import { Defaults, defineTool } from "./index.ts";
import { callTool } from "./run.ts";

describe("tool boundary", () => {
  test("defineTool defaults execution to sequential", () => {
    const uppercase = defineTool({
      name: "uppercase",
      description: "Uppercase a string argument",
      input: Schema.String,
      output: Schema.String,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: (input) => Effect.succeed(input.toUpperCase()),
    });

    expect(uppercase.execution).toEqual({ mode: "sequential" });
  });

  test("callTool validates success output against the declared schema", async () => {
    const badOutput = defineTool({
      name: "bad_output",
      description: "Returns the wrong runtime shape",
      input: Defaults.NoInput,
      output: Schema.String,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: () => Effect.succeed(42 as unknown as string),
    });

    const error = await Effect.runPromise(Effect.flip(callTool(badOutput, {})));

    expect(error._tag).toBe("ToolOutputError");
  });

  test("callTool validates known failures against the declared schema", async () => {
    const Failure = Schema.Struct({ code: Schema.String });
    const badFailure = defineTool({
      name: "bad_failure",
      description: "Fails with the wrong runtime shape",
      input: Defaults.NoInput,
      output: Schema.String,
      failure: Failure,
      policy: { interaction: "pure" },
      execute: () => Effect.fail({ code: 500 } as unknown as Schema.Schema.Type<typeof Failure>),
    });

    const error = await Effect.runPromise(Effect.flip(callTool(badFailure, {})));

    expect(error._tag).toBe("ToolFailureError");
  });

  test("runToolCall lets the tool schema decide parsed non-object arguments", async () => {
    const uppercase = defineTool({
      name: "uppercase",
      description: "Uppercase a string argument",
      input: Schema.String,
      output: Schema.String,
      failure: Defaults.NoFailure,
      policy: { interaction: "pure" },
      execute: (input) => Effect.succeed(input.toUpperCase()),
    });

    const result = await Effect.runPromise(
      runToolCall([uppercase], {
        id: "call-1",
        name: "uppercase",
        arguments: JSON.stringify("hello"),
      }),
    );

    expect(result.args).toBe("hello");
    expect(result.outcome?._tag).toBe("Success");
    expect(result.textContent).toBe("HELLO");
  });
});
