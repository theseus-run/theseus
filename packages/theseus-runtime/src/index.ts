/**
 * Runtime contracts.
 *
 * Live assembly lives at @theseus.run/runtime/live. The root package stays
 * free of SQLite, tool catalog, provider, and registry construction.
 */

import { Context } from "effect";
import { RuntimeCommands, RuntimeControls, RuntimeQueries } from "./runtime/client.ts";
import { RuntimeEvents } from "./runtime/events.ts";
import type { TheseusRuntimeService } from "./runtime/types.ts";
import {
  RuntimeDispatchFailed,
  RuntimeNotFound,
  RuntimeProcessFailed,
  RuntimeProjectionDecodeFailed,
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  WorkNodeId,
} from "./runtime/types.ts";

export type {
  DispatchSession,
  DispatchSessionState,
  MissionCreateInput,
  MissionDispatchInput,
  MissionSession,
  MissionSessionState,
  MissionStartDispatchInput,
  RuntimeCommand,
  RuntimeControl,
  RuntimeDispatchEvent,
  RuntimeError,
  RuntimeQuery,
  RuntimeQueryResult,
  RuntimeSubmission,
  TheseusRuntimeService,
  WorkControlCapability,
  WorkControlCommand,
  WorkNodeControlDescriptor,
  WorkNodeKind,
  WorkNodeRelation,
  WorkNodeSession,
  WorkNodeState,
} from "./runtime/types.ts";

export {
  RuntimeCommands,
  RuntimeControls,
  RuntimeDispatchFailed,
  RuntimeEvents,
  RuntimeNotFound,
  RuntimeProcessFailed,
  RuntimeProjectionDecodeFailed,
  RuntimeQueries,
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
  WorkNodeId,
};

export class TheseusRuntime extends Context.Service<TheseusRuntime, TheseusRuntimeService>()(
  "TheseusRuntime",
) {}
