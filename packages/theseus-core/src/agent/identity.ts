import { Context, Layer } from "effect";

export class AgentIdentity extends Context.Service<
  AgentIdentity,
  {
    readonly name: string;
  }
>()("AgentIdentity") {}

export const AgentIdentityLive = (name: string): Layer.Layer<AgentIdentity> =>
  Layer.succeed(AgentIdentity)({ name });
