import { type AliasTable, applyAliases, assertValidAliasTable } from "./alias.ts";
import { PrivacyBoundaryError, type PrivacyErrorCode } from "./errors.ts";
import { normalize } from "./normalize.ts";
import {
  type AliasedToolResult,
  assertCanonicalReadOnlyToolSchemas,
  canonicalizeReadOnlyToolCall,
  type FunctionToolDefinition,
  type ReadOnlyToolCall,
  serializeAliasedToolResult,
} from "./tools.ts";

export type EgressMessageV1 =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ReadOnlyToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export interface EgressEnvelopeV1 {
  schema: "tokimispace.bridgetime.egress-envelope";
  version: 1;
  purpose: "merchant_assistant";
  model: string;
  messages: EgressMessageV1[];
  tools: FunctionToolDefinition[];
  privacy: {
    transformation: "reversible_pseudonymization";
    policy: "fail_closed";
    scanProfile: "declared-and-detectable-v1";
    reversibleMappingIncluded: false;
  };
}

/** Server-side only. Never serialize this object into an outbound request. */
export interface EgressGuard {
  aliasTable: AliasTable;
  declaredSensitiveLiterals?: readonly string[];
}

export interface PrepareEnvelopeInput {
  model: string;
  systemPrompt: string;
  rawUserText: string;
  aliasTable: AliasTable;
  tools: readonly FunctionToolDefinition[];
  /** Already-pseudonymized history only; every value is scanned again. */
  priorAliasedMessages?: readonly EgressMessageV1[];
  /** Known sensitive values not represented by the roster table. */
  declaredSensitiveLiterals?: readonly string[];
}

export interface PreparedEnvelope {
  envelope: EgressEnvelopeV1;
  /** Keep server-side for later restoration and subsequent egress scans. */
  aliasTable: AliasTable;
  /** Useful for local orchestration; it is the same safe value in the envelope. */
  maskedUserText: string;
}

export function prepareEgressEnvelopeV1(input: PrepareEnvelopeInput): PreparedEnvelope {
  if (!input.model.trim() || !input.systemPrompt.trim()) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }

  try {
    assertValidAliasTable(input.aliasTable);
  } catch {
    throw new PrivacyBoundaryError(["invalid_alias_table"]);
  }
  try {
    assertCanonicalReadOnlyToolSchemas(input.tools);
  } catch {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }

  const aliased = applyAliases(input.rawUserText, input.aliasTable);
  const envelope: EgressEnvelopeV1 = {
    schema: "tokimispace.bridgetime.egress-envelope",
    version: 1,
    purpose: "merchant_assistant",
    model: input.model.trim(),
    messages: [
      { role: "system", content: input.systemPrompt.trim() },
      ...(input.priorAliasedMessages ?? []).map((message) => structuredClone(message)),
      { role: "user", content: aliased.text },
    ],
    tools: input.tools.map((tool) => structuredClone(tool)),
    privacy: {
      transformation: "reversible_pseudonymization",
      policy: "fail_closed",
      scanProfile: "declared-and-detectable-v1",
      reversibleMappingIncluded: false,
    },
  };

  assertEgressEnvelopeSafe(envelope, {
    aliasTable: aliased.table,
    declaredSensitiveLiterals: input.declaredSensitiveLiterals,
  });
  return { envelope, aliasTable: aliased.table, maskedUserText: aliased.text };
}

/**
 * Appends the assistant tool call and its matching local result as one
 * validated pair. This prevents an orphan `tool` message from reaching an
 * OpenAI-compatible endpoint.
 */
