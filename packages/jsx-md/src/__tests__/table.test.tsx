/* @jsxImportSource @theseus.run/jsx-md */

import { describe, expect, test } from "bun:test";
import { Bold, Code, Img, Link, render, Table, Td, Th, Tr } from "../index.ts";

describe("Table", () => {
  test("basic two-column table", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Agent</Th>
            <Th>Role</Th>
          </Tr>
          <Tr>
            <Td>Theseus</Td>
            <Td>Orchestrator</Td>
          </Tr>
          <Tr>
            <Td>Forge</Td>
            <Td>Implementer</Td>
          </Tr>
        </Table>,
      ),
    ).toBe(
      "| Agent | Role |\n" +
        "| --- | --- |\n" +
        "| Theseus | Orchestrator |\n" +
        "| Forge | Implementer |\n\n",
    );
  });

  test("inline formatting in cells", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Name</Th>
            <Th>Type</Th>
          </Tr>
          <Tr>
            <Td>
              <Bold>Theseus</Bold>
            </Td>
            <Td>
              <Code>Orchestrator</Code>
            </Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Name | Type |\n" + "| --- | --- |\n" + "| **Theseus** | `Orchestrator` |\n\n");
  });

  test("single-column table", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Item</Th>
          </Tr>
          <Tr>
            <Td>one</Td>
          </Tr>
          <Tr>
            <Td>two</Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Item |\n" + "| --- |\n" + "| one |\n" + "| two |\n\n");
  });

  test("header-only table still gets separator row", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Col A</Th>
            <Th>Col B</Th>
          </Tr>
        </Table>,
      ),
    ).toBe("| Col A | Col B |\n" + "| --- | --- |\n\n");
  });

  test("pipe in cell content — separator still has correct column count", () => {
    // The separator row is now derived from Th count (via context), not pipe parsing.
    // Pipes in cell content do not affect the separator row column count.
    const result = render(
      <Table>
        <Tr>
          <Th>A</Th>
          <Th>B</Th>
        </Tr>
        <Tr>
          <Td>{"has | pipe"}</Td>
          <Td>normal</Td>
        </Tr>
      </Table>,
    );
    expect(result).toBe("| A | B |\n" + "| --- | --- |\n" + "| has | pipe | normal |\n\n");
  });

  test("empty Th — separator has correct column count even with empty header cells", () => {
    const result = render(
      <Table>
        <Tr>
          <Th></Th>
          <Th>B</Th>
          <Th></Th>
        </Tr>
        <Tr>
          <Td>a</Td>
          <Td>b</Td>
          <Td>c</Td>
        </Tr>
      </Table>,
    );
    expect(result).toBe("|  | B |  |\n" + "| --- | --- | --- |\n" + "| a | b | c |\n\n");
  });

  test("empty Table renders empty string", () => {
    expect(render(<Table></Table>)).toBe("");
  });

  test("empty Td renders as cell with empty content", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Col</Th>
          </Tr>
          <Tr>
            <Td></Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Col |\n" + "| --- |\n" + "|  |\n\n");
  });

  test("three-column table", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Required</Th>
          </Tr>
          <Tr>
            <Td>id</Td>
            <Td>
              <Code>string</Code>
            </Td>
            <Td>yes</Td>
          </Tr>
          <Tr>
            <Td>name</Td>
            <Td>
              <Code>string</Code>
            </Td>
            <Td>no</Td>
          </Tr>
        </Table>,
      ),
    ).toBe(
      "| Name | Type | Required |\n" +
        "| --- | --- | --- |\n" +
        "| id | `string` | yes |\n" +
        "| name | `string` | no |\n\n",
    );
  });

  test("Link inside Td", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Resource</Th>
            <Th>URL</Th>
          </Tr>
          <Tr>
            <Td>Docs</Td>
            <Td>
              <Link href="https://example.com">docs</Link>
            </Td>
          </Tr>
        </Table>,
      ),
    ).toBe(
      "| Resource | URL |\n" + "| --- | --- |\n" + "| Docs | [docs](https://example.com) |\n\n",
    );
  });

  test("Img inside Td", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Name</Th>
            <Th>Logo</Th>
          </Tr>
          <Tr>
            <Td>Bun</Td>
            <Td>
              <Img src="bun.png" alt="Bun" />
            </Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Name | Logo |\n" + "| --- | --- |\n" + "| Bun | ![Bun](bun.png) |\n\n");
  });
});

// ---------------------------------------------------------------------------
// Table — column alignment
// ---------------------------------------------------------------------------

describe("Table column alignment", () => {
  test("left-aligned column → :---", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th align="left">Name</Th>
          </Tr>
          <Tr>
            <Td>Alice</Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Name |\n" + "| :--- |\n" + "| Alice |\n\n");
  });

  test("center-aligned column → :---:", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th align="center">Score</Th>
          </Tr>
          <Tr>
            <Td>42</Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Score |\n" + "| :---: |\n" + "| 42 |\n\n");
  });

  test("right-aligned column → ---:", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th align="right">Amount</Th>
          </Tr>
          <Tr>
            <Td>100</Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Amount |\n" + "| ---: |\n" + "| 100 |\n\n");
  });

  test("unaligned column (no align prop) → ---", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th>Default</Th>
          </Tr>
          <Tr>
            <Td>value</Td>
          </Tr>
        </Table>,
      ),
    ).toBe("| Default |\n" + "| --- |\n" + "| value |\n\n");
  });

  test("mixed alignment — left, center, right, default", () => {
    expect(
      render(
        <Table>
          <Tr>
            <Th align="left">Name</Th>
            <Th align="center">Status</Th>
            <Th align="right">Score</Th>
            <Th>Notes</Th>
          </Tr>
          <Tr>
            <Td>Alice</Td>
            <Td>active</Td>
            <Td>99</Td>
            <Td>top</Td>
          </Tr>
        </Table>,
      ),
    ).toBe(
      "| Name | Status | Score | Notes |\n" +
        "| :--- | :---: | ---: | --- |\n" +
        "| Alice | active | 99 | top |\n\n",
    );
  });
});
