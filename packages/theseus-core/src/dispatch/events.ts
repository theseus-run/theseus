import { Match } from "effect";
import type { Presentation } from "../tool/index.ts";
import { presentationToText, tryParseArgs } from "./step.ts";
import type {
  DispatchEvent,
  DispatchOutput,
  ToolCall,
  ToolCallError,
  ToolCallResult,
} from "./types.ts";

export const isTerminal = (event: DispatchEvent): boolean =>
  Match.value(event).pipe(
    Match.tags({
      Calling: () => false,
      Text: () => false,
      Thinking: () => false,
      ToolCalling: () => false,
      ToolResult: () => false,
      ToolError: () => false,
      SatelliteAction: () => false,
      Injected: () => false,
      Done: () => true,
      Failed: () => true,
    }),
    Match.exhaustive,
  );

export const calling = (name: string, iteration: number): DispatchEvent => ({
  _tag: "Calling",
  name,
  iteration,
});

export const text = (name: string, iteration: number, content: string): DispatchEvent => ({
  _tag: "Text",
  name,
  iteration,
  content,
});

export const thinking = (name: string, iteration: number, content: string): DispatchEvent => ({
  _tag: "Thinking",
  name,
  iteration,
  content,
});

export const toolCalling = (
  name: string,
  iteration: number,
  toolCall: ToolCall,
): DispatchEvent => ({
  _tag: "ToolCalling",
  name,
  iteration,
  tool: toolCall.name,
  args: tryParseArgs(toolCall),
});

export const toolResult = (
  name: string,
  iteration: number,
  result: ToolCallResult,
): DispatchEvent => {
  const event = {
    _tag: "ToolResult",
    name,
    iteration,
    tool: result.name,
    content: result.textContent,
    isError: result.presentation.isError ?? false,
  } satisfies DispatchEvent;

  return result.presentation.structured === undefined
    ? event
    : { ...event, structured: result.presentation.structured };
};

export const toolError = (
  name: string,
  iteration: number,
  toolCall: ToolCall,
  error: ToolCallError,
): DispatchEvent => ({
  _tag: "ToolError",
  name,
  iteration,
  tool: toolCall.name,
  error,
});

export const satelliteAction = (
  name: string,
  iteration: number,
  satellite: string,
  phase: string,
  action: string,
): DispatchEvent => ({
  _tag: "SatelliteAction",
  name,
  iteration,
  satellite,
  phase,
  action,
});

export const injected = (
  name: string,
  iteration: number,
  injection: string,
  detail?: string,
): DispatchEvent => {
  const event = {
    _tag: "Injected",
    name,
    iteration,
    injection,
  } satisfies DispatchEvent;

  return detail === undefined ? event : { ...event, detail };
};

export const done = (name: string, result: DispatchOutput): DispatchEvent => ({
  _tag: "Done",
  name,
  result,
});

export const failed = (name: string, reason: string): DispatchEvent => ({
  _tag: "Failed",
  name,
  reason,
});

export const resultFromPresentation = (
  toolCall: { readonly id: string; readonly name: string },
  args: unknown,
  presentation: Presentation,
): ToolCallResult => ({
  callId: toolCall.id,
  name: toolCall.name,
  args,
  presentation,
  textContent: presentationToText(presentation),
});
