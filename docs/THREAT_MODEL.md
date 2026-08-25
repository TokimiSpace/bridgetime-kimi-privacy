# Threat model

## Assets

- Merchant and customer names, phone numbers, email addresses, internal entity IDs.
- Alias tables, because aliases are reversible inside a conversation.
- Provider credentials and provider request/response bodies.
- Tenant boundaries and appointment/business data owned by a merchant.

## Trust boundaries

| Boundary           | Trusted for                                                      | Not trusted for                                             |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Application server | Authentication, roster lookup, alias state, local tool execution | Assuming every free-text identifier is detectable           |
| Egress guard       | Blocking declared literals and supported detectable shapes       | Semantic PII detection or true anonymization                |
| Provider transport | TLS delivery to an allowlisted hostname                          | Data ownership, retention, training policy, or jurisdiction |
| LLM output         | Suggested language and tool calls                                | Authorization, tenant selection, date arithmetic, or writes |

## In-scope threats and controls

| Threat                                          | Control in this repo                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Known identity leaves in prompt                 | Per-conversation `S`/`C` alias replacement                       |
| Supported phone/email leaves in prompt          | `P`/`E` pattern replacement plus second scan                     |
| Alias map accidentally serialized               | Separate types; envelope has no alias-table field; capture tests |
| Model chooses another tenant                    | No tenant/merchant argument in tool schemas                      |
| Model performs a write                          | Fixed allowlist of three read-only tools; no executor included   |
| Tool result leaks a name or ID                  | Runtime-constrained aliased serializer                           |
| Endpoint is changed to HTTP or a lookalike host | HTTPS, port and exact-host validation                            |
| Error handling reflects request/provider body   | Fixed error messages and metadata-only projection                |
| API key appears in offline captures             | Capture transport intentionally drops credentials                |

## Residual and out-of-scope threats

- Unknown names, addresses, health details, relationship facts, rare phone formats, prompt
  injection, inference from scheduling patterns, and identifying combinations of otherwise ordinary
  facts.
- Provider retention/training/subprocessor policy, TLS endpoint compromise, DNS/CA compromise,
  infrastructure logging outside this package, server compromise, and alias-table storage policy.
- Authentication, authorization, database tenant isolation, rate limiting, consent, data-subject
  rights, privacy notices, production monitoring, and incident response.

An adopter must implement those controls independently and complete a legal/privacy review before
enabling an external model.
