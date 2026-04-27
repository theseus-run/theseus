import type * as Agent from "@theseus.run/core/Agent";
import * as AgentComm from "@theseus.run/core/AgentComm";
import type * as Dispatch from "@theseus.run/core/Dispatch";
import type { SerializedDispatchSpec } from "@theseus.run/runtime/tool-catalog";
import { readonlyTools } from "@theseus.run/tools";

const coordinatorModel: Dispatch.ModelRequest = {
  provider: "openai",
  model: "gpt-5.5",
};

const researchModel: Dispatch.ModelRequest = {
  provider: "openai",
  model: "gpt-5.3-codex-spark",
};

export const researchGruntTarget = "poc-research-grunt";

export const researchGruntBlueprint: Agent.Blueprint = {
  name: researchGruntTarget,
  modelRequest: researchModel,
  systemPrompt: [
    "You are a research grunt for a Theseus mission.",
    "Inspect the repository using read-only tools.",
    "Return one structured report by calling theseus_report.",
    "Do not summarize directly without reporting.",
  ].join("\n"),
  tools: readonlyTools,
  maxIterations: 12,
};

export const researchPocCoordinatorSpec: SerializedDispatchSpec = {
  name: "poc-research-coordinator",
  modelRequest: coordinatorModel,
  systemPrompt: [
    "You are a mission coordinator.",
    `You cannot inspect files directly. Delegate repository inspection to ${researchGruntTarget} with theseus_dispatch_grunt.`,
    "Wait for the grunt report, then give the human a concise final summary.",
    "Do not call tools other than theseus_dispatch_grunt.",
  ].join("\n"),
  tools: [{ name: AgentComm.dispatchGruntTool.name }],
  maxIterations: 8,
};
