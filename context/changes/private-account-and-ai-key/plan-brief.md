# Private Account and AI Key — Plan Brief

> Full plan: `context/changes/private-account-and-ai-key/plan.md`

## What & Why

Deliver the first private planner workspace and one OpenRouter key per user. Encrypt it before Supabase persistence,
show only a four-character suffix after saving, and never expose it to another user, URLs, or logs.

## Starting Point

Supabase auth, SSR sessions, a protected placeholder dashboard, typed access, RLS tests, and CI gates already exist.
There is no account page, workspace shell, credential table, encryption secret, crypto service, or AI-key UI.

## Desired End State

Sign-in enters a responsive workspace with Dashboard and Account navigation. `/account` supports masked add,
atomic replace, and confirmed removal; Supabase holds only owner-isolated ciphertext and non-secret metadata.

## Key Decisions Made

| Decision         | Choice                                           | Why                                                                            |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Provider         | OpenRouter only                                  | Keeps the first AI path flexible across models without multi-provider settings |
| Save validation  | Structural only; live validation in S-02         | Preserves roadmap boundaries and avoids network behavior here                  |
| Settings surface | Dedicated protected `/account` page              | Establishes a durable home for account settings                                |
| Masking          | Never reveal; display final four characters      | Plaintext never returns to the browser after save                              |
| Replacement      | Validate/encrypt, then one atomic upsert         | Failures cannot destroy the working credential                                 |
| Removal          | Inline Confirm/Cancel                            | Prevents accidents without adding dialog infrastructure                        |
| Account scope    | Key settings plus minimal workspace navigation   | Avoids password/profile/account-management expansion                           |
| Verification     | pgTAP, built-in Node crypto tests, CI/manual UI  | Covers the stored-data contract without a third-party runner                   |
| Encryption       | Per-user HKDF-derived AES-256-GCM with fresh IV  | Provides authenticated encryption and swap resistance in Workers               |
| Supabase access  | Publishable/anon key plus user session and RLS   | Reuses the current trust boundary without privileged app credentials           |
| Persistence      | Direct RLS-safe upsert; provider stays immutable | Keeps replacement atomic through the existing Data API                         |

## Scope

**In scope:**

- OpenRouter credential migration, constraints, least-privilege grants, owner RLS, and pgTAP coverage.
- Exact versioned Worker crypto format, server-only encryption/decryption service, and built-in Node contract tests.
- Authenticated save/atomic-replace/remove endpoints with bounded, non-sensitive errors.
- Request-local Supabase reuse, shared key validation, private workspace shell, `/account`, and masked lifecycle UI.
- Generated types, contract documentation, existing CI gates, and manual security checks.

**Out of scope:**

- OpenRouter calls or live validation, model selection, and AI workout generation.
- Multiple providers, plaintext reveal, credential history, or master-key rotation execution.
- Password/email/account management, broad dashboard work, third-party test runners, remote migrations, and deployment.

## Architecture / Approach

Same-origin forms send the key to authenticated Astro endpoints using middleware's request-local Supabase client.
A Worker decodes an unpadded-base64url V1 root secret, applies the plan's exact HKDF/AES-GCM byte contract, verifies
the round-trip, and directly upserts one owner row under RLS while omitting immutable `provider`. The account page
uses the credential service and selects only mask metadata; browser and server share one safe validation module.

## Phases at a Glance

| Phase                                       | What it delivers                                        | Key risk                                           |
| ------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| 1. Encrypted Credential Data Contract       | Schema, RLS/grants, pgTAP, types, registry              | A policy or privilege exposes another user's row   |
| 2. Server-Only Credential Lifecycle         | Web Crypto, atomic persistence, authenticated endpoints | Misconfiguration or logging leaks key material     |
| 3. Private Workspace and Account Experience | Protected shell, `/account`, masked lifecycle UI        | Mobile/auth state becomes fragmented or misleading |

**Prerequisites:** F-01, Supabase/Docker, Node 22.14, pnpm 10.24, disposable 32-byte secret. **Effort:** ~3 sessions.

## Open Risks & Assumptions

- Node and Workers must share the Web Crypto byte contract; Node tests, Worker build, and a smoke check guard parity.
- Losing the V1 root secret makes stored keys unrecoverable; backup and future rotation are operational duties.
- Structural validation may accept an invalid key; S-02 owns live validation and provider failures.
- RLS protects rows between users; authenticated encryption protects confidentiality if ciphertext is exposed.

## Success Criteria (Summary)

- Signed-in users complete the masked key lifecycle in a protected workspace at 360px or desktop width.
- Database constraints, grants, and RLS tests prove one encrypted row per user and deny anonymous/cross-user access.
- Plaintext never persists; replacement is safe; crypto tests reject tampering/bad context; all gates pass offline.
