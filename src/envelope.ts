import { type AliasTable, applyAliases, assertValidAliasTable } from "./alias.ts";
import { PrivacyBoundaryError, type PrivacyErrorCode } from "./errors.ts";
import { normalize } from "./normalize.ts";
import {
  type AliasedToolResult,
  assertCanonicalReadOnlyToolSchemas,
  type FunctionToolDefinition,
  serializeAliasedToolResult,
} from "./tools.ts";

export interface EgressMessageV1 {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

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
      ...(input.priorAliasedMessages ?? []).map((message) => ({ ...message })),
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

export function appendAliasedToolResult(
  envelope: EgressEnvelopeV1,
  toolCallId: string,
  result: AliasedToolResult,
  guard: EgressGuard,
): EgressEnvelopeV1 {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(toolCallId)) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  const next: EgressEnvelopeV1 = {
    ...structuredClone(envelope),
    messages: [
      ...envelope.messages.map((message) => ({ ...message })),
      {
        role: "tool",
        toolCallId,
        content: serializeAliasedToolResult(result),
      },
    ],
  };
  assertEgressEnvelopeSafe(next, guard);
  return next;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MOBILE_RE = /(?<!\d)(?:\+886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/;
const LANDLINE_RE = /(?<!\d)0[2-8][-\s]?\d{3,4}[-\s]?\d{4}(?!\d)/;
const TAIWAN_ID_RE = /(?<![A-Za-z0-9])[A-Z][12]\d{8}(?![A-Za-z0-9])/;
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
  for (const literal of protectedLiterals(guard)) {
    if (serialized.includes(literal)) findings.add("residual_sensitive_value");
  }
  if (EMAIL_RE.test(serialized)) findings.add("residual_email");
  if (MOBILE_RE.test(serialized) || LANDLINE_RE.test(serialized)) {
    findings.add("residual_phone");
  }
  if (TAIWAN_ID_RE.test(serialized)) findings.add("residual_national_id");
  if (LONG_NUMBER_RE.test(serialized)) findings.add("residual_long_number");
  if (CREDENTIAL_RE.test(serialized)) findings.add("credential_shape");
  return [...findings];
}

export function assertSerializedEgressSafe(serialized: string, guard: EgressGuard): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  const findings = scanSerializedEgress(serialized, guard);
  if (findings.length > 0) throw new PrivacyBoundaryError(findings);
}

export function assertEgressEnvelopeSafe(envelope: EgressEnvelopeV1, guard: EgressGuard): void {
  if (
    envelope.schema !== "tokimispace.bridgetime.egress-envelope" || envelope.version !== 1 ||
    envelope.privacy.policy !== "fail_closed" ||
    envelope.privacy.reversibleMappingIncluded !== false
  ) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  assertSerializedEgressSafe(JSON.stringify(envelope), guard);
}
