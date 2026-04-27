import { Effect } from "effect";
import type * as Prompt from "effect/unstable/ai/Prompt";
import type * as AiTool from "effect/unstable/ai/Tool";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { OpenAIConfig } from "./config.ts";
import {
  OpenAIAuthError,
  type OpenAIEncodeError,
  OpenAIHttpError,
  OpenAIParseError,
} from "./errors.ts";
import { aiToolsToResponsesTools, promptToResponsesInput } from "./prompt.ts";

export const buildResponsesRequest = (
  config: (typeof OpenAIConfig)["Service"],
  prompt: Prompt.Prompt,
  tools: ReadonlyArray<AiTool.Any>,
  streaming: boolean,
): Effect.Effect<HttpClientRequest.HttpClientRequest, OpenAIAuthError | OpenAIEncodeError> =>
  Effect.gen(function* () {
    if (!config.apiKey) {
      return yield* new OpenAIAuthError({ cause: "OPENAI_API_KEY is not set" });
    }

    const body: Record<string, unknown> = {
      model: config.model,
      input: yield* promptToResponsesInput(prompt),
      max_output_tokens: config.maxOutputTokens,
      stream: streaming,
      ...(tools.length > 0 ? { tools: aiToolsToResponsesTools(tools) } : {}),
      ...(config.reasoningEffort !== undefined
        ? { reasoning: { effort: config.reasoningEffort } }
        : {}),
      ...(config.textVerbosity !== undefined ? { text: { verbosity: config.textVerbosity } } : {}),
    };

    return HttpClientRequest.post(`${config.apiUrl}/v1/responses`).pipe(
      HttpClientRequest.setHeaders({
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: streaming ? "text/event-stream" : "application/json",
      }),
      HttpClientRequest.bodyJsonUnsafe(body),
    );
  });

export const executeResponsesRequest = (
  http: (typeof HttpClient.HttpClient)["Service"],
  req: HttpClientRequest.HttpClientRequest,
): Effect.Effect<HttpClientResponse.HttpClientResponse, OpenAIHttpError | OpenAIParseError> =>
  Effect.gen(function* () {
    const res = yield* http
      .execute(req)
      .pipe(Effect.mapError((cause) => new OpenAIHttpError({ status: 0, body: String(cause) })));

    if (res.status < 200 || res.status >= 300) {
      const text = yield* res.text.pipe(
        Effect.mapError((cause) => new OpenAIParseError({ cause })),
      );
      return yield* new OpenAIHttpError({ status: res.status, body: text });
    }

    return res;
  });
