# Privacy limitations

## Precise claims

### Private Intent

The code demonstrates that `sendPrivateIntentEnvelope` rebuilds an outbound request containing only
fixed model/prompt/tool metadata and a five-field abstract enum. Extra runtime properties are
dropped; invalid enum values and invalid action/entity pairs block transport.

It does **not** send raw chat, names, merchant/service labels, internal IDs, counts, dates, times,
timezone, schedules, or conversation history through this API.

It still sends provider-visible metadata: the API account and network metadata plus an operation
class such as `create/staff`, its source category, and whether it is a request or preview. Do not
describe this as “nothing is sent to Kimi.” The accurate claim is “no merchant or personal data is
sent through the Private Intent payload.”

The adopter's server still receives and processes the original data. TLS, database permissions,
backups, logs, APM, support access, and incident response remain deployment responsibilities.

## Local interpretation tradeoff

Because Kimi cannot see raw language or business values, it cannot resolve a staff name, reason over
a schedule, or validate a service relationship. The adopter must parse input locally and use
structured forms or quick actions when confidence is low. The provider response must not select a
tenant, authorize a request, or supply values for a write.

## Pseudonymization mode is not anonymity

`S1`, `C1`, `P1`, and `E1` are reversible through a server-side alias table. The table may contain
raw names, phone numbers, email addresses, and internal IDs. It requires encryption, access control,
retention limits, and deletion in a real service.

The Pseudonymized Context rules do not reliably identify:

- a person absent from the supplied roster;
- addresses, social handles, order numbers, passports, or non-Taiwan identifiers;
- obfuscated or uncommon phone/email formats;
- sensitive facts without a distinctive identifier;
- a service or business label that embeds a person's name;
- combinations of dates, counts, schedules, and context that enable re-identification.

Aliased tool results may expose schedule ranges, dates, counts, status codes, and opaque tokens.
Prefer Private Intent whenever product behavior can be implemented locally.

## Production and provider boundaries

As of 2026-08-28, the private BridgeTime source includes Private Intent at commit
`68dbb144aa074a696842cbdea5e3205d8bdb05e9`. This does not prove a live deployment, runtime
configuration, provider agreement, logging policy, or surrounding infrastructure.

Provider-side retention, training, contract, data-location, account, and network-metadata questions
remain outside this code boundary. Review `PROVIDER_DUE_DILIGENCE.md` before activation.
