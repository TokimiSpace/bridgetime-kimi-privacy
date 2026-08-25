export const READ_ONLY_TOOL_NAMES = [
  "staff_on_shift",
  "open_slots",
  "booking_stats",
] as const;

export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "canceled_silent",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const TOOL_ERROR_CODES = [
  "bad_arguments",
  "bad_period",
  "unknown_staff_token",
  "unknown_service_token",
  "internal_unavailable",
] as const;

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

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

export interface ReadOnlyToolCall {
  id: string;
  name: ReadOnlyToolName;
  /** Canonical JSON: parsed and rebuilt from an allowlist before egress. */
  arguments: string;
}

const TOOL_CALL_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_VALUES = ["today", "tomorrow", "this_week", "next_week"] as const;

export function isReadOnlyToolName(value: unknown): value is ReadOnlyToolName {
  return typeof value === "string" &&
    (READ_ONLY_TOOL_NAMES as readonly string[]).includes(value);
}

/**
 * Validates a provider-generated tool call and returns canonical arguments.
 * Only fixed period/date/token keys are accepted; arbitrary free text and
 * tenant identifiers cannot enter the assistant history through this path.
 */
export function canonicalizeReadOnlyToolCall(
  call: { id: unknown; name: unknown; arguments: unknown },
  tools: readonly FunctionToolDefinition[],
): ReadOnlyToolCall {
  assertCanonicalReadOnlyToolSchemas(tools);
  if (typeof call.id !== "string" || !TOOL_CALL_ID_RE.test(call.id)) {
    throw new TypeError("tool call contains an invalid id");
  }
  if (!isReadOnlyToolName(call.name) || typeof call.arguments !== "string") {
    throw new TypeError("tool call is not read-only");
  }
  if (call.arguments.length > 2_000) throw new TypeError("tool arguments are too large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments);
  } catch {
    throw new TypeError("tool arguments are not valid JSON");
  }
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    throw new TypeError("tool arguments must be an object");
  }

  const allowedKeys = call.name === "staff_on_shift"
    ? ["period", "from", "to", "staff"]
    : call.name === "open_slots"
    ? ["period", "from", "to", "service"]
    : ["period", "from", "to"];
  if (Object.keys(parsed).some((key) => !allowedKeys.includes(key))) {
    throw new TypeError("tool arguments contain an unknown key");
  }
  for (const value of Object.values(parsed)) {
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
      throw new TypeError("tool argument values must be bounded strings");
    }
  }

  const period = parsed.period;
  const from = parsed.from;
  const to = parsed.to;
  if (period !== undefined) {
    if (
      !(PERIOD_VALUES as readonly unknown[]).includes(period) || from !== undefined ||
      to !== undefined
    ) {
      throw new TypeError("tool call contains an invalid period");
    }
  } else if ((from === undefined) !== (to === undefined)) {
    throw new TypeError("tool call requires both from and to");
  } else if (from !== undefined && (!isValidYmd(from) || !isValidYmd(to))) {
    throw new TypeError("tool call contains an invalid date");
  }

  if (call.name === "staff_on_shift" && parsed.staff !== undefined) {
    const allowed = enumStringsAt(
      tools.find((tool) => tool.function.name === "staff_on_shift")!,
      "staff",
    );
    if (!allowed.includes(parsed.staff as string)) {
      throw new TypeError("tool call contains an unknown staff token");
    }
  }
  if (call.name === "open_slots" && parsed.service !== undefined) {
    const allowed = enumStringsAt(
      tools.find((tool) => tool.function.name === "open_slots")!,
      "service",
    );
    if (!allowed.includes(parsed.service as string)) {
      throw new TypeError("tool call contains an unknown service token");
    }
  }

  const canonicalArguments = Object.fromEntries(
    allowedKeys.filter((key) => parsed[key] !== undefined).map((key) => [key, parsed[key]]),
  );
  return { id: call.id, name: call.name, arguments: JSON.stringify(canonicalArguments) };
}

function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
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
  byStatus: Partial<Record<BookingStatus, number>>;
}

export interface ToolErrorResult {
  tool: ReadOnlyToolName;
  ok: false;
  error: ToolErrorCode;
}

export type AliasedToolResult =
  | StaffOnShiftResult
  | OpenSlotsResult
  | BookingStatsResult
  | ToolErrorResult;

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
  if (!result || typeof result !== "object" || !isReadOnlyToolName(result.tool)) {
    throw new TypeError("unknown tool result");
  }
  if (result.ok !== true && result.ok !== false) {
    throw new TypeError("tool result contains an invalid outcome flag");
  }
  if (!result.ok) {
    if (!(TOOL_ERROR_CODES as readonly unknown[]).includes(result.error)) {
      throw new TypeError("tool result contains an unknown error code");
    }
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
      if (!(BOOKING_STATUSES as readonly string[]).includes(status)) {
        throw new TypeError("tool result contains an invalid status");
      }
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
