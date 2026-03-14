type RenderFn = (node: unknown) => string;

let _render: RenderFn | null = null;

export function registerRender(fn: RenderFn): void {
  _render = fn;
}

export function callRender(node: unknown): string {
  if (!_render) {
    throw new Error(
      "jsx-md: render not initialized. Ensure 'render' is imported from '@theseus.run/jsx-md' before Fragment is called.",
    );
  }
  return _render(node);
}
