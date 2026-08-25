import { assert, assertEquals, assertFalse, assertStringIncludes, assertThrows } from "@std/assert";
import {
  appendAliasedToolResult,
  buildAliasTable,
  buildReadOnlyToolSchemas,
  prepareEgressEnvelopeV1,
  PrivacyBoundaryError,
  scanSerializedEgress,
} from "../src/mod.ts";

const identity = (length: number) => Array.from({ length }, (_, index) => index);

function fixture() {
  const rawValues = {
    staffName: "林範例",
    customerName: "陳測試",
    phone: "0912-000-123",
    email: "demo.person@example.test",
  };
  const aliasTable = buildAliasTable(
    [{ id: "staff-synthetic-1", displayName: rawValues.staffName }],
    [{ id: "customer-synthetic-1", displayName: rawValues.customerName }],
    identity,
  );
  const tools = buildReadOnlyToolSchemas({ staffTokens: ["S1"], serviceTokens: ["V1"] });
  return { rawValues, aliasTable, tools };
}

Deno.test("EgressEnvelopeV1 excludes every specified raw sensitive value", () => {
  const { rawValues, aliasTable, tools } = fixture();
  const prepared = prepareEgressEnvelopeV1({
    model: "kimi-k2.6",
    systemPrompt: "Use only opaque tokens and read-only tools.",
    rawUserText:
      `${rawValues.staffName}請聯絡${rawValues.customerName} ${rawValues.phone} ${rawValues.email}`,
    aliasTable,
    tools,
  });
  const outboundJson = JSON.stringify(prepared.envelope);

  for (const raw of Object.values(rawValues)) {
    assertFalse(outboundJson.includes(raw), `outbound JSON contained synthetic raw value: ${raw}`);
  }
  assertStringIncludes(outboundJson, "S1");
  assertStringIncludes(outboundJson, "C1");
  assertStringIncludes(outboundJson, "P1");
  assertStringIncludes(outboundJson, "E1");
  assertFalse(outboundJson.includes("aliasTable"));
  assertEquals(
    scanSerializedEgress(outboundJson, { aliasTable: prepared.aliasTable }),
    [],
  );
});

Deno.test("aliased tool result can be appended without names or tenant identifiers", () => {
  const { aliasTable, tools } = fixture();
  const prepared = prepareEgressEnvelopeV1({
    model: "kimi-k2.6",
    systemPrompt: "Use read-only tools.",
    rawUserText: "請問 S1 明天有班嗎？",
    aliasTable,
    tools,
  });
  const next = appendAliasedToolResult(
    prepared.envelope,
    "call_synthetic_1",
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
  const serialized = JSON.stringify(next);
  assertStringIncludes(serialized, "call_synthetic_1");
  assertFalse(serialized.includes("staff-synthetic-1"));
  assertFalse(serialized.includes("merchantId"));
});

Deno.test("declared residuals fail closed even when no detector understands their meaning", () => {
  const { aliasTable, tools } = fixture();
  const sensitiveProjectCode = "private-note-omega";
  const error = assertThrows(
    () =>
      prepareEgressEnvelopeV1({
        model: "kimi-k2.6",
        systemPrompt: `Never reveal ${sensitiveProjectCode}`,
        rawUserText: "請整理資料",
        aliasTable,
        tools,
        declaredSensitiveLiterals: [sensitiveProjectCode],
      }),
    PrivacyBoundaryError,
  );
  assert(error.findings.includes("residual_sensitive_value"));
  assertFalse(error.message.includes(sensitiveProjectCode));
});

Deno.test("a residual Taiwan ID-shaped value fails closed", () => {
  const { aliasTable, tools } = fixture();
  const error = assertThrows(
    () =>
      prepareEgressEnvelopeV1({
        model: "kimi-k2.6",
        systemPrompt: "Use read-only tools.",
        rawUserText: "未分類代碼 A123456789",
        aliasTable,
        tools,
      }),
    PrivacyBoundaryError,
  );
  assert(error.findings.includes("residual_national_id"));
});
