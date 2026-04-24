# @theseus.run/tools

Bun-native tool implementations for Theseus agents.

```ts
import { allTools, readonlyTools, readFile } from "@theseus.run/tools";
import { TOOL_META } from "@theseus.run/tools/metadata";
```

The runtime exports are Theseus `Tool` values from `@theseus.run/core/Tool`.
The `metadata` export is browser-safe and contains static descriptions,
interaction policy, and JSON Schema parameter hints.

This package targets Bun and exports TypeScript source.
