import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Effect } from "effect";
import { callTool } from "@theseus.run/core";
import { outline } from "./outline.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "theseus-outline-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("outline", () => {
  test("extracts TypeScript symbols", async () => {
    const path = join(dir, "example.ts");
    await writeFile(
      path,
      `interface Config {
  name: string;
  value: number;
}

type Alias = string | number;

enum Status { Active, Inactive }

export function hello(x: number): string {
  return String(x);
}

const arrow = (y: string) => y.length;

export class MyClass extends Base {
  private name: string;
  constructor(name: string) { this.name = name; }
  greet(): string { return this.name; }
  get value(): number { return 1; }
  static create(): MyClass { return new MyClass("x"); }
}

import { readFile } from "node:fs";
`,
    );

    const result = await Effect.runPromise(callTool(outline, { path }));
    const out = result.llmContent;

    expect(out).toContain("interface");
    expect(out).toContain("Config");
    expect(out).toContain("type");
    expect(out).toContain("Alias");
    expect(out).toContain("enum");
    expect(out).toContain("Status");
    expect(out).toContain("function");
    expect(out).toContain("hello");
    expect(out).toContain("arrow");
    expect(out).toContain("class");
    expect(out).toContain("MyClass");
    expect(out).toContain("method");
    expect(out).toContain("greet");
    expect(out).toContain("getter");
    expect(out).toContain("value");
    expect(out).toContain("property");
    expect(out).toContain("MyClass.name");
    expect(out).toContain("import");
    expect(out).toContain("node:fs");
  });

  test("handles empty file", async () => {
    const path = join(dir, "empty.ts");
    await writeFile(path, "");

    const result = await Effect.runPromise(callTool(outline, { path }));
    expect(result.llmContent).toContain("Empty file");
  });

  test("handles file with only whitespace", async () => {
    const path = join(dir, "whitespace.ts");
    await writeFile(path, "   \n\n  \n");

    const result = await Effect.runPromise(callTool(outline, { path }));
    expect(result.llmContent).toContain("Empty file");
  });

  test("errors on unsupported file type", async () => {
    const path = join(dir, "data.json");
    await writeFile(path, '{"key": "value"}');

    const err = await Effect.runPromise(
      callTool(outline, { path }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("errors on file not found", async () => {
    const err = await Effect.runPromise(
      callTool(outline, { path: join(dir, "nope.ts") }).pipe(Effect.flip),
    );
    expect(err._tag).toBe("ToolError");
  });

  test("handles TSX files", async () => {
    const path = join(dir, "component.tsx");
    await writeFile(
      path,
      `export function App(): JSX.Element {
  return <div>Hello</div>;
}

export const Button = ({ label }: { label: string }) => {
  return <button>{label}</button>;
};
`,
    );

    const result = await Effect.runPromise(callTool(outline, { path }));
    expect(result.llmContent).toContain("App");
    expect(result.llmContent).toContain("Button");
  });

  test("extracts class member signatures", async () => {
    const path = join(dir, "class.ts");
    await writeFile(
      path,
      `class Service {
  async fetch(url: string): Promise<Response> {
    return fetch(url);
  }
  static getInstance(): Service {
    return new Service();
  }
}
`,
    );

    const result = await Effect.runPromise(callTool(outline, { path }));
    expect(result.llmContent).toContain("Service.fetch");
    expect(result.llmContent).toContain("Service.getInstance");
    expect(result.llmContent).toContain("static");
    expect(result.llmContent).toContain("async");
  });

  test("handles JavaScript files", async () => {
    const path = join(dir, "script.js");
    await writeFile(
      path,
      `function add(a, b) { return a + b; }
class Calculator {
  multiply(a, b) { return a * b; }
}
`,
    );

    const result = await Effect.runPromise(callTool(outline, { path }));
    expect(result.llmContent).toContain("add");
    expect(result.llmContent).toContain("Calculator");
    expect(result.llmContent).toContain("multiply");
  });
});
