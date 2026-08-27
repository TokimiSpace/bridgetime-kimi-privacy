# Threat model

## Assets

- Merchant, staff, customer, and service names; contact details; internal entity IDs.
- Schedules, dates, times, counts, relationships, and conversation history.
- Alias tables used by the optional pseudonymization mode.
- Provider credentials, request/response bodies, and tenant boundaries.

## Trust boundaries

| Boundary               | Trusted for                                                                | Not trusted for                                                       |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Adopter server         | Authentication, local parsing, roster lookup, validation, previews, writes | Automatically having secure logs, backups, storage, or access control |
| Private Intent guard   | Fixed enum mapping, runtime rebuilding, invalid-value blocking             | Semantic parsing, tenant selection, authorization, or CRUD            |
| Pseudonymization guard | Replacing declared/known values and supported patterns                     | Detecting arbitrary personal or business information                  |
| Provider transport     | TLS delivery to a pinned allowlisted hostname                              | Retention, training policy, jurisdiction, or account metadata privacy |
| LLM output             | Optional generic UI-routing suggestion                                     | Business facts, authorization, IDs, date arithmetic, or writes        |

## Private Intent threats and controls

| Threat                                           | Control                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Raw message is concatenated into a prompt        | Public API accepts only `PrivateIntentEnvelopeV1`; fixed prompt is internal  |
| Extra property carries a name or merchant value  | Runtime guard creates a new five-field object and drops all extras           |
| Enum field is abused as free text                | Closed enum and action/entity-pair validation fail before transport          |
| Config redirects the key/body elsewhere          | Endpoint, host, model, prompt, tool, token cap, and thinking mode are pinned |
| Redirect forwards credentials or body            | Fetch uses `redirect: "error"`                                               |
| Model selects another tenant or performs a write | No tenant/value/write fields exist; output is deliberately ignored           |
| Provider error echoes request content            | Safe errors contain only fixed codes/status metadata                         |
| API key appears in offline evidence              | `CaptureTransport` intentionally drops authorization data                    |

## Pseudonymization-mode threats and controls

| Threat                            | Control                                              |
| --------------------------------- | ---------------------------------------------------- |
| Known identity leaves in a prompt | Per-conversation `S`/`C` alias replacement           |
| Supported phone/email leaves      | `P`/`E` replacement plus a second wire scan          |
| Alias map is serialized           | Separate type and capture tests                      |
| Model chooses another tenant      | No tenant/merchant tool argument                     |
| Model performs a write            | Fixed read-only tool allowlist; no executor included |
| Tool result leaks free text       | Runtime-constrained serializer                       |

## Residual and out-of-scope threats

- The provider sees account/network metadata and abstract Private Intent operation classes.
- The adopter's own server, database, logs, proxies, APM, backups, support tooling, or dependencies
  may expose the raw data independently of this package.
- Local parsing can misunderstand an instruction; a wrong intent should lead to a local form or
  preview, never an automatic write.
- Pseudonymized Context can leak unknown names, addresses, health details, uncommon identifiers,
  prompt injection, or identifying combinations of ordinary facts.
- Provider retention/training/subprocessors, endpoint compromise, DNS/CA compromise, consent, legal
  basis, incident response, and production monitoring are outside this repository.

Adopters must implement authentication, tenant isolation, one-shot confirmation, rate limiting,
body-free telemetry, secure secret storage, and legal/privacy review independently.
