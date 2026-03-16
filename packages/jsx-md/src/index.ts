// Runtime exports
export { jsx, jsxs, Fragment } from './jsx-runtime.ts';
export type { JSX, VNode, VNodeElement } from './jsx-runtime.ts';

// Render
export { render } from './render.ts';

// Context API
export { createContext, useContext, withContext } from './context.ts';
export type { Context } from './context.ts';

// Escape utilities
export { escapeMarkdown } from './escape.ts';

// Primitive components
export {
  H1, H2, H3, H4, H5, H6,
  P,
  Hr,
  Codeblock,
  Blockquote,
  Li, Ul, Ol,
  Bold, Code, Italic, Strikethrough, Link, Img,
  Br, Sup, Sub, Kbd, Escape,
  Md,
  Table, Tr, Th, Td,
  TaskList, Task,
  Callout,
  HtmlComment,
  Details,
} from './primitives.tsx';

export type { CalloutType, ColAlign } from './primitives.tsx';
