# Security policy

## Supported version

Security fixes are applied to the latest commit on `main` while this reference project is in the
`0.x` series.

## Private reporting

Please do **not** publish a vulnerability, live endpoint detail, credential, personal data, or a
bypass payload in a public issue. Use GitHub's private vulnerability reporting for this repository.
If that channel is unavailable, use the security contact published by TokimiSpace on
<https://tokimi.space/>.

Include the affected commit, a minimal synthetic reproduction, impact, and a suggested mitigation.
Never test against `bridgetime.org`, real accounts, or real user data without explicit written
authorization.

## Scope note

This repository contains no production credentials, database integration, authentication layer, or
deployment configuration. A vulnerability here may still matter to adopters, but a report does not
establish that the same code path is deployed by BridgeTime.
