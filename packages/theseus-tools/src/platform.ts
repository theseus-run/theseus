import { BunFileSystem } from "@effect/platform-bun";
import { Context, Effect, FileSystem, Layer } from "effect";
import { ToolFailure } from "./failure.ts";

export class ToolPlatform extends Context.Service<
  ToolPlatform,
  {
    readonly exists: (path: string) => Effect.Effect<boolean, ToolFailure>;
    readonly readFileString: (path: string) => Effect.Effect<string, ToolFailure>;
  }
>()("ToolPlatform") {}

export const ToolPlatformLive = Layer.effect(ToolPlatform)(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return ToolPlatform.of({
      exists: (path) =>
        fs
          .exists(path)
          .pipe(
            Effect.mapError(
              (cause) => new ToolFailure({ message: `Cannot access ${path}: ${cause}` }),
            ),
          ),
      readFileString: (path) =>
        fs
          .readFileString(path)
          .pipe(
            Effect.mapError(
              (cause) => new ToolFailure({ message: `Cannot read ${path}: ${cause}` }),
            ),
          ),
    });
  }),
);

export const ToolPlatformBunLive = ToolPlatformLive.pipe(Layer.provide(BunFileSystem.layer));
