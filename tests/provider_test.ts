import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  appendAliasedToolRoundTrip,
  buildAliasTable,
  buildReadOnlyToolSchemas,
  CaptureTransport,
  FetchTransport,
  KIMI_ALLOWED_HOSTS,
  prepareEgressEnvelopeV1,
  resolveChatCompletionsUrl,
  safeErrorMetadata,
  SafeProviderError,
  sendEgressEnvelope,
} from "../src/mod.ts";

const identity = (length: number) => Array.from({ length }, (_, index) => index);

function preparedFixture() {
  const raw = {
    name: "林範例",
    phone: "0912-000-123",
    email: "demo.person@example.test",
  };
  const aliasTable = buildAliasTable(
    [{ id: "staff-synthetic-1", displayName: raw.name }],
    [],
    identity,
  );
  const prepared = prepareEgressEnvelopeV1({
    model: "kimi-k2.6",
    systemPrompt: "Use opaque tokens.",
    rawUserText: `${raw.name} ${raw.phone} ${raw.email}`,
    aliasTable,
    tools: buildReadOnlyToolSchemas({ staffTokens: ["S1"] }),
  });
  return { raw, prepared };
}

Deno.test("provider endpoint requires HTTPS and an exact allowlisted host", () => {
  assertEquals(
    resolveChatCompletionsUrl("https://api.moonshot.ai/v1", KIMI_ALLOWED_HOSTS),
    "https://api.moonshot.ai/v1/chat/completions",
  );
  assertThrows(
    () => resolveChatCompletionsUrl("http://api.moonshot.ai/v1", KIMI_ALLOWED_HOSTS),
    SafeProviderError,
  );
  assertThrows(
    () => resolveChatCompletionsUrl("https://api.moonshot.ai.evil.test/v1", KIMI_ALLOWED_HOSTS),
    SafeProviderError,
  );
  assertThrows(
    () => resolveChatCompletionsUrl("https://api.moonshot.ai:8443/v1", KIMI_ALLOWED_HOSTS),
    SafeProviderError,
  );
});

Deno.test("fetch transport fails closed on redirects", async () => {
  let redirectMode: RequestRedirect | undefined;
  const fetchFn = ((_input: string | URL | Request, init?: RequestInit) => {
    redirectMode = init?.redirect;
    return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
  }) as typeof fetch;
  const transport = new FetchTransport(fetchFn);
  await transport.send({
    url: "https://api.moonshot.ai/v1/chat/completions",
    apiKey: "synthetic-key",
    body: "{}",
  });
  assertEquals(redirectMode, "error");
});

Deno.test("capture transport records a clean outbound body and never retains API key", async () => {
  const { raw, prepared } = preparedFixture();
  const transport = new CaptureTransport();
  const reply = await sendEgressEnvelope({
    envelope: prepared.envelope,
    guard: { aliasTable: prepared.aliasTable },
    baseUrl: "https://api.moonshot.ai/v1",
    allowedHosts: KIMI_ALLOWED_HOSTS,
    apiKey: "synthetic-key-never-captured",
    transport,
  });
  assertEquals(reply.content, "synthetic-ok");
  assertEquals(reply.toolCalls, []);
  assertEquals(transport.requests.length, 1);
  const captured = JSON.stringify(transport.requests[0]);
  for (const value of Object.values(raw)) assertFalse(captured.includes(value));
  assertFalse(captured.includes("synthetic-key-never-captured"));
  assertStringIncludes(captured, "S1");
  assertStringIncludes(captured, "P1");
  assertStringIncludes(captured, "E1");
});

Deno.test("provider tool call and local aliased result form a valid captured wire pair", async () => {
  const { prepared } = preparedFixture();
  const firstTransport = new CaptureTransport({
    status: 200,
    body: JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: "call_shift_1",
            type: "function",
            function: {
              name: "staff_on_shift",
              arguments: '{"staff":"S1","period":"tomorrow"}',
            },
          }],
        },
      }],
    }),
  });
  const firstReply = await sendEgressEnvelope({
    envelope: prepared.envelope,
    guard: { aliasTable: prepared.aliasTable },
    baseUrl: "https://api.moonshot.ai/v1",
    allowedHosts: KIMI_ALLOWED_HOSTS,
    apiKey: "synthetic-key",
    transport: firstTransport,
  });
  assertEquals(firstReply.toolCalls, [{
    id: "call_shift_1",
    name: "staff_on_shift",
    arguments: '{"period":"tomorrow","staff":"S1"}',
  }]);

  const withResult = appendAliasedToolRoundTrip(
    prepared.envelope,
    firstReply.toolCalls[0],
    {
      tool: "staff_on_shift",
      ok: true,
      days: [{
        ymd: "2026-08-26",
        staff: [{ token: "S1", ranges: [{ startMin: 600, endMin: 1_080 }] }],
      }],
      skippedUnknownStaff: 0,
    },
    { aliasTable: prepared.aliasTable },
  );
  const secondTransport = new CaptureTransport();
  await sendEgressEnvelope({
    envelope: withResult,
    guard: { aliasTable: prepared.aliasTable },
    baseUrl: "https://api.moonshot.ai/v1",
    allowedHosts: KIMI_ALLOWED_HOSTS,
    apiKey: "synthetic-key",
    transport: secondTransport,
  });
  const wire = JSON.parse(secondTransport.requests[0].body);
  const assistant = wire.messages.at(-2);
  const tool = wire.messages.at(-1);
  assertEquals(assistant.tool_calls[0].id, "call_shift_1");
  assertEquals(assistant.tool_calls[0].function.name, "staff_on_shift");
  assertEquals(tool.role, "tool");
  assertEquals(tool.tool_call_id, "call_shift_1");
  assertStringIncludes(tool.content, '"token":"S1"');
});

Deno.test("provider error cannot echo a sensitive response body", async () => {
  const { prepared } = preparedFixture();
  const echoedSecret = "response-secret-that-must-not-escape";
  const transport = new CaptureTransport({ status: 400, body: echoedSecret });
  const error = await assertRejects(
    () =>
      sendEgressEnvelope({
        envelope: prepared.envelope,
        guard: { aliasTable: prepared.aliasTable },
        baseUrl: "https://api.moonshot.ai/v1",
        allowedHosts: KIMI_ALLOWED_HOSTS,
        apiKey: "synthetic-key",
        transport,
      }),
    SafeProviderError,
  );
  assertFalse(error.message.includes(echoedSecret));
  assertFalse(JSON.stringify(safeErrorMetadata(error)).includes(echoedSecret));
  assertEquals(safeErrorMetadata(error), {
    name: "SafeProviderError",
    code: "provider",
    status: 400,
  });
});
