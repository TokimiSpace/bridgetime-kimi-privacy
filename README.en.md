<div align="center">

# BridgeTime Kimi Privacy Envelope

**Alias, minimize, and inspect data before it reaches an external LLM.**

[繁體中文](README.md) · [English](README.en.md)

[![CI](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml/badge.svg)](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml)
[![Deno 2](https://img.shields.io/badge/runtime-Deno_2-111827?logo=deno&logoColor=white)](https://deno.com/)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-16A34A.svg)](LICENSE)

[BridgeTime](https://bridgetime.org/) ·
[TokimiSpace open-source hub](https://tokimispace.github.io/?lang=en) ·
[Tokimi](https://tokimi.space/en/open-source/)

</div>

> [!WARNING]
> **Fraud alert:** Gmail accounts claiming to be Tokimi are not official. Do not pay or share
> verification codes; verify only through [tokimi.space](https://tokimi.space/) or
> [ben@tokimi.space](mailto:ben@tokimi.space).

This offline-testable TypeScript reference implementation replaces **known names, supported Taiwan
phone formats, and emails** with aliases before calling Kimi or another OpenAI-compatible LLM. It
builds an `EgressEnvelopeV1` and runs a fail-closed scan immediately before egress.

> [!IMPORTANT]
> As of **2026-08-25**, the production assistant at `bridgetime.org` is **disabled**. This
> repository derives from private BridgeTime commit `48f5e35659afc729828a20bd68130ac5cd1262ca` and
> adds hardening. It is not proof of a production deployment and cannot detect every kind of
> personal data.

![BridgeTime Kimi Privacy Envelope flow](docs/assets/privacy-envelope-flow-en.svg)

## How it works

| Stage          | Action                                                                                                       | Data allowed to leave               |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Alias          | Convert known names, phones, and emails to `S1`, `C1`, `P1`, and `E1`                                        | Nothing                             |
| Build envelope | Normalize text; add a caller-supplied, length-bounded, scanned system prompt and three fixed read-only tools | Aliased messages and bounded fields |
| Scan egress    | Detect sensitive literals, identity/credential shapes, and long numbers                                      | Any residue blocks the request      |
| Transport      | Require HTTPS:443, exact hostname allowlist, and no redirects                                                | Validated wire body                 |

Raw input `林範例請聯絡陳測試，電話 0912-000-123` becomes `S1請聯絡C1,電話 P1`. The mapping stays
inside the adopter's server boundary.

This is reversible **pseudonymization**, not anonymization. The alias table is sensitive; production
systems still need encryption, access control, retention, and deletion.

## Evidence boundary

| Demonstrated reproducibly                                                                       | Not demonstrated                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Known roster names, supported phones/emails, and caller-declared values are replaced or blocked | Arbitrary free text contains no personal data                                         |
| Alias table and outbound envelope are separate; capture tests inspect the wire body             | `S1` and `C1` are anonymous                                                           |
| The model can request only `staff_on_shift`, `open_slots`, and `booking_stats`                  | The surrounding system has auth, tenant isolation, or consent                         |
| Tool schemas have no DB access or writes; result serializers reject free text                   | Tool results remain entirely local                                                    |
| URL, redirect, and error paths fail closed                                                      | Code can guarantee provider retention, training, cross-border, or subprocessor policy |

**Staff/service aliases, dates, time ranges, counts, and statuses from tool results may still be
sent to the model.** See [PRIVACY_LIMITATIONS.md](docs/PRIVACY_LIMITATIONS.md) and
[THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Verify in 30 seconds

Install [Deno 2](https://docs.deno.com/runtime/getting_started/installation/):

```bash
git clone https://github.com/TokimiSpace/bridgetime-kimi-privacy.git
cd bridgetime-kimi-privacy
deno task verify
deno task demo
```

`verify` runs formatting, type, and offline tests. `demo` uses synthetic data and
`CaptureTransport`; it makes no network request and prints no alias table, raw values, or API key.

## Minimal integration

```ts
import { buildAliasTable, buildReadOnlyToolSchemas, prepareEgressEnvelopeV1 } from "./src/mod.ts";

const aliasTable = buildAliasTable(
  [{ id: "staff-1", displayName: "林範例" }],
  [{ id: "customer-1", displayName: "陳測試" }],
);

const prepared = prepareEgressEnvelopeV1({
  model: "kimi-k2.6",
  systemPrompt: "Use opaque tokens.",
  rawUserText: "林範例請聯絡陳測試，電話 0912-000-123",
  aliasTable,
  tools: buildReadOnlyToolSchemas({ staffTokens: ["S1"], serviceTokens: ["V1"] }),
});
```

Keep the alias table only in trusted server-side state. Run tools inside the adopter's
authentication and tenant boundary, then append a bounded result with `appendAliasedToolRoundTrip`.
This repository deliberately has no database executor.

## Before production

Passing tests does not authorize real user data. At minimum, complete:

- provider review for retention, training, location, subprocessors, and deletion;
- privacy notice, lawful basis/consent, cross-border, and data-subject workflows;
- alias-table encryption, access control, TTL/deletion, and backup policy;
- authentication, tenant isolation, body-free logging, key rotation, and a kill switch.

Kimi policies may change. Recheck [PROVIDER_DUE_DILIGENCE.md](docs/PROVIDER_DUE_DILIGENCE.md) before
activation. This is not legal advice.

## Docs, security, and licence

`src/` contains alias, envelope, provider, and tool boundaries; `tests/` provides fail-closed and
wire-body evidence. Read [DATA_FLOW.md](docs/DATA_FLOW.md), [VERIFY.md](docs/VERIFY.md), and
[SOURCE_MAPPING.md](docs/SOURCE_MAPPING.md).

Use synthetic data for contributions and read [CONTRIBUTING.md](CONTRIBUTING.md). Report security
issues privately through [SECURITY.md](SECURITY.md).

Code and documentation use the [Apache License 2.0](LICENSE). BridgeTime and TokimiSpace names and
logos are excluded; see [TRADEMARKS.md](TRADEMARKS.md). Kimi and Moonshot AI are third-party names;
this repository does not imply affiliation, sponsorship, or certification.
