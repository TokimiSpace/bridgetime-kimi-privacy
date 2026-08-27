import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from "@std/assert";
import {
  buildPrivateIntentEnvelopeV1,
  CaptureTransport,
  KIMI_API_BASE_URL,
  KIMI_PRIVATE_INTENT_MODEL,
  PrivacyBoundaryError,
  rebuildPrivateIntentEnvelopeV1,
  sendPrivateIntentEnvelope,
  serializePrivateIntentEnvelopeV1,
} from "../src/mod.ts";

Deno.test("private intent envelope contains exactly five fixed enum fields", () => {
  const envelope = buildPrivateIntentEnvelopeV1(
    "create_staff",
    "structured_form",
    "preview",
  );
  assertEquals(Object.keys(envelope).sort(), ["action", "entity", "schema", "source", "stage"]);
  assertEquals(envelope, {
    schema: "bridgetime.private-intent.v1",
    action: "create",
    entity: "staff",
    source: "structured_form",
    stage: "preview",
  });
  assert(Object.isFrozen(envelope));
});

Deno.test("runtime guard rebuilds the envelope and strips accidental business data", () => {
  const canary = "王小美-VIP產後護理-0912345678-merchant-secret";
  const tainted = {
    ...buildPrivateIntentEnvelopeV1("create_service", "natural_language", "request"),
    accidentalBusinessData: canary,
    rawMessage: canary,
  };
  const rebuilt = rebuildPrivateIntentEnvelopeV1(tainted);
  const serialized = serializePrivateIntentEnvelopeV1(tainted);
  assertEquals(Object.keys(rebuilt).sort(), ["action", "entity", "schema", "source", "stage"]);
  assertFalse(serialized.includes(canary));
});

Deno.test("runtime guard fails closed for invalid or mismatched enums", () => {
  const base = buildPrivateIntentEnvelopeV1("list_staff", "quick_action", "request");
  assertThrows(
    () => serializePrivateIntentEnvelopeV1({ ...base, action: "王小美" }),
    PrivacyBoundaryError,
  );
  assertThrows(
    () => serializePrivateIntentEnvelopeV1({ ...base, entity: "schedule" }),
    PrivacyBoundaryError,
  );
  assertThrows(
    () =>
      buildPrivateIntentEnvelopeV1(
        "merchant-secret" as never,
        "quick_action",
        "request",
      ),
    PrivacyBoundaryError,
  );
});

Deno.test("private Kimi transport sends only the canonical envelope and pinned metadata", async () => {
  const canary = "owner@example.test 台北市信義路 09:00 Asia/Taipei";
  const tainted = {
    ...buildPrivateIntentEnvelopeV1("schedule", "structured_form", "preview"),
    leaked: canary,
  } as unknown as Parameters<typeof sendPrivateIntentEnvelope>[0]["envelope"];
  const transport = new CaptureTransport();

  assertEquals(
    await sendPrivateIntentEnvelope({
      envelope: tainted,
      apiKey: "synthetic-key-never-captured",
      transport,
    }),
    { providerConsulted: true },
  );
  assertEquals(transport.requests.length, 1);
  const capture = JSON.stringify(transport.requests[0]);
  assertFalse(capture.includes(canary));
  assertFalse(capture.includes("synthetic-key-never-captured"));
  assertEquals(transport.requests[0].url, `${KIMI_API_BASE_URL}/chat/completions`);

  const wire = JSON.parse(transport.requests[0].body);
  assertEquals(wire.model, KIMI_PRIVATE_INTENT_MODEL);
  assertEquals(wire.max_tokens, 128);
  assertEquals(wire.thinking, { type: "disabled" });
  assertEquals(JSON.parse(wire.messages[1].content), {
    schema: "bridgetime.private-intent.v1",
    action: "schedule",
    entity: "schedule",
    source: "structured_form",
    stage: "preview",
  });
});

Deno.test("invalid private envelope is blocked before transport", async () => {
  const invalid = {
    ...buildPrivateIntentEnvelopeV1("help", "quick_action", "request"),
    source: "merchant-secret",
  } as unknown as Parameters<typeof sendPrivateIntentEnvelope>[0]["envelope"];
  const transport = new CaptureTransport();
  await assertRejects(
    () =>
      sendPrivateIntentEnvelope({
        envelope: invalid,
        apiKey: "synthetic-key",
        transport,
      }),
    PrivacyBoundaryError,
  );
  assertEquals(transport.requests.length, 0);
});

Deno.test("private provider errors never reflect a response body", async () => {
  const echoedCanary = "provider-echo-owner@example.test-0912345678";
  const transport = new CaptureTransport({ status: 400, body: echoedCanary });
  const error = await assertRejects(
    () =>
      sendPrivateIntentEnvelope({
        envelope: buildPrivateIntentEnvelopeV1("help", "quick_action", "request"),
        apiKey: "synthetic-key",
        transport,
      }),
    Error,
  );
  assertFalse(error.message.includes(echoedCanary));
  assertFalse(JSON.stringify(error).includes(echoedCanary));
});
