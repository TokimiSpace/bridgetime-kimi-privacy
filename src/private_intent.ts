import { PrivacyBoundaryError } from "./errors.ts";

/**
 * The only merchant-management meaning that may be classified locally and
 * mapped to the provider-facing envelope. Raw text and business values are
 * deliberately not members of this type.
 */
export type PrivateMerchantIntent =
  | "list_staff"
  | "list_services"
  | "create_staff"
  | "create_service"
  | "manage_staff_services"
  | "schedule"
  | "help"
  | "unknown";

export type PrivateIntentEnvelopeV1 = Readonly<{
  schema: "bridgetime.private-intent.v1";
  action: "list" | "create" | "update" | "schedule" | "help" | "unknown";
  entity: "staff" | "service" | "staff_service" | "schedule" | "none";
  source: "natural_language" | "quick_action" | "structured_form";
  stage: "request" | "preview";
}>;

const INTENT_MAPPING: Record<
  PrivateMerchantIntent,
  Pick<PrivateIntentEnvelopeV1, "action" | "entity">
> = {
  list_staff: { action: "list", entity: "staff" },
  list_services: { action: "list", entity: "service" },
  create_staff: { action: "create", entity: "staff" },
  create_service: { action: "create", entity: "service" },
  manage_staff_services: { action: "update", entity: "staff_service" },
  schedule: { action: "schedule", entity: "schedule" },
  help: { action: "help", entity: "none" },
  unknown: { action: "unknown", entity: "none" },
};

const SOURCES: readonly PrivateIntentEnvelopeV1["source"][] = [
  "natural_language",
  "quick_action",
  "structured_form",
];
const STAGES: readonly PrivateIntentEnvelopeV1["stage"][] = ["request", "preview"];
const ALLOWED_PAIRS = new Set(
  Object.values(INTENT_MAPPING).map(({ action, entity }) => `${action}:${entity}`),
);

/** Build the only business-intent payload permitted at the provider boundary. */
export function buildPrivateIntentEnvelopeV1(
  intent: PrivateMerchantIntent,
  source: PrivateIntentEnvelopeV1["source"],
  stage: PrivateIntentEnvelopeV1["stage"],
): PrivateIntentEnvelopeV1 {
  const mapping = INTENT_MAPPING[intent];
  if (!mapping || !isOneOf(source, SOURCES) || !isOneOf(stage, STAGES)) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }
  return Object.freeze({
    schema: "bridgetime.private-intent.v1",
    ...mapping,
    source,
    stage,
  });
}

/**
 * Runtime egress guard. It rebuilds the value from an exact allowlist, so an
 * accidental extra property cannot cross the provider boundary even when a
 * JavaScript caller bypasses TypeScript. Invalid enums fail closed.
 */
export function rebuildPrivateIntentEnvelopeV1(value: unknown): PrivateIntentEnvelopeV1 {
  if (
    !isRecord(value) || value.schema !== "bridgetime.private-intent.v1" ||
    !isOneOf(value.source, SOURCES) || !isOneOf(value.stage, STAGES) ||
    typeof value.action !== "string" || typeof value.entity !== "string" ||
    !ALLOWED_PAIRS.has(`${value.action}:${value.entity}`)
  ) {
    throw new PrivacyBoundaryError(["invalid_envelope"]);
  }

  return Object.freeze({
    schema: "bridgetime.private-intent.v1",
    action: value.action as PrivateIntentEnvelopeV1["action"],
    entity: value.entity as PrivateIntentEnvelopeV1["entity"],
    source: value.source,
    stage: value.stage,
  });
}

/** The canonical serialized payload. Never serialize the caller object directly. */
export function serializePrivateIntentEnvelopeV1(value: unknown): string {
  return JSON.stringify(rebuildPrivateIntentEnvelopeV1(value));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some((item) => item === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
