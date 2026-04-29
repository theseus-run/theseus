import { Context } from "effect";
import type { WorkNodeId } from "./types.ts";

export interface CurrentWorkNodeValue {
  readonly workNodeId: WorkNodeId;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly dispatchId?: string;
}

export class CurrentWorkNode extends Context.Service<CurrentWorkNode, CurrentWorkNodeValue>()(
  "CurrentWorkNode",
) {}