export function appendAliasedToolRoundTrip(
  envelope: EgressEnvelopeV1,
  toolCall: { id: unknown; name: unknown; arguments: unknown },
  result: AliasedToolResult,
  guard: EgressGuard,
): EgressEnvelopeV1 {
  let canonicalCall: ReadOnlyToolCall;
  let serializedResult: string;
  try {
    canonicalCall = canonicalizeReadOnlyToolCall(toolCall, envelope.tools);
    if (result.tool !== canonicalCall.name) throw new TypeError("tool call/result mismatch");
    serializedResult = serializeAliasedToolResult(result);
  } catch {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  const next: EgressEnvelopeV1 = {
    ...structuredClone(envelope),
    messages: [
      ...envelope.messages.map((message) => structuredClone(message)),
      {
        role: "assistant",
        content: "",
        toolCalls: [canonicalCall],
      },
      {
        role: "tool",
        toolCallId: canonicalCall.id,
        content: serializedResult,
      },
    ],
  };
  assertEgressEnvelopeSafe(next, guard);
  return next;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MOBILE_RE = /(?<!\d)(?:\+886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/;
const LANDLINE_RE = /(?<!\d)0[2-8][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/;
const TAIWAN_ID_RE = /(?<![A-Za-z0-9])[A-Z][12]\d{8}(?![A-Za-z0-9])/i;
const LONG_NUMBER_RE = /(?<!\d)\d{7,}(?!\d)/;
const CREDENTIAL_RE = /(?:Bearer\s+|sk-)[A-Za-z0-9_-]{8,}/i;

function protectedLiterals(guard: EgressGuard): string[] {
  return [
    ...guard.aliasTable.entries.flatMap((entry) => [
      entry.id,
      entry.display,
      normalize(entry.display),
    ]),
    ...(guard.declaredSensitiveLiterals ?? []).flatMap((literal) => [
      literal,
      normalize(literal),
    ]),
  ].filter((literal, index, all) => literal.length > 0 && all.indexOf(literal) === index);
}

export function scanSerializedEgress(
  serialized: string,
  guard: EgressGuard,
): PrivacyErrorCode[] {
  const findings = new Set<PrivacyErrorCode>();
  // Normalize a scan-only copy so full-width ASCII cannot bypass a protected
  // literal or supported pattern. The original wire body is never changed.
  const normalizedSerialized = normalize(serialized);
  const caseFoldedSerialized = normalizedSerialized.toLocaleLowerCase("en-US");
  for (const literal of protectedLiterals(guard)) {
    if (caseFoldedSerialized.includes(literal.toLocaleLowerCase("en-US"))) {
      findings.add("residual_sensitive_value");
    }
  }
  if (EMAIL_RE.test(normalizedSerialized)) findings.add("residual_email");
  if (MOBILE_RE.test(normalizedSerialized) || LANDLINE_RE.test(normalizedSerialized)) {
    findings.add("residual_phone");
  }
  if (TAIWAN_ID_RE.test(normalizedSerialized)) findings.add("residual_national_id");
  if (LONG_NUMBER_RE.test(normalizedSerialized)) findings.add("residual_long_number");
  if (CREDENTIAL_RE.test(normalizedSerialized)) findings.add("credential_shape");
  return [...findings];
}

export function assertSerializedEgressSafe(serialized: string, guard: EgressGuard): void {
  try {
    assertGuardRuntimeShape(guard);
  } catch {
    throw new PrivacyBoundaryError(["invalid_alias_table"]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  if (!isRecord(parsed)) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  const findings = scanSerializedEgress(serialized, guard);
  if (findings.length > 0) throw new PrivacyBoundaryError(findings);
}

export function assertEgressEnvelopeSafe(envelope: EgressEnvelopeV1, guard: EgressGuard): void {
  try {
    assertGuardRuntimeShape(guard);
    assertEnvelopeRuntimeShape(envelope);
  } catch {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  assertSerializedEgressSafe(JSON.stringify(envelope), guard);
}

function assertGuardRuntimeShape(value: unknown): asserts value is EgressGuard {
  if (!isRecord(value) || !hasExactKeys(value, ["aliasTable"], ["declaredSensitiveLiterals"])) {
    throw new TypeError("invalid egress guard");
  }
  assertValidAliasTable(value.aliasTable as AliasTable);
  const table = value.aliasTable as AliasTable;
  if (
    table.entries.length > 1_000 ||
    table.entries.some((entry) => entry.id.length > 512 || entry.display.length > 512)
  ) {
    throw new TypeError("egress guard is too large");
  }
  const declared = value.declaredSensitiveLiterals;
  if (
    declared !== undefined &&
    (!Array.isArray(declared) || declared.length > 256 ||
      declared.some((literal) =>
        typeof literal !== "string" || literal.length === 0 || literal.length > 512
      ))
  ) {
    throw new TypeError("invalid declared sensitive literals");
  }
}

const MAX_MESSAGES = 64;
const MAX_SYSTEM_LENGTH = 8_000;
const MAX_USER_LENGTH = 2_000;
const MAX_ASSISTANT_LENGTH = 20_000;
const MAX_TOOL_LENGTH = 20_000;
const MAX_TOTAL_CONTENT_LENGTH = 64_000;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function assertEnvelopeRuntimeShape(value: unknown): asserts value is EgressEnvelopeV1 {
  if (
    !isRecord(value) || !hasExactKeys(value, [
      "schema",
      "version",
      "purpose",
      "model",
      "messages",
      "tools",
      "privacy",
    ])
  ) {
    throw new TypeError("invalid envelope fields");
  }
  if (
    value.schema !== "tokimispace.bridgetime.egress-envelope" || value.version !== 1 ||
    value.purpose !== "merchant_assistant" || typeof value.model !== "string" ||
    !MODEL_RE.test(value.model)
  ) {
    throw new TypeError("invalid envelope identity");
  }
  if (!Array.isArray(value.tools)) throw new TypeError("invalid envelope tools");
  assertCanonicalReadOnlyToolSchemas(value.tools as FunctionToolDefinition[]);
  if (
    !isRecord(value.privacy) || !hasExactKeys(value.privacy, [
      "transformation",
      "policy",
      "scanProfile",
      "reversibleMappingIncluded",
    ]) || value.privacy.transformation !== "reversible_pseudonymization" ||
    value.privacy.policy !== "fail_closed" ||
    value.privacy.scanProfile !== "declared-and-detectable-v1" ||
    value.privacy.reversibleMappingIncluded !== false
  ) {
    throw new TypeError("invalid privacy policy metadata");
  }
  if (
    !Array.isArray(value.messages) || value.messages.length < 2 ||
    value.messages.length > MAX_MESSAGES
  ) {
    throw new TypeError("invalid message count");
  }

  let totalContentLength = 0;
  const callIds = new Set<string>();
  for (let index = 0; index < value.messages.length; index++) {
    const message = value.messages[index];
    if (
      !isRecord(message) || typeof message.role !== "string" ||
      typeof message.content !== "string"
    ) {
      throw new TypeError("invalid message");
    }
    totalContentLength += message.content.length;
    if (index === 0) {
      if (
        message.role !== "system" || !hasExactKeys(message, ["role", "content"]) ||
        message.content.length === 0 || message.content.length > MAX_SYSTEM_LENGTH
      ) {
        throw new TypeError("invalid system message");
      }
      continue;
    }
    if (message.role === "system") throw new TypeError("duplicate system message");

    if (message.role === "user") {
      if (
        !hasExactKeys(message, ["role", "content"]) || message.content.length === 0 ||
        message.content.length > MAX_USER_LENGTH
      ) {
        throw new TypeError("invalid user message");
      }
      continue;
    }

    if (message.role === "assistant") {
      if (!hasExactKeys(message, ["role", "content"], ["toolCalls"])) {
        throw new TypeError("invalid assistant fields");
      }
      if (message.content.length > MAX_ASSISTANT_LENGTH) {
        throw new TypeError("assistant message too large");
      }
      if (message.toolCalls === undefined) {
        if (message.content.length === 0) throw new TypeError("empty assistant message");
        continue;
      }
      if (!Array.isArray(message.toolCalls) || message.toolCalls.length !== 1) {
        throw new TypeError("expected one tool call");
      }
      const rawCall = message.toolCalls[0];
      if (!isRecord(rawCall) || !hasExactKeys(rawCall, ["id", "name", "arguments"])) {
        throw new TypeError("invalid tool call fields");
      }
      const canonicalCall = canonicalizeReadOnlyToolCall({
        id: rawCall.id,
        name: rawCall.name,
        arguments: rawCall.arguments,
      }, value.tools);
      if (
        canonicalCall.id !== rawCall.id || canonicalCall.name !== rawCall.name ||
        canonicalCall.arguments !== rawCall.arguments || callIds.has(canonicalCall.id)
      ) {
        throw new TypeError("non-canonical or duplicate tool call");
      }
      callIds.add(canonicalCall.id);

      const toolMessage = value.messages[index + 1];
      if (
        !isRecord(toolMessage) || toolMessage.role !== "tool" ||
        toolMessage.toolCallId !== canonicalCall.id
      ) {
        throw new TypeError("orphan assistant tool call");
      }
      continue;
    }

    if (message.role === "tool") {
      if (
        !hasExactKeys(message, ["role", "content", "toolCallId"]) ||
        message.content.length === 0 || message.content.length > MAX_TOOL_LENGTH ||
        typeof message.toolCallId !== "string"
      ) {
        throw new TypeError("invalid tool message");
      }
      const assistant = value.messages[index - 1];
      if (
        !isRecord(assistant) || assistant.role !== "assistant" ||
        !Array.isArray(assistant.toolCalls) || assistant.toolCalls.length !== 1 ||
        !isRecord(assistant.toolCalls[0]) || assistant.toolCalls[0].id !== message.toolCallId
      ) {
        throw new TypeError("orphan tool result");
      }
      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(message.content);
        const canonicalResult = serializeAliasedToolResult(parsedResult as AliasedToolResult);
        if (
          canonicalResult !== message.content || !isRecord(parsedResult) ||
          parsedResult.tool !== assistant.toolCalls[0].name
        ) {
          throw new TypeError("tool result mismatch");
        }
      } catch {
        throw new TypeError("invalid tool result");
      }
      continue;
    }
    throw new TypeError("unknown message role");
  }
  if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
    throw new TypeError("conversation is too large");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}
