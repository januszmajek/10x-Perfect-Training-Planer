# History-aware AI Proposal — Plan Brief

> Full plan: `context/changes/history-aware-ai-proposal/plan.md`
> Research: `context/changes/history-aware-ai-proposal/research.md`

## What & Why

Extend AI generation for users with completed history, balancing recovery, familiarity, explicit preferences, and
relevant variety. Application code owns eligibility; the LLM only prescribes from a vetted shortlist.

## Starting Point

Cold-start generation, BYOK, editable AI saves, completed history, and recovery projection work. History-bearing users
are rejected; completion profiles, preferences, telemetry, reduced confirmation, and AI tests in CI are missing.

## Desired End State

A history-bearing user can generate, edit, preference-tune, and save a private AI proposal. Normal proposals contain
5–7 ready exercises. Only when five ready exercises are unavailable may the server offer a confirmed 3–4 exercise
proposal; fewer than three falls back to manual planning without an AI call. Raw proposal events expire under the
90-day policy while durable Like and **Don't suggest** preferences remain until changed or account deletion.

## Key Decisions Made

| Decision                | Choice                                                                             | Why                                                              | Source          |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------- |
| Architecture            | Pure TypeScript ranker plus compact Supabase aggregate                             | Fits sparse data and the Worker without an ML service            | Research        |
| Recovery and size       | Hard recovery constraint; confirmed 3–4 only when five ready items are unavailable | Keeps the fallback exceptional and recovery-safe                 | Research / Plan |
| Unseen exploration      | “Never completed in this app”; adaptive maximum of two                             | Matches available evidence and becomes conservative with history | Research / Plan |
| Explicit feedback       | Like boosts; Don't suggest excludes                                                | Gives immediate, deterministic user control                      | Plan            |
| Telemetry and retention | Full lifecycle events expire within 90 days; preferences remain durable            | Supports later evaluation while limiting private data            | Plan            |
| Coverage and diversity  | Feasible ready-only coverage followed by MMR                                       | Balances movement variety with relevance                         | Research        |
| Re-roll variation       | Server-injected deterministic seed                                                 | Permits variation with reproducible tests                        | Plan            |
| Upstream lineage        | PRD v2 and roadmap v4 synchronized first                                           | Prevents silent scope drift                                      | Plan            |

## Scope

**In scope:**

- Private profiles/preferences/telemetry with lifecycle linkage and scheduled cleanup.
- Recovery-first ranking with exploration, coverage, MMR, and seeded variation.
- One mode-aware endpoint with reduced confirmation, private prompting, independent validation, and preference UI.

**Out of scope:**

- ML libraries, online learning, cross-user signals, recovery overrides, selectable smaller workouts, or new routes.

## Architecture / Approach

An authenticated generation request loads a compact owner profile, preferences, and canonical catalogue; filters
recovery/exclusions; ranks and diversifies a shortlist; then either returns a pre-provider decision or calls OpenRouter
with only that shortlist. Application validation checks the returned prescription before a private proposal identity is
recorded and returned to the existing editor. Preference and lifecycle APIs append constrained owner-scoped data, while
a Supabase Cron job removes expired raw proposal records without touching workouts or durable preferences.

## Phases at a Glance

| Phase                     | What it delivers                                                          | Key risk                                                 |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Private data contracts | Completion profile, preferences, telemetry, lifecycle linkage, cleanup    | RLS or expiry could leak/delete the wrong data           |
| 2. Recommendation engine  | Pure recovery-first ranking and candidate-count decisions                 | Weak signals could be represented too confidently        |
| 3. Generation handshake   | Mode-aware prompt/validation and confirmed reduced requests               | Stale confirmation could bypass the five-ready invariant |
| 4. UI and release gates   | Preference controls, lifecycle telemetry, CI, documentation, smoke checks | Telemetry must not regress editing or completion         |

**Prerequisites:** S-07 is complete; local Supabase and existing AI/recovery suites must be available.
**Estimated effort:** Approximately four implementation sessions, one phase per reviewed `/10x-implement` run.

## Open Risks & Assumptions

- Completion is weak familiarity; ranking weights are configurable defaults, not learned truth.
- Supabase Cron and proposal linkage must preserve retention, workout safety, and owner isolation.

## Success Criteria (Summary)

- Generated exercises pass canonical, recovery, preference, uniqueness, size, and coverage validation; cold start stays intact.
- Reduced 3–4 generation requires confirmation and fewer than five ready candidates; fewer than three makes no AI call.
- Private preferences/telemetry, 90-day expiry, database, CI, Worker, accessibility, and BYOK checks pass.
