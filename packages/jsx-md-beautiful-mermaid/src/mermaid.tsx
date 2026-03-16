import { Codeblock } from '@theseus.run/jsx-md';
import { renderMermaidASCII } from 'beautiful-mermaid';
import type { AsciiRenderOptions } from 'beautiful-mermaid';

export interface BeautifulMermaidProps extends Omit<AsciiRenderOptions, 'colorMode'> {
  /** Mermaid diagram source. Alternatively pass the diagram string as children. */
  diagram?: string;
  children?: string;
  /**
   * Wrap the ASCII output in a fenced code block.
   *
   * Enabled by default — produces a monospace block in GitHub, LLM chat
   * UIs, and any CommonMark renderer. Set to `false` to get the raw
   * ASCII string for further composition.
   *
   * @default true
   */
  block?: boolean;
}

/**
 * Renders a Mermaid diagram as ASCII / Unicode art.
 *
 * Accepts the diagram source either via the `diagram` prop or as `children`.
 * Rendering is fully synchronous — no `await`, no flash.
 *
 * ```tsx
 * import { render } from "@theseus.run/jsx-md";
 * import { BeautifulMermaid } from "@theseus.run/jsx-md-beautiful-mermaid";
 *
 * render(
 *   <BeautifulMermaid diagram={`graph LR\n  A --> B --> C`} />
 * );
 * // ```
 * // ┌───┐     ┌───┐     ┌───┐
 * // │ A │────►│ B │────►│ C │
 * // └───┘     └───┘     └───┘
 * // ```
 * ```
 */
export function BeautifulMermaid({
  diagram,
  children,
  block = true,
  ...asciiOptions
}: BeautifulMermaidProps): string {
  const source = diagram ?? children ?? '';
  const ascii = renderMermaidASCII(source, asciiOptions);

  if (!block) return ascii;

  return Codeblock({ children: ascii });
}
