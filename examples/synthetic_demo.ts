import {
  buildAliasTable,
  buildReadOnlyToolSchemas,
  CaptureTransport,
  KIMI_ALLOWED_HOSTS,
  prepareEgressEnvelopeV1,
  sendEgressEnvelope,
} from "../src/mod.ts";

const identity = (length: number) => Array.from({ length }, (_, index) => index);
const table = buildAliasTable(
  [{ id: "staff-synthetic-1", displayName: "林範例" }],
  [{ id: "customer-synthetic-1", displayName: "陳測試" }],
  identity,
);
const prepared = prepareEgressEnvelopeV1({
  model: "kimi-k2.6",
  systemPrompt: "Use only opaque tokens and read-only aggregate tools.",
  rawUserText: "林範例請聯絡陳測試，電話 0912-000-123，信箱 demo.person@example.test",
  aliasTable: table,
  tools: buildReadOnlyToolSchemas({ staffTokens: ["S1"], serviceTokens: ["V1"] }),
});

const capture = new CaptureTransport();
await sendEgressEnvelope({
  envelope: prepared.envelope,
  guard: { aliasTable: prepared.aliasTable },
  baseUrl: "https://api.moonshot.ai/v1",
  allowedHosts: KIMI_ALLOWED_HOSTS,
  apiKey: "synthetic-demo-key",
  transport: capture,
});

// The capture deliberately excludes authorization data. Do not print the alias table.
console.log(JSON.stringify(JSON.parse(capture.requests[0].body), null, 2));
