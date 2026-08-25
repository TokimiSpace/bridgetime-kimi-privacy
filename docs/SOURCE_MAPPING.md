# Source mapping and divergence

## Snapshot

This public reference was prepared from the private BridgeTime repository at commit:

```text
48f5e35659afc729828a20bd68130ac5cd1262ca
```

The mapping is disclosed for audit context. The private repository, full application, data, and
commit contents are not granted or reproduced here.

## Mapping

| Public file        | Private source concept                              | Relationship                                                                                            |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/normalize.ts` | `lib/line-parser.ts::normalize`                     | Same relevant normalization behavior, extracted without LINE parsing                                    |
| `src/alias.ts`     | `lib/llm/alias.ts`                                  | Production-derived alias types, ordering, matching, masking and restore; extra runtime validation added |
| `src/tools.ts`     | `lib/llm/tools.ts`, `lib/llm/render.ts`             | Schema/result boundary only; DB, tenant context, period execution and UI cards omitted                  |
| `src/envelope.ts`  | `lib/llm/orchestrate.ts`, provider request assembly | New explicit, reviewable envelope plus fail-closed residual scan                                        |
| `src/provider.ts`  | `lib/llm/provider.ts`                               | Minimal compatible transport, hardened endpoint and error policy                                        |

## Deliberate hardening differences

- The source snapshot accepts a configured base URL. This reference additionally requires HTTPS,
  port 443, and an exact host allowlist.
- The source snapshot can include a short provider response excerpt for some 4xx errors. This
  reference never includes response bodies in errors.
- The source snapshot's open-slot schema may expose active service names as ordinary business data.
  This reference uses opaque `V` service tokens.
- The source snapshot builds provider requests inside the provider/orchestration path. This
  reference makes `EgressEnvelopeV1` and its mandatory scan explicit.
- This reference validates alias tables, tool-result shapes, declared literals, common residual
  identifier shapes, and captures the exact outbound wire body in tests.

## Omitted on purpose

No database queries, tenant/authentication code, HTTP routes, prompts from the product, UI, mobile
code, generated assets, deployment configuration, environment values, logs, customer fixtures, or
provider secrets are included.

## Important interpretation

“Production-derived” means the aliasing design and relevant behavior were extracted from that
snapshot. “Hardened reference” means this repo also contains controls not present in the snapshot.
It is **not** a byte-for-byte mirror and **not** proof of current production deployment.
