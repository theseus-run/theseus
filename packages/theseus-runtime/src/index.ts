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
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
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
  RuntimeSnapshot,
  RuntimeSubmission,
  StatusEntry,
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
  RuntimeQueries,
  RuntimeToolNotFound,
  RuntimeWorkControlFailed,
  RuntimeWorkControlUnsupported,
};

export class TheseusRuntime extends Context.Service<TheseusRuntime, TheseusRuntimeService>()(
  "TheseusRuntime",
) {}
