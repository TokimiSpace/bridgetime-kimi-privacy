export const READ_ONLY_TOOL_NAMES = [
  "staff_on_shift",
  "open_slots",
  "booking_stats",
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

export interface FunctionToolDefinition {
  type: "function";
  function: {
    name: ReadOnlyToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function periodProperties(): Record<string, unknown> {
  return {
    period: {
      type: "string",
      enum: ["today", "tomorrow", "this_week", "next_week"],
    },
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  };
}

function assertOpaqueTokens(tokens: readonly string[], prefix: "S" | "V"): void {
  const pattern = new RegExp(`^${prefix}[1-9]\\d*$`);
  if (tokens.some((token) => !pattern.test(token))) {
    throw new TypeError(`expected opaque ${prefix} tokens`);
  }
}

/**
 * Builds schema only. There is deliberately no database executor here.
 * `merchantId` is absent by construction, and service names are represented
 * by V tokens in this hardened extraction.
 */
export function buildReadOnlyToolSchemas(input: {
  staffTokens: readonly string[];
  serviceTokens?: readonly string[];
}): FunctionToolDefinition[] {
  assertOpaqueTokens(input.staffTokens, "S");
  const serviceTokens = input.serviceTokens ?? [];
  assertOpaqueTokens(serviceTokens, "V");

  const staffProperties = periodProperties();
  if (input.staffTokens.length > 0) {
    staffProperties.staff = { type: "string", enum: [...input.staffTokens] };
  }

  const slotProperties = periodProperties();
  if (serviceTokens.length > 0) {
    slotProperties.service = { type: "string", enum: [...serviceTokens] };
  }

  return [
    {
      type: "function",
      function: {
        name: "staff_on_shift",
        description: "Read aliased staff shift ranges for a bounded period.",
        parameters: {
          type: "object",
          properties: staffProperties,
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "open_slots",
        description: "Read aggregate open-slot counts for a bounded period.",
        parameters: {
          type: "object",
          properties: slotProperties,
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "booking_stats",
        description: "Read aggregate booking counts for a bounded period.",
        parameters: {
          type: "object",
          properties: periodProperties(),
          additionalProperties: false,
        },
      },
    },
  ];
}

/**
 * The envelope accepts only the exact schemas produced above. Rebuilding and
 * comparing prevents a structurally typed caller from adding a free-text
 * property, a fourth tool, or an alternative description at runtime.
 */
export function assertCanonicalReadOnlyToolSchemas(
  tools: readonly FunctionToolDefinition[],
): void {
  if (tools.length !== READ_ONLY_TOOL_NAMES.length) {
    throw new TypeError("expected the complete read-only tool set");
  }
  const staffTool = tools.find((tool) => tool.function?.name === "staff_on_shift");
  const slotsTool = tools.find((tool) => tool.function?.name === "open_slots");
  if (!staffTool || !slotsTool) throw new TypeError("read-only tool set is incomplete");

  const staffTokens = enumStringsAt(staffTool, "staff");
  const serviceTokens = enumStringsAt(slotsTool, "service");
  const canonical = buildReadOnlyToolSchemas({ staffTokens, serviceTokens });
  if (JSON.stringify(tools) !== JSON.stringify(canonical)) {
    throw new TypeError("tool schemas are not canonical");
  }
}

function enumStringsAt(tool: FunctionToolDefinition, property: string): string[] {
  const parameters = tool.function.parameters;
  const properties = parameters.properties;
  if (!isRecord(properties)) return [];
  const target = properties[property];
  if (!isRecord(target) || target.enum === undefined) return [];
  if (!Array.isArray(target.enum) || target.enum.some((value) => typeof value !== "string")) {
    throw new TypeError("tool schema contains an invalid enum");
  }
  return [...target.enum] as string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface StaffOnShiftResult {
  tool: "staff_on_shift";
  ok: true;
  days: Array<{
    ymd: string;
    staff: Array<{
      token: string;
      ranges: Array<{ startMin: number; endMin: number }>;
    }>;
  }>;
  skippedUnknownStaff: number;
}

export interface OpenSlotsResult {
  tool: "open_slots";
  ok: true;
  serviceToken?: string;
  days: Array<{
    ymd: string;
    openSlotCount: number;
    byStaff: Array<{ token: string; count: number }>;
  }>;
}

export interface BookingStatsResult {
  tool: "booking_stats";
  ok: true;
  total: number;
  byStatus: Record<string, number>;
}

export interface ToolErrorResult {
  tool: ReadOnlyToolName;
  ok: false;
  error:
    | "bad_arguments"
    | "bad_period"
    | "unknown_staff_token"
    | "unknown_service_token"
    | "internal_unavailable";
}

export type AliasedToolResult =
  | StaffOnShiftResult
  | OpenSlotsResult
  | BookingStatsResult
  | ToolErrorResult;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_RE = /^[a-z][a-z0-9_]{0,31}$/;

function assertNonNegativeInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("tool result contains an invalid count");
  }
}

function assertStaffToken(token: string): void {
  if (!/^S[1-9]\d*$/.test(token)) throw new TypeError("tool result contains a non-alias staff");
}

/** Runtime validation prevents structurally typed callers from smuggling free text into results. */
export function serializeAliasedToolResult(result: AliasedToolResult): string {
  if (!READ_ONLY_TOOL_NAMES.includes(result.tool)) throw new TypeError("unknown tool result");
  if (!result.ok) {
    return JSON.stringify({ tool: result.tool, ok: false, error: result.error });
  }

  if (result.tool === "staff_on_shift") {
    assertNonNegativeInteger(result.skippedUnknownStaff);
    for (const day of result.days) {
      if (!YMD_RE.test(day.ymd)) throw new TypeError("tool result contains an invalid date");
      for (const staff of day.staff) {
        assertStaffToken(staff.token);
        for (const range of staff.ranges) {
          assertNonNegativeInteger(range.startMin);
          assertNonNegativeInteger(range.endMin);
          if (range.endMin <= range.startMin || range.endMin > 2_880) {
            throw new TypeError("tool result contains an invalid range");
          }
        }
      }
    }
    return JSON.stringify({
      tool: result.tool,
      ok: true,
      days: result.days.map((day) => ({
        ymd: day.ymd,
        staff: day.staff.map((staff) => ({
          token: staff.token,
          ranges: staff.ranges.map((range) => ({
            startMin: range.startMin,
            endMin: range.endMin,
          })),
        })),
      })),
      skippedUnknownStaff: result.skippedUnknownStaff,
    });
  } else if (result.tool === "open_slots") {
    if (result.serviceToken && !/^V[1-9]\d*$/.test(result.serviceToken)) {
      throw new TypeError("tool result contains a non-alias service");
    }
    for (const day of result.days) {
      if (!YMD_RE.test(day.ymd)) throw new TypeError("tool result contains an invalid date");
      assertNonNegativeInteger(day.openSlotCount);
      for (const staff of day.byStaff) {
        assertStaffToken(staff.token);
        assertNonNegativeInteger(staff.count);
      }
    }
    return JSON.stringify({
      tool: result.tool,
      ok: true,
      ...(result.serviceToken ? { serviceToken: result.serviceToken } : {}),
      days: result.days.map((day) => ({
        ymd: day.ymd,
        openSlotCount: day.openSlotCount,
        byStaff: day.byStaff.map((staff) => ({ token: staff.token, count: staff.count })),
      })),
    });
  } else {
    assertNonNegativeInteger(result.total);
    for (const [status, count] of Object.entries(result.byStatus)) {
      if (!STATUS_RE.test(status)) throw new TypeError("tool result contains an invalid status");
      assertNonNegativeInteger(count);
    }
    return JSON.stringify({
      tool: result.tool,
      ok: true,
      total: result.total,
      byStatus: Object.fromEntries(Object.entries(result.byStatus)),
    });
  }
}
