import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  type AliasedToolResult,
  assertCanonicalReadOnlyToolSchemas,
  buildReadOnlyToolSchemas,
  canonicalizeReadOnlyToolCall,
  READ_ONLY_TOOL_NAMES,
  serializeAliasedToolResult,
} from "../src/mod.ts";

Deno.test("tool schemas expose only the fixed read-only allowlist and opaque tokens", () => {
  const tools = buildReadOnlyToolSchemas({
    staffTokens: ["S1", "S2"],
    serviceTokens: ["V1"],
  });
  assertEquals(tools.map((tool) => tool.function.name), [...READ_ONLY_TOOL_NAMES]);

  const serialized = JSON.stringify(tools);
  assertEquals(serialized.includes("merchantId"), false);
  assertEquals(serialized.includes("customer"), false);
  assertEquals(/\b(create|update|delete|write|cancel)_/i.test(serialized), false);
  assertStringIncludes(serialized, "S1");
  assertStringIncludes(serialized, "V1");
});

Deno.test("serializer drops unexpected runtime properties instead of reflecting them", () => {
  const untrusted = {
    tool: "booking_stats",
    ok: true,
    total: 1,
    byStatus: { confirmed: 1 },
    displayName: "synthetic raw name",
  } as unknown as AliasedToolResult;
  const serialized = serializeAliasedToolResult(untrusted);
  assertEquals(serialized.includes("displayName"), false);
  assertEquals(serialized.includes("synthetic raw name"), false);
});

Deno.test("mutated tool schemas are rejected by envelope preparation", () => {
  const tools = buildReadOnlyToolSchemas({ staffTokens: ["S1"] });
  (tools[0].function.parameters as Record<string, unknown>).unexpected = "free text";
  assertThrows(() => assertCanonicalReadOnlyToolSchemas(tools), TypeError);
});

Deno.test("aliased schedule result contains tokens and aggregates only", () => {
  const serialized = serializeAliasedToolResult({
    tool: "staff_on_shift",
    ok: true,
    days: [{
      ymd: "2026-08-25",
      staff: [{ token: "S1", ranges: [{ startMin: 540, endMin: 1_020 }] }],
    }],
    skippedUnknownStaff: 0,
  });
  assertStringIncludes(serialized, '"token":"S1"');
  assertEquals(serialized.includes("displayName"), false);
  assertEquals(serialized.includes("staffId"), false);
});

Deno.test("serializer rejects free-text fields disguised as tokens or statuses", () => {
  assertThrows(
    () =>
      serializeAliasedToolResult({
        tool: "open_slots",
        ok: true,
        serviceToken: "Haircut for a person",
        days: [],
      }),
    TypeError,
  );
  assertThrows(
    () =>
      serializeAliasedToolResult({
        tool: "booking_stats",
        ok: true,
        total: 1,
        byStatus: { "free text": 1 },
      } as unknown as AliasedToolResult),
    TypeError,
  );
  assertThrows(
    () =>
      serializeAliasedToolResult({
        tool: "booking_stats",
        ok: true,
        total: 1,
        byStatus: { invented_status: 1 },
      } as unknown as AliasedToolResult),
    TypeError,
  );
  assertThrows(
    () =>
      serializeAliasedToolResult({
        tool: "booking_stats",
        ok: false,
        error: "raw provider text",
      } as unknown as AliasedToolResult),
    TypeError,
  );
});

Deno.test("tool calls accept only fixed names, keys, periods and schema tokens", () => {
  const tools = buildReadOnlyToolSchemas({ staffTokens: ["S1"], serviceTokens: ["V1"] });
  assertEquals(
    canonicalizeReadOnlyToolCall({
      id: "call_1",
      name: "staff_on_shift",
      arguments: '{"staff":"S1","period":"tomorrow"}',
    }, tools),
    {
      id: "call_1",
      name: "staff_on_shift",
      arguments: '{"period":"tomorrow","staff":"S1"}',
    },
  );
  assertThrows(
    () =>
      canonicalizeReadOnlyToolCall({
        id: "call_2",
        name: "booking_stats",
        arguments: '{"period":"today","merchantId":"tenant-1"}',
      }, tools),
    TypeError,
  );
  assertThrows(
    () =>
      canonicalizeReadOnlyToolCall({
        id: "call_3",
        name: "staff_on_shift",
        arguments: '{"period":"today","staff":"S999"}',
      }, tools),
    TypeError,
  );
});
