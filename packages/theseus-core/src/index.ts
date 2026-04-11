/**
 * @theseus.run/core — typed primitives for LLM agent systems.
 *
 * Use namespace imports for the canonical API:
 *
 *   import * as Tool from "@theseus.run/core/Tool"
 *   import * as Dispatch from "@theseus.run/core/Dispatch"
 *   import * as Capsule from "@theseus.run/core/Capsule"
 *   import * as Mission from "@theseus.run/core/Mission"
 *   import * as Grunt from "@theseus.run/core/Grunt"
 *   import * as Agent from "@theseus.run/core/Agent"
 *   import * as AgentComm from "@theseus.run/core/AgentComm"
 *   import * as Bridge from "@theseus.run/core/Bridge"
 *   import * as Daemon from "@theseus.run/core/Daemon"
 *
 * This root barrel re-exports all namespace barrels for convenience.
 * Prefer the direct namespace imports above.
 */

export * as Tool from "./Tool.ts";
export * as Dispatch from "./Dispatch.ts";
export * as Capsule from "./Capsule.ts";
export * as Mission from "./Mission.ts";
export * as Grunt from "./Grunt.ts";
export * as Agent from "./Agent.ts";
export * as AgentComm from "./AgentComm.ts";
export * as Bridge from "./Bridge.ts";
export * as Satellite from "./Satellite.ts";
export * as Daemon from "./Daemon.ts";
