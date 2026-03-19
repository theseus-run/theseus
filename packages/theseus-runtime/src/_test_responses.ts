import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BunHttpClient, BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

const program = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const appsJson = JSON.parse(
    readFileSync(join(homedir(), ".config/github-copilot/apps.json"), "utf-8"),
  ) as Record<string, { oauth_token?: string }>;
  const oauthToken = (Object.values(appsJson)[0] as { oauth_token?: string }).oauth_token!;

  const tokenRes = yield* httpClient.execute(
    HttpClientRequest.get("https://api.github.com/copilot_internal/v2/token").pipe(
      HttpClientRequest.setHeaders({
        Authorization: `Token ${oauthToken}`,
        Accept: "application/json",
      }),
    ),
  );
  const tokenData = (yield* tokenRes.json) as { token: string };
  const bearer = tokenData.token;

  const req = HttpClientRequest.post("https://api.githubcopilot.com/responses").pipe(
    HttpClientRequest.setHeaders({
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "Editor-Version": "theseus-runtime/0.0.1",
      "Editor-Plugin-Version": "theseus-runtime/0.0.1",
      "Copilot-Integration-Id": "vscode-chat",
      Accept: "application/json",
    }),
    HttpClientRequest.bodyJsonUnsafe({
      model: "gpt-5.4",
      input: [{ role: "user", content: "say hi in one word" }],
      max_output_tokens: 20,
      stream: false,
    }),
  );

  const t0 = Date.now();
  const res = yield* httpClient.execute(req);
  const data = (yield* res.json) as { status?: string; output?: unknown[] };
  console.log(`done in ${Date.now() - t0}ms`, data);
});

BunRuntime.runMain(Effect.provide(program, BunHttpClient.layer));
