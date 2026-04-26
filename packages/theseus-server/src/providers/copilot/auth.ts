import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { encodeJson } from "@theseus.run/runtime/json";
import { Effect } from "effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type { RuntimeConfig } from "../../config.ts";
import { CopilotAuthError, CopilotParseError } from "./errors.ts";
import type { TokenCache } from "./wire.ts";

type RuntimeConfigService = (typeof RuntimeConfig)["Service"];
type HttpClientService = (typeof HttpClient.HttpClient)["Service"];

export const readOauthToken: Effect.Effect<string, CopilotAuthError> = Effect.gen(function* () {
  const path = join(homedir(), ".config", "github-copilot", "apps.json");

  const raw = yield* Effect.try({
    try: () => readFileSync(path, "utf-8"),
    catch: (cause) => new CopilotAuthError({ cause: `Cannot read ${path}: ${cause}` }),
  });

  const parsed = yield* Effect.try({
    try: () => JSON.parse(raw) as Record<string, { oauth_token?: string }>,
    catch: (cause) => new CopilotAuthError({ cause: `Cannot parse ${path}: ${cause}` }),
  });

  const entry = parsed["github.com"] ?? Object.values(parsed)[0];
  if (!entry?.oauth_token) {
    return yield* new CopilotAuthError({
      cause: `oauth_token not found in ${path} (keys: ${Object.keys(parsed).join(", ")})`,
    });
  }

  return entry.oauth_token;
});

export const exchangeToken = (
  http: HttpClientService,
  config: Pick<RuntimeConfigService, "copilotAuthUrl">,
  oauthToken: string,
): Effect.Effect<TokenCache, CopilotAuthError | CopilotParseError> =>
  Effect.gen(function* () {
    const req = HttpClientRequest.get(config.copilotAuthUrl).pipe(
      HttpClientRequest.setHeaders({
        Authorization: `Token ${oauthToken}`,
        "User-Agent": "theseus-server/0.0.1",
        Accept: "application/json",
      }),
    );
    const res = yield* http
      .execute(req)
      .pipe(Effect.mapError((cause) => new CopilotAuthError({ cause })));
    const body = yield* res.json.pipe(
      Effect.mapError((cause) => new CopilotParseError({ cause })),
    ) as Effect.Effect<{ token?: string; expires_at?: number }, CopilotParseError>;
    if (!body?.token) {
      return yield* new CopilotAuthError({
        cause: new Error(`Unexpected token response: ${encodeJson(body)}`),
      });
    }
    return { bearer: body.token, expiresAt: body.expires_at ?? 0 };
  });
