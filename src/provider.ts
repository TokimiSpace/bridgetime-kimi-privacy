import {
  assertEgressEnvelopeSafe,
  assertSerializedEgressSafe,
  type EgressEnvelopeV1,
  type EgressGuard,
} from "./envelope.ts";
import { SafeProviderError } from "./errors.ts";
import {
  type PrivateIntentEnvelopeV1,
  serializePrivateIntentEnvelopeV1,
} from "./private_intent.ts";
import { canonicalizeReadOnlyToolCall, type ReadOnlyToolCall } from "./tools.ts";

export const KIMI_ALLOWED_HOSTS = ["api.moonshot.ai"] as const;
export const KIMI_API_BASE_URL = "https://api.moonshot.ai/v1";
export const KIMI_PRIVATE_INTENT_MODEL = "kimi-k2.6";

const PRIVATE_INTENT_SYSTEM_MESSAGE =
  "You route a privacy-preserving management UI. The user message, merchant identity, names, services, IDs, counts, dates, times and all business values are intentionally unavailable. Use only the abstract enum envelope. Never ask for or infer hidden values. Call choose_dialogue_strategy once.";

const PRIVATE_INTENT_TOOL = {
  type: "function",
  function: {
    name: "choose_dialogue_strategy",
    description:
      "Choose the generic UI strategy for an already-redacted merchant-management intent. No merchant data is available or needed.",
    parameters: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: [
            "show_list",
            "show_form",
            "show_relationship_editor",
            "show_schedule_form",
            "show_help",
          ],
        },
      },
      required: ["strategy"],
      additionalProperties: false,
    },
  },
} as const;

export interface ProviderHttpRequest {
  url: string;
  apiKey: string;
  body: string;
}

export interface ProviderHttpResponse {
  status: number;
  body: string;
}

export interface ProviderTransport {
  send(request: ProviderHttpRequest): Promise<ProviderHttpResponse>;
}

export interface AssistantReply {
  role: "assistant";
  content: string;
  toolCalls: ReadOnlyToolCall[];
}

