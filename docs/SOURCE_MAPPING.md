# Source mapping and divergence

## Current snapshot

Private Intent was prepared from the private BridgeTime repository at:

```text
215850f1469269c70bd58498272e219f5f8db45c
```

The earlier pseudonymization reference originated at:

```text
48f5e35659afc729828a20bd68130ac5cd1262ca
```

These hashes provide audit context. The private repository, application, data, and commit contents
are not granted or reproduced in full here.

## Mapping

| Public file                                  | Private source concept                                   | Relationship                                                                                      |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/private_intent.ts`                      | `lib/llm/private-assistant.ts`                           | Same five-field intent mapping and runtime allowlist reconstruction, isolated from product state  |
| `src/provider.ts::sendPrivateIntentEnvelope` | `consultPrivacySafeKimi` + pinned provider configuration | Fixed official endpoint, `kimi-k2.6`, disabled thinking, 128-token cap, and ignored provider body |
| `tests/private_intent_test.ts`               | private-assistant canary and route-regression tests      | Public offline wire-capture proof with no merchant fixtures or secrets                            |
| `src/normalize.ts`                           | `lib/line-parser.ts::normalize`                          | Relevant normalization behavior extracted without LINE parsing                                    |
| `src/alias.ts`                               | `lib/llm/alias.ts`                                       | Older production-derived alias behavior with additional runtime validation                        |
| `src/tools.ts`                               | `lib/llm/tools.ts`, `lib/llm/render.ts`                  | Read-only schema/result boundary; DB and tenant context omitted                                   |
| `src/envelope.ts`                            | older orchestration and request assembly                 | Explicit pseudonymized envelope plus fail-closed residual scan                                    |

## Deliberate public hardening

- Private Intent reconstructs a canonical object at runtime, so extra JavaScript properties cannot
  cross the provider boundary even if TypeScript is bypassed.
- Invalid or incompatible enum pairs fail before transport.
- The privacy-sensitive Kimi path cannot accept a configurable base URL, hostname, model, prompt,
  tool schema, token budget, or thinking mode.
- Capture tests inspect the exact outbound body and prove that injected canaries and API keys are
  absent.
- Provider response bodies and user/request excerpts are excluded from safe errors.
- The older Pseudonymized Context path retains HTTPS, exact-host, redirect, residual-shape, alias,
  and tool-schema guards for comparative use.

## Omitted on purpose

No database queries, authentication, tenant code, HTTP routes, product prompts, UI, generated
assets, deployment configuration, environment values, logs, customer fixtures, or provider secrets
are included.

“Production-derived” is not a byte-for-byte mirror and is not proof that a route is enabled in a
live deployment.
