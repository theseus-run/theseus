import { Context } from "effect";

export interface CurrentWorkNodeValue {
  readonly workNodeId: string;
  readonly missionId: string;
  readonly capsuleId: string;
  readonly dispatchId?: string;
}

export class CurrentWorkNode extends Context.Service<CurrentWorkNode, CurrentWorkNodeValue>()(
  "CurrentWorkNode",
) {}
