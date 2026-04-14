import { ToolCallRow, ToolCallRowBody, ToolCallRowPrefix } from "@/components/ui/tool-call-row";
import type { ToolCall } from "./types";

function renderPayload(tool: ToolCall, mode: "command" | "summary") {
  const summary = mode === "command" ? tool.command : tool.summary;

  return [`id=${tool.id}`, `type=${tool.eventType}`, `summary=${summary}`].join(", ");
}

export function ToolCallsList({
  toolCalls,
  onSelect,
  mode,
}: {
  toolCalls: ToolCall[];
  onSelect: (toolId: string) => void;
  mode: "command" | "summary";
}) {
  return toolCalls.map((tool) => (
    <ToolCallRow key={tool.id} tone={tool.tone} onClick={() => onSelect(tool.id)}>
      <ToolCallRowPrefix>↗</ToolCallRowPrefix>
      <ToolCallRowBody>
        <span className="strong-text">{tool.tool}</span>
        <span aria-hidden="true"> </span>
        <span>[{renderPayload(tool, mode)}]</span>
      </ToolCallRowBody>
    </ToolCallRow>
  ));
}
