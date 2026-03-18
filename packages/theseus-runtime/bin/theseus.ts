#!/usr/bin/env bun
/**
 * theseus — headless agentic runtime CLI
 *
 * Usage: bun run bin/theseus.ts
 */
import { BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"
import { main, AppLayer } from "../src/runtime.ts"

BunRuntime.runMain(Effect.provide(main, AppLayer))
