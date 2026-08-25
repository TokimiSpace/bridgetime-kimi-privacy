# Privacy limitations

## Precise claim

The code demonstrates that **known roster identities, supported Taiwan phone formats, email
addresses, and caller-declared sensitive literals are excluded from a tested outbound envelope or
cause the request to be blocked**.

It does not demonstrate that an arbitrary message contains no personal data.

## Pseudonymization, not anonymization

`S1`, `C1`, `P1`, and `E1` are reversible through a server-side alias table. The table may contain
raw names, phone numbers, email addresses, and internal IDs. It requires encryption, access control,
retention limits, and deletion in a real service. This repository intentionally supplies none of
those production storage concerns.

## Detection gaps

The rules do not reliably identify:

- a person absent from the supplied roster;
- street addresses, social handles, order numbers, passport numbers, or non-Taiwan identifiers;
- obfuscated or uncommon phone/email formats;
- sensitive facts without a distinctive identifier;
- a service or business label that itself embeds a person's name;
- combinations of dates, counts, schedules, and context that enable re-identification.

`declaredSensitiveLiterals` can make known exceptional values fail closed, but requires the caller
to know them. A false negative remains possible. A false positive may block a safe request; that is
an accepted tradeoff at this boundary.

## Tool-result reality

The LLM sees aliased tool results when a caller includes them in a second model turn. It can see
schedule ranges, dates, counts, status codes, and opaque tokens. Do not claim that “queries and
answers stay entirely local” when the model is used to turn those results into prose.

This reference improves on the source snapshot by using service tokens (`V1`) rather than raw
service names. That difference is documented in `SOURCE_MAPPING.md`.

## Production status

As of 2026-08-25, the production assistant at `bridgetime.org` is disabled. Passing these tests does
not prove which code, configuration, model, retention policy, or subprocessors a live site uses.
Before production activation, BridgeTime would need an updated privacy notice, provider/legal
review, operational controls, and deployment-specific verification.

Provider-side retention, training, contract and data-location questions remain outside this code
boundary. Review [`PROVIDER_DUE_DILIGENCE.md`](PROVIDER_DUE_DILIGENCE.md) before activation.
