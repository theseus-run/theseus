/**
 * Shared tool definitions for integration scripts.
 */

import { readdirSync, readFileSync } from "node:fs";
import { Effect } from "effect";
import { defineTool, manualSchema } from "@theseus.run/core";

export const listDir = defineTool<{ path: string }, string>({
  name: "listDir",
  description: "List files and directories at the given path.",
  inputSchema: manualSchema(
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    (raw) => {
      const r = raw as { path?: unknown };
      if (typeof r.path !== "string") throw new Error("path must be a string");
      return r as { path: string };
    },
  ),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.try({
      try: () => readdirSync(path).join("\n"),
      catch: (e) => fail(`Cannot list ${path}: ${e}`),
    }),
  encode: (s) => s,
});

export const readFile = defineTool<{ path: string }, string>({
  name: "readFile",
  description: "Read the contents of a file at the given path.",
  inputSchema: manualSchema(
    { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    (raw) => {
      const r = raw as { path?: unknown };
      if (typeof r.path !== "string") throw new Error("path must be a string");
      return r as { path: string };
    },
  ),
  safety: "readonly",
  capabilities: ["fs.read"],
  execute: ({ path }, { fail }) =>
    Effect.try({
      try: () => readFileSync(path, "utf-8"),
      catch: (e) => fail(`Cannot read ${path}: ${e}`),
    }),
  encode: (s) => s,
});
