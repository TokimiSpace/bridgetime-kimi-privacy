import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  buildAliasTable,
  buildReadOnlyToolSchemas,
  CaptureTransport,
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
  assertEquals(transport.requests.length, 1);
  const captured = JSON.stringify(transport.requests[0]);
  for (const value of Object.values(raw)) assertFalse(captured.includes(value));
  assertFalse(captured.includes("synthetic-key-never-captured"));
  assertStringIncludes(captured, "S1");
  assertStringIncludes(captured, "P1");
  assertStringIncludes(captured, "E1");
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
