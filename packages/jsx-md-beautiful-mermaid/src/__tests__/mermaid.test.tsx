/* @jsxImportSource @theseus.run/jsx-md */

import { describe, expect, test } from "bun:test";
import { H2, P, render } from "@theseus.run/jsx-md";
import { BeautifulMermaid } from "../mermaid.tsx";

const simple = `graph LR
  A --> B --> C`;

const detailed = `graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Done]
  B -->|No| D[Retry]
  D --> A`;

describe("<BeautifulMermaid />", () => {
  describe("output shape", () => {
    test("wraps in fenced code block by default", () => {
      const result = render(<BeautifulMermaid diagram={simple} />);
      expect(result).toMatch(/^```\n/);
      expect(result).toMatch(/\n```\n\n$/);
    });

    test("block=false returns raw ASCII without fencing", () => {
      const result = render(<BeautifulMermaid diagram={simple} block={false} />);
      expect(result).not.toContain("```");
    });
  });

  describe("input forms", () => {
    test("diagram prop", () => {
      const result = render(<BeautifulMermaid diagram={simple} block={false} />);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result).toContain("C");
    });

    test("children string", () => {
      const result = render(<BeautifulMermaid block={false}>{simple}</BeautifulMermaid>);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result).toContain("C");
    });

    test("diagram prop takes precedence over children", () => {
      const result = render(
        <BeautifulMermaid diagram={simple} block={false}>
          {"graph LR\n  X --> Y"}
        </BeautifulMermaid>,
      );
      expect(result).toContain("A");
    });
  });

  describe("ASCII mode", () => {
    test("default uses Unicode box-drawing characters", () => {
      const result = render(<BeautifulMermaid diagram={simple} block={false} />);
      expect(result).toMatch(/[┌─│└┘►┐]/);
    });

    test("useAscii=true uses plain ASCII characters", () => {
      const result = render(<BeautifulMermaid diagram={simple} useAscii={true} block={false} />);
      expect(result).not.toMatch(/[┌─│└┘►┐]/);
      expect(result).toMatch(/[+\-|>]/);
    });
  });

  describe("multi-node diagrams", () => {
    test("renders a flowchart with branching", () => {
      const result = render(<BeautifulMermaid diagram={detailed} block={false} />);
      expect(result).toContain("Start");
      expect(result).toContain("Decision");
      expect(result).toContain("Done");
      expect(result).toContain("Retry");
    });
  });

  describe("integration with jsx-md", () => {
    test("composes inside a jsx-md fragment", () => {
      const result = render(
        <>
          <H2>Architecture</H2>
          <P>The flow:</P>
          <BeautifulMermaid diagram={simple} />
        </>,
      );
      expect(result).toContain("## Architecture");
      expect(result).toContain("The flow:");
      expect(result).toContain("```");
    });
  });
});
