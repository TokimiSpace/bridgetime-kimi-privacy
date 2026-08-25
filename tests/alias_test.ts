import { assertEquals, assertThrows } from "@std/assert";
import {
  type AliasTable,
  applyAliases,
  assertValidAliasTable,
  buildAliasTable,
  normalize,
  restoreAliases,
} from "../src/mod.ts";

const identity = (length: number) => Array.from({ length }, (_, index) => index);

Deno.test("known names, Taiwan phones and emails are replaced and reversible", () => {
  const base = buildAliasTable(
    [{ id: "staff-synthetic-1", displayName: "林範例" }],
    [{ id: "customer-synthetic-1", displayName: "陳測試" }],
    identity,
  );
  const raw = "林範例請聯絡陳測試，電話 0912-000-123，信箱 demo.person@example.test";
  const result = applyAliases(raw, base);

  assertEquals(result.text, "S1請聯絡C1,電話 P1,信箱 E1");
  assertEquals(restoreAliases(result.text, result.table), normalize(raw));
});

Deno.test("full-width phone input is normalized before masking", () => {
  const result = applyAliases("０９１２０００１２３", { entries: [] });
  assertEquals(result.text, "P1");
  assertEquals(result.table.entries[0].display, "0912000123");
});

Deno.test("ASCII and full-width roster names match case-insensitively after normalization", () => {
  const table: AliasTable = {
    entries: [{ token: "S1", type: "staff", id: "staff-1", display: "Ａｍｙ" }],
  };
  assertEquals(applyAliases("amy 今天上班", table).text, "S1 今天上班");
  assertEquals(applyAliases("ＡＭＹ 今天上班", table).text, "S1 今天上班");
});

Deno.test("ASCII names match only as standalone values", () => {
  const table: AliasTable = {
    entries: [{ token: "S1", type: "staff", id: "staff-a", display: "A" }],
  };
  assertEquals(applyAliases("A works; PLAN and A1 stay", table).text, "S1 works; PLAN and A1 stay");
});

Deno.test("input alias table remains immutable", () => {
  const table: AliasTable = {
    entries: [{ token: "S1", type: "staff", id: "staff-1", display: "林範例" }],
  };
  const original = structuredClone(table);
  applyAliases("林範例 0912000123", table);
  assertEquals(table, original);
});

Deno.test("invalid or duplicate tokens are rejected", () => {
  assertThrows(
    () =>
      assertValidAliasTable({
        entries: [
          { token: "S1", type: "staff", id: "staff-1", display: "甲" },
          { token: "S1", type: "staff", id: "staff-2", display: "乙" },
        ],
      }),
    TypeError,
  );
  assertThrows(
    () =>
      assertValidAliasTable({
        entries: [{ token: "E1", type: "unexpected", id: "id-1", display: "value" }],
      } as unknown as AliasTable),
    TypeError,
  );
});
