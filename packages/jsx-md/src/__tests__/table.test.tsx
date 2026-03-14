/* @jsxImportSource @theseus.run/jsx-md */

import { expect, test, describe } from 'bun:test';
import { render } from '../index.ts';
import { Table, Tr, Th, Td, Bold, Code, Link, Img } from '../index.ts';

describe('Table', () => {
  test('basic two-column table', () => {
    expect(render(
      <Table>
        <Tr><Th>Agent</Th><Th>Role</Th></Tr>
        <Tr><Td>Theseus</Td><Td>Orchestrator</Td></Tr>
        <Tr><Td>Forge</Td><Td>Implementer</Td></Tr>
      </Table>
    )).toBe(
      '| Agent | Role |\n' +
      '| --- | --- |\n' +
      '| Theseus | Orchestrator |\n' +
      '| Forge | Implementer |\n\n'
    );
  });

  test('inline formatting in cells', () => {
    expect(render(
      <Table>
        <Tr><Th>Name</Th><Th>Type</Th></Tr>
        <Tr><Td><Bold>Theseus</Bold></Td><Td><Code>Orchestrator</Code></Td></Tr>
      </Table>
    )).toBe(
      '| Name | Type |\n' +
      '| --- | --- |\n' +
      '| **Theseus** | `Orchestrator` |\n\n'
    );
  });

  test('single-column table', () => {
    expect(render(
      <Table>
        <Tr><Th>Item</Th></Tr>
        <Tr><Td>one</Td></Tr>
        <Tr><Td>two</Td></Tr>
      </Table>
    )).toBe(
      '| Item |\n' +
      '| --- |\n' +
      '| one |\n' +
      '| two |\n\n'
    );
  });

  test('header-only table still gets separator row', () => {
    expect(render(
      <Table>
        <Tr><Th>Col A</Th><Th>Col B</Th></Tr>
      </Table>
    )).toBe(
      '| Col A | Col B |\n' +
      '| --- | --- |\n\n'
    );
  });

  test('pipe in cell content is not escaped — known limitation', () => {
    // Callers are responsible for escaping pipes in cell content manually.
    const result = render(
      <Table>
        <Tr><Th>A</Th><Th>B</Th></Tr>
        <Tr><Td>{'has | pipe'}</Td><Td>normal</Td></Tr>
      </Table>
    );
    expect(result).toBe(
      '| A | B |\n' +
      '| --- | --- |\n' +
      '| has | pipe | normal |\n\n'
    );
  });

  test('empty Table renders empty string', () => {
    expect(render(<Table></Table>)).toBe('');
  });

  test('empty Td renders as cell with empty content', () => {
    expect(render(
      <Table>
        <Tr><Th>Col</Th></Tr>
        <Tr><Td></Td></Tr>
      </Table>
    )).toBe(
      '| Col |\n' +
      '| --- |\n' +
      '|  |\n\n'
    );
  });

  test('three-column table', () => {
    expect(render(
      <Table>
        <Tr><Th>Name</Th><Th>Type</Th><Th>Required</Th></Tr>
        <Tr><Td>id</Td><Td><Code>string</Code></Td><Td>yes</Td></Tr>
        <Tr><Td>name</Td><Td><Code>string</Code></Td><Td>no</Td></Tr>
      </Table>
    )).toBe(
      '| Name | Type | Required |\n' +
      '| --- | --- | --- |\n' +
      '| id | `string` | yes |\n' +
      '| name | `string` | no |\n\n'
    );
  });

  test('Link inside Td', () => {
    expect(render(
      <Table>
        <Tr><Th>Resource</Th><Th>URL</Th></Tr>
        <Tr><Td>Docs</Td><Td><Link href="https://example.com">docs</Link></Td></Tr>
      </Table>
    )).toBe(
      '| Resource | URL |\n' +
      '| --- | --- |\n' +
      '| Docs | [docs](https://example.com) |\n\n'
    );
  });

  test('Img inside Td', () => {
    expect(render(
      <Table>
        <Tr><Th>Name</Th><Th>Logo</Th></Tr>
        <Tr><Td>Bun</Td><Td><Img src="bun.png" alt="Bun" /></Td></Tr>
      </Table>
    )).toBe(
      '| Name | Logo |\n' +
      '| --- | --- |\n' +
      '| Bun | ![Bun](bun.png) |\n\n'
    );
  });
});
