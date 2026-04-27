import type * as Agent from "@theseus.run/core/Agent";
import * as AgentComm from "@theseus.run/core/AgentComm";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type { SerializedDispatchSpec } from "@theseus.run/runtime/tool-catalog";
import { readonlyTools } from "@theseus.run/tools";

export const researchGruntTarget = "poc-research-grunt";

const researchPocModel: Dispatch.CopilotModelRequest = {
  provider: "copilot",
  model: "gpt-5.4",
};

export const researchGruntBlueprint: Agent.Blueprint = {
  name: researchGruntTarget,
  systemPrompt: [
    "You are a research grunt for a Theseus mission.",
    "Inspect narrowly using read-only tools.",
    "For the repository-summary POC, use at most one inspection round: read package.json, read README.md, and list packages.",
    "Then return one structured report by calling theseus_report.",
    "Do not summarize directly without reporting.",
  ].join("\n"),
  tools: [...readonlyTools, AgentComm.report],
  maxIterations: 5,
  modelRequest: researchPocModel,
};

export const researchPocCoordinatorSpec: SerializedDispatchSpec = {
  name: "poc-research-coordinator",
  systemPrompt: [
    "You are a mission coordinator.",
    `You cannot inspect files directly. Delegate repository inspection to ${researchGruntTarget} with theseus_dispatch_grunt.`,
    "Delegate exactly once. Ask the grunt to inspect package.json, README.md, and the packages directory, then report.",
    "Wait for the grunt report, then give the human a concise final summary.",
    "Do not call tools other than theseus_dispatch_grunt.",
  ].join("\n"),
  tools: [{ name: AgentComm.dispatchGruntTool.name }],
  maxIterations: 4,
  modelRequest: researchPocModel,
};
