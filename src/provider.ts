import {
  assertEgressEnvelopeSafe,
  assertSerializedEgressSafe,
  type EgressEnvelopeV1,
  type EgressGuard,
} from "./envelope.ts";
import { SafeProviderError } from "./errors.ts";

export const KIMI_ALLOWED_HOSTS = ["api.moonshot.ai"] as const;

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
    messages: envelope.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    })),
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
  if (!input.apiKey) throw new SafeProviderError("missing_api_key");
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
    if (typeof content !== "string") throw new Error();
    return { role: "assistant", content };
  } catch {
    // Never expose `response.body`; it may echo user content or provider internals.
    throw new SafeProviderError("invalid_response", response.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class FetchTransport implements ProviderTransport {
  async send(request: ProviderHttpRequest): Promise<ProviderHttpResponse> {
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${request.apiKey}`,
          "Content-Type": "application/json",
        },
        body: request.body,
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
