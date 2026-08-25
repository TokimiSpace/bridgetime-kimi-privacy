export type PrivacyErrorCode =
  | "invalid_alias_table"
  | "invalid_envelope"
  | "residual_sensitive_value"
  | "residual_email"
  | "residual_phone"
  | "residual_national_id"
  | "residual_long_number"
  | "credential_shape";

/** Error text is intentionally constant and contains no input excerpt. */
export class PrivacyBoundaryError extends Error {
  readonly code = "egress_blocked";
  readonly findings: readonly PrivacyErrorCode[];

  constructor(findings: readonly PrivacyErrorCode[]) {
    super("Outbound request blocked by privacy policy");
    this.name = "PrivacyBoundaryError";
    this.findings = [...new Set(findings)];
  }
}

export type ProviderErrorCode =
  | "invalid_endpoint"
  | "host_not_allowed"
  | "missing_api_key"
  | "network"
  | "auth"
  | "rate_limit"
  | "provider"
  | "invalid_response";

const PROVIDER_MESSAGES: Record<ProviderErrorCode, string> = {
  invalid_endpoint: "Provider endpoint configuration is invalid",
  host_not_allowed: "Provider host is not allowlisted",
  missing_api_key: "Provider API key is not configured",
  network: "Provider network request failed",
  auth: "Provider authentication failed",
  rate_limit: "Provider rate limit reached",
  provider: "Provider request failed",
  invalid_response: "Provider response was invalid",
};

/** Never construct this error with provider or user-controlled text. */
export class SafeProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;

  constructor(code: ProviderErrorCode, status?: number) {
    super(PROVIDER_MESSAGES[code]);
    this.name = "SafeProviderError";
    this.code = code;
    this.status = status;
  }
}

export interface SafeErrorMetadata {
  name: string;
  code: string;
  status?: number;
}

/** A log-safe projection that deliberately omits message, cause, body and stack. */
export function safeErrorMetadata(error: unknown): SafeErrorMetadata {
  if (error instanceof SafeProviderError) {
    return { name: error.name, code: error.code, status: error.status };
  }
  if (error instanceof PrivacyBoundaryError) {
    return { name: error.name, code: error.code };
  }
  return { name: "Error", code: "unexpected" };
}