export function resolveChatCompletionsUrl(
  baseUrl: string,
  allowedHosts: readonly string[],
): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new SafeProviderError("invalid_endpoint");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    (url.port && url.port !== "443")
  ) {
    throw new SafeProviderError("invalid_endpoint");
  }
  const normalizedAllowlist = new Set(allowedHosts.map((host) => host.toLowerCase()));
  if (normalizedAllowlist.size === 0 || !normalizedAllowlist.has(url.hostname.toLowerCase())) {
    throw new SafeProviderError("host_not_allowed");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`;
  return url.toString();
}

function toWireBody(envelope: EgressEnvelopeV1): string {
  return JSON.stringify({
    model: envelope.model,
    messages: envelope.messages.map((message) => {
      if (message.role === "assistant" && message.toolCalls) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          content: message.content,
          tool_call_id: message.toolCallId,
        };
      }
      return { role: message.role, content: message.content };
    }),
    tools: envelope.tools,
  });
}

export async function sendEgressEnvelope(input: {
  envelope: EgressEnvelopeV1;
  guard: EgressGuard;
  baseUrl: string;
  allowedHosts: readonly string[];
  apiKey: string;
  transport?: ProviderTransport;
}): Promise<AssistantReply> {
  if (!input.apiKey.trim()) throw new SafeProviderError("missing_api_key");
  assertEgressEnvelopeSafe(input.envelope, input.guard);
  const url = resolveChatCompletionsUrl(input.baseUrl, input.allowedHosts);
  const body = toWireBody(input.envelope);
  assertSerializedEgressSafe(body, input.guard);

  let response: ProviderHttpResponse;
  try {
    response = await (input.transport ?? new FetchTransport()).send({
      url,
      apiKey: input.apiKey,
      body,
    });
  } catch (error) {
    if (error instanceof SafeProviderError) throw error;
    throw new SafeProviderError("network");
  }

  if (response.status === 401 || response.status === 403) {
    throw new SafeProviderError("auth", response.status);
  }
  if (response.status === 429) throw new SafeProviderError("rate_limit", 429);
  if (response.status < 200 || response.status >= 300) {
    throw new SafeProviderError("provider", response.status);
  }

  try {
    const value: unknown = JSON.parse(response.body);
    if (!isRecord(value) || !Array.isArray(value.choices)) throw new Error();
    const choice = value.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) throw new Error();
    const content = choice.message.content;
    const rawCalls = choice.message.tool_calls;
    if (rawCalls !== undefined && (!Array.isArray(rawCalls) || rawCalls.length !== 1)) {
      throw new Error();
    }
    const toolCalls = rawCalls === undefined ? [] : rawCalls.map((rawCall) => {
      if (!isRecord(rawCall) || rawCall.type !== "function" || !isRecord(rawCall.function)) {
        throw new Error();
      }
      return canonicalizeReadOnlyToolCall({
        id: rawCall.id,
        name: rawCall.function.name,
        arguments: rawCall.function.arguments,
      }, input.envelope.tools);
    });
    if (typeof content !== "string" && !(content === null && toolCalls.length === 1)) {
      throw new Error();
    }
    if (
      (content ?? "").length > 20_000 || ((content ?? "").length === 0 && toolCalls.length === 0)
    ) {
      throw new Error();
    }
    return { role: "assistant", content: content ?? "", toolCalls };
  } catch {
    // Never expose `response.body`; it may echo user content or provider internals.
    throw new SafeProviderError("invalid_response", response.status);
  }
}

/**
 * Send only a fixed, value-free intent envelope to Kimi. The official endpoint,
 * model, system prompt, tool schema and token budget are pinned here. The
 * provider response is deliberately ignored and must never drive authorization
 * or a database write.
 */
export async function sendPrivateIntentEnvelope(input: {
  envelope: PrivateIntentEnvelopeV1;
  apiKey: string;
  transport?: ProviderTransport;
}): Promise<{ providerConsulted: true }> {
  if (!input.apiKey) throw new SafeProviderError("missing_api_key");
  const url = resolveChatCompletionsUrl(KIMI_API_BASE_URL, KIMI_ALLOWED_HOSTS);
  const body = JSON.stringify({
    model: KIMI_PRIVATE_INTENT_MODEL,
    messages: [
      { role: "system", content: PRIVATE_INTENT_SYSTEM_MESSAGE },
      { role: "user", content: serializePrivateIntentEnvelopeV1(input.envelope) },
    ],
    tools: [PRIVATE_INTENT_TOOL],
    max_tokens: 128,
    thinking: { type: "disabled" },
  });

  const response = await sendProviderRequest(
    input.transport ?? new FetchTransport(fetch, 5_000),
    { url, apiKey: input.apiKey, body },
  );
  assertSuccessfulProviderStatus(response);
  return { providerConsulted: true };
}

async function sendProviderRequest(
  transport: ProviderTransport,
  request: ProviderHttpRequest,
): Promise<ProviderHttpResponse> {
  try {
    return await transport.send(request);
  } catch (error) {
    if (error instanceof SafeProviderError) throw error;
    throw new SafeProviderError("network");
  }
}

function assertSuccessfulProviderStatus(response: ProviderHttpResponse): void {
  if (response.status === 401 || response.status === 403) {
    throw new SafeProviderError("auth", response.status);
  }
  if (response.status === 429) throw new SafeProviderError("rate_limit", 429);
  if (response.status < 200 || response.status >= 300) {
    throw new SafeProviderError("provider", response.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class FetchTransport implements ProviderTransport {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {}

  async send(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    let response: Response;
    try {
      response = await this.fetchFn(request.url, {
        method: "POST",
        // Never forward the authorization header or body to a redirect target.
        redirect: "error",
        headers: {
          "Authorization": `Bearer ${request.apiKey}`,
          "Content-Type": "application/json",
        },
        body: request.body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SafeProviderError("network");
    }
    return { status: response.status, body: await response.text() };
  }
}

export interface CapturedProviderRequest {
  url: string;
  method: "POST";
  contentType: "application/json";
  body: string;
}

/**
 * Offline transport. It intentionally does not retain the API key or any
 * header value, so captured artifacts can be inspected safely.
 */
export class CaptureTransport implements ProviderTransport {
  readonly requests: CapturedProviderRequest[] = [];

  constructor(
    private readonly response: ProviderHttpResponse = {
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: "synthetic-ok" } }] }),
    },
  ) {}

  send(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    this.requests.push({
      url: request.url,
      method: "POST",
      contentType: "application/json",
      body: request.body,
    });
    return Promise.resolve(structuredClone(this.response));
  }
}
