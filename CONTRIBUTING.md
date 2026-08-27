# Contributing

Thank you for helping make the privacy boundary easier to inspect.

1. Use synthetic data only. Never add real names, phone numbers, email addresses, IDs, prompts,
   logs, screenshots, provider responses, or credentials.
2. Keep this package independent from BridgeTime's database, authentication, UI, mobile apps, and
   private infrastructure.
3. Treat privacy checks as a boundary. Private Intent fields and action/entity pairs are closed;
   changing them requires an explicit threat-model update and exact wire-capture tests.
4. Preserve fixed, read-only Pseudonymized Context tools. New tools must not accept a tenant or
   merchant identifier from the model.
5. Do not weaken HTTPS, exact-host allowlisting, fail-closed behavior, or safe errors for
   convenience.

Before opening a pull request, run:

```bash
deno task verify
deno task demo
```

Explain the privacy effect of the change, tests added, and any residual risk. By contributing, you
agree that your contribution is licensed under Apache-2.0.
