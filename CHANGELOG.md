# Changelog

## 0.2.0 — 2026-08-27

- Add the recommended `PrivateIntentEnvelopeV1` zero-business-data mode.
- Add runtime allowlist reconstruction that strips extra properties and blocks invalid enum pairs.
- Add a pinned Kimi transport using `kimi-k2.6`, disabled thinking, and a 128-token cap.
- Ignore provider response content on the Private Intent path so it cannot authorize or populate a
  write.
- Add offline canary, mutation, pre-transport blocking, and exact wire-capture tests.
- Reframe the original alias envelope as an advanced pseudonymized-context mode with explicit
  re-identification limits.
- Update bilingual documentation, data flow, threat model, verification, and source mapping.

## 0.1.0 — 2026-08-25

- Initial hardened pseudonymization envelope, read-only tools, provider allowlist, capture
  transport, and offline verification suite.
