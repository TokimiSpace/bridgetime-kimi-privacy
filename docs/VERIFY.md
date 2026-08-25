# Verification guide

All checks use synthetic values. No provider credential, database, account, or network request is
needed.

## Reproduce the checks

With Deno 2 installed:

```bash
deno task verify
```

This runs formatting verification, TypeScript checking, and the complete offline test suite.

Then inspect the exact provider wire body:

```bash
deno task demo
```

The demo uses `CaptureTransport`. Confirm that the output contains alias tokens (`S1`, `C1`, `P1`,
`E1`) and does not contain the synthetic raw values present in `examples/synthetic_demo.ts`. The
capture object has no API-key or authorization field.

## Most important tests

- `tests/envelope_test.ts`: explicitly iterates over every synthetic raw sensitive value and asserts
  that none occurs in serialized `EgressEnvelopeV1`.
- `tests/provider_test.ts`: inspects the actual wire body given to transport, tests exact host
  validation, verifies a correctly paired assistant `tool_calls` + local `tool` result round trip,
  confirms that captures omit the key, and proves error text cannot echo a provider body.
- `tests/tools_test.ts`: checks the fixed read-only allowlist, absence of `merchantId`, and
  rejection of arbitrary tool arguments, error codes, statuses, and free text in aliased results.
- `tests/alias_test.ts`: covers normalization, pseudonymization, round-trip restoration,
  immutability, and malformed tables.

## Manual adversarial checks

Add a synthetic unsupported identifier to `declaredSensitiveLiterals`; the build must throw
`PrivacyBoundaryError` before transport. Mutate a prepared envelope by inserting an email, Taiwan
ID-shaped value, phone number, long digit run, or credential-shaped string; `sendEgressEnvelope`
must block it on the second wire-level scan.

## What a green run means

A green run establishes the behavior of this repository at the checked commit. It does not attest to
a live BridgeTime deployment, provider policy, surrounding server logs, or completeness of PII
detection. See `PRIVACY_LIMITATIONS.md`.
