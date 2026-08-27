# Verification guide

All checks use synthetic values. No provider credential, database, account, or network request is
needed.

## Reproduce the checks

```bash
deno task verify
deno task demo
```

`verify` checks formatting, TypeScript, and the full offline suite. `demo` runs both modes through
`CaptureTransport`; it makes no network request and does not retain an API key.

## Private Intent evidence

`tests/private_intent_test.ts` proves that:

- a generated envelope has exactly `schema`, `action`, `entity`, `source`, and `stage`;
- the returned object is frozen;
- injected names, contact-shaped canaries, raw-message fields, and merchant values are stripped by
  runtime reconstruction;
- invalid enums and mismatched action/entity pairs fail before transport;
- the captured wire body uses the pinned Kimi URL/model, disabled thinking, and 128-token cap;
- the API key is absent from the captured artifact.

Inspect the first object printed by `deno task demo`. Its user message is a serialized abstract
enum, not raw text or a business value.

## Pseudonymized Context evidence

- `tests/envelope_test.ts` checks raw canaries against serialized `EgressEnvelopeV1`, post-prepare
  mutation, residual patterns, and tool round trips.
- `tests/provider_test.ts` checks exact-host HTTPS, redirect rejection, captured wire bodies, and
  body-free provider errors.
- `tests/tools_test.ts` checks the fixed read-only allowlist, absence of `merchantId`, canonical
  arguments, and rejection of arbitrary free-text results.
- `tests/alias_test.ts` covers normalization, reversible aliasing, immutability, and malformed
  tables.

## Manual review

Review `src/private_intent.ts` and confirm no raw-text or business-value field exists. Then review
`sendPrivateIntentEnvelope` and confirm every provider-visible field is either a constant or the
canonical serializer output. Search for direct `JSON.stringify(input.envelope)` calls; none should
exist on the Private Intent path.

## What a green run means

A green run establishes the checked repository behavior. It does not attest to live deployment,
provider policy, authentication, surrounding logs, database isolation, or completeness of the older
pseudonymization detectors. See `PRIVACY_LIMITATIONS.md`.
