<div align="center">

# BridgeTime Kimi Privacy Envelope

**Let Kimi assist with UI routing without seeing names, services, merchant data, or raw chat.**

[繁體中文](README.md) · [English](README.en.md)

[![CI](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml/badge.svg)](https://github.com/TokimiSpace/bridgetime-kimi-privacy/actions/workflows/ci.yml)
[![Deno 2](https://img.shields.io/badge/runtime-Deno_2-111827?logo=deno&logoColor=white)](https://deno.com/)
[![Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-16A34A.svg)](LICENSE)

[BridgeTime](https://bridgetime.org/) ·
[TokimiSpace open-source hub](https://tokimispace.github.io/?lang=en) ·
[Tokimi](https://tokimi.space/en/open-source/)

</div>

> [!WARNING]
> **Fraud alert:** Any `@gmail.com` address claiming to represent Tokimi is not an official Tokimi
> contact channel. Do not pay or share verification codes; verify only through
> [tokimi.space](https://tokimi.space/) or [ben@tokimi.space](mailto:ben@tokimi.space).

This is an offline-verifiable TypeScript privacy-boundary reference. `v0.2.0` provides two clearly
separated modes:

| Mode                             | What Kimi sees                                           | Suitable for                                                     | Privacy posture                |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| **Private Intent (recommended)** | A fixed five-field enum                                  | Staff/service CRUD, relationships, and schedule-form routing     | No business data sent          |
| Pseudonymized Context            | Aliased text, tokens, dates, time ranges, and aggregates | Experiments that require model-visible semantics or tool results | Re-identification risk remains |

> [!IMPORTANT]
> As of **2026-08-28**, BridgeTime source includes the Private Intent architecture at private commit
> `e0426d372ebafb9732ec139709c9ded002a1a9ff`. Live activation still depends on deployment
> configuration and `LLM_API_KEY`; this repository is not proof of production deployment or provider
> policy.

## Recommended: zero-business-data mode

Raw chat, names, merchant/service labels, internal IDs, counts, dates, times, timezone, and history
remain inside the adopter's server boundary. Natural-language interpretation, database queries,
authorization, previews, and writes also happen locally.

If an adopter exposes a keyword or exact-sentence cheat sheet beside chat input, bundle its verified
static text in the client. Opening the guide must not submit or fill a command, write data, or call
a provider, and examples should not become one-click execution controls. The guide should explicitly
tell users not to enter PINs, invitation credentials, customer names, phone numbers, or other
personal data.

Kimi receives only a fixed envelope such as:

```json
{
  "schema": "bridgetime.private-intent.v1",
  "action": "create",
  "entity": "staff",
  "source": "structured_form",
  "stage": "preview"
}
```

```mermaid
sequenceDiagram
  participant U as User
  participant S as Adopter server
  participant G as Runtime egress guard
  participant K as Kimi
  U->>S: Raw chat and business data
  S->>S: Local parsing, validation, queries, preview
  S->>G: Fixed enum intent
  G->>G: Rebuild allowlist; reject invalid enums
  G->>K: Five-field abstract intent
  K-->>S: Untrusted generic routing response
  S->>S: Ignore data-bearing output; authorize and write locally
```

### Minimal integration

```ts
import { buildPrivateIntentEnvelopeV1, sendPrivateIntentEnvelope } from "./src/mod.ts";

// Interpret raw text and real form values inside your own server first.
const envelope = buildPrivateIntentEnvelopeV1(
  "create_staff",
  "structured_form",
  "preview",
);

await sendPrivateIntentEnvelope({
  envelope,
  apiKey: Deno.env.get("LLM_API_KEY") ?? "",
});
```

`sendPrivateIntentEnvelope` rebuilds the object from a runtime allowlist. Extra fields are dropped;
invalid or incompatible enums fail closed before transport. The Kimi endpoint is pinned to
`https://api.moonshot.ai/v1`, the model to `kimi-k2.6`, thinking is disabled, replies are limited to
128 tokens, and redirects are rejected. Never let model output choose a tenant, authorize an action,
or perform a database write.

## Advanced: pseudonymized-context mode

If a product genuinely needs the model to read language or tool results, the existing
`EgressEnvelopeV1` replaces known names, supported Taiwan phone formats, and email addresses with
`S1`, `C1`, `P1`, and `E1`, then applies a fail-closed pre-egress scan.

![Pseudonymized-context flow](docs/assets/privacy-envelope-flow-en.svg)

This is reversible **pseudonymization**, not anonymization. Service tokens, dates, time ranges,
counts, and statuses may still reach the model and may combine into identifying context. Prefer
Private Intent whenever it can support the product flow.

## Evidence boundary

| Demonstrated reproducibly                                                                        | Not demonstrated                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Private Intent wire bodies contain only fixed prompts/schema/model settings and five enum fields | Kimi receives literally no metadata                                   |
| Runtime rebuilding drops extra fields and blocks invalid enums before transport                  | The surrounding system has auth, tenant isolation, or consent         |
| Official Kimi hostname, HTTPS:443, and redirect rejection are pinned                             | Provider retention, training, cross-border, or subprocessor behavior  |
| Pseudonymized Context replaces known names/supported formats and scans the real wire body        | Arbitrary free text is anonymous or contains no unknown personal data |
| Errors expose fixed codes rather than request/provider bodies                                    | Infrastructure, APM, proxies, or backups do not separately log data   |

See [PRIVACY_LIMITATIONS.md](docs/PRIVACY_LIMITATIONS.md) and
[THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Verify offline in 30 seconds

Install [Deno 2](https://docs.deno.com/runtime/getting_started/installation/):

```bash
git clone https://github.com/TokimiSpace/bridgetime-kimi-privacy.git
cd bridgetime-kimi-privacy
deno task verify
deno task demo
```

`verify` runs formatting, type checks, and all offline tests. Coverage includes recognizable
canaries, malicious extra fields, invalid enums, actual wire captures, endpoint allowlisting, and
body-free errors. `demo` uses synthetic values and `CaptureTransport`; it makes no network request
and does not retain API keys.

## Before production

Zero-business-data mode greatly reduces the provider boundary, but it does not replace system or
legal controls:

- authentication, tenant isolation, operation authorization, one-shot confirmation, and rate limits;
- TLS, database/backup access, body-free logging, secret rotation, and a kill switch;
- accurate privacy notices, lawful basis, cross-border, and data-subject workflows;
- provider review for retention, training, location, subprocessors, and deletion.

Kimi policies may change. Recheck [PROVIDER_DUE_DILIGENCE.md](docs/PROVIDER_DUE_DILIGENCE.md) before
activation. This is not legal advice.

## Docs, security, and licence

Read [DATA_FLOW.md](docs/DATA_FLOW.md), [VERIFY.md](docs/VERIFY.md),
[SOURCE_MAPPING.md](docs/SOURCE_MAPPING.md), and [CHANGELOG.md](CHANGELOG.md). Use synthetic data
for contributions and read [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately
through [SECURITY.md](SECURITY.md).

Code and documentation use the [Apache License 2.0](LICENSE). BridgeTime and TokimiSpace names and
logos are excluded; see [TRADEMARKS.md](TRADEMARKS.md). Kimi and Moonshot AI are third-party names;
this repository does not imply affiliation, sponsorship, or certification.
