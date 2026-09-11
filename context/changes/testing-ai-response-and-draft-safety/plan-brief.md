# AI Response and Draft Safety — Plan Brief

> Full plan: `context/changes/testing-ai-response-and-draft-safety/plan.md`

## What & Why

This change adds targeted tests proving that unsafe AI workout responses cannot be shown or saved, and an AI failure
cannot destroy an editable workout draft. It implements Phase 3 of the frozen test rollout for AI response safety and
private, owner-scoped data handling.

## Starting Point

The application already validates provider output, rejects malformed API requests, and relies on RLS/RPC contracts for
private workout data. Existing database tests are strong, but tests do not yet compose raw provider content through the
production parser or observe a failed generation through the rendered `WorkoutBuilder`.

## Desired End State

Invalid provider output fails before a proposal reaches the browser or persistence. A failed generation leaves the
existing draft and active proposal intact, presents a safe retryable message, and allows editing or manual saving to
continue. Crafted AI requests return a generic failure without secrets or mutations, and database contracts continue to
prove cross-user attempts fail atomically.

## Key Decisions Made

| Decision                | Choice                      | Why                                                                     |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Route coverage          | Narrow generate/save checks | Proves request guards without a broad endpoint harness.                 |
| Two-user proof          | Keep pgTAP authoritative    | Existing RLS/RPC tests already prove rollback and no mutation directly. |
| Proposal oracle         | Independent fixtures        | Prevents tests from repeating a production validation bug.              |
| Draft recovery          | Preserve draft and proposal | Matches the PRD's retryable, no-lost-work AI behavior.                  |
| Browser coverage        | One Builder journey         | Exercises fetch, parsing, state, rendering, and save routing together.  |
| Provider timeout        | No new deadline             | The product intentionally avoids artificial generation limits.          |
| Streamed-body hardening | Deferred                    | Keep this test rollout focused on the current 32 KiB request contract.  |

## Scope

**In scope:**

- Contract/service tests for valid and unsafe provider proposals.
- Narrow generate/save request-guard and public-error checks.
- Preserved pgTAP ownership and rollback coverage.
- State and browser proof of draft preservation.
- The Phase 3 cookbook entry and existing CI-gate verification.

**Out of scope:**

- Real provider calls, test infrastructure changes, product validation changes, provider timeouts, and streamed-body
  memory hardening.

## Architecture / Approach

Node tests validate proposal semantics, provider/service composition, and the no-`Content-Length` actual-byte request
limit; pgTAP remains the database authorization authority; Playwright checks declared request guards and the visible
Builder recovery seam; existing aggregate commands carry the new tests into CI.

## Phases at a Glance

| Phase                | What it delivers                                                    | Key risk                                |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| 1. Proposal safety   | Independent invalid-output contracts and parser/service composition | Tests mirror production validation      |
| 2. API and ownership | Narrow request-boundary proof plus retained pgTAP guarantees        | Slow duplicate ownership testing        |
| 3. Draft recovery    | State and browser proof that failed generation retains work         | Internal handling passes while UI fails |
| 4. Regression gates  | Existing local/CI discovery and complete verification               | New tests are not run by CI             |

**Prerequisites:** Local Supabase, current pnpm dependencies, and Playwright Chromium used by the existing harness.
**Estimated effort:** ~2–3 sessions across four incremental phases.

## Open Risks & Assumptions

- Route checks use the established local browser harness; the no-`Content-Length` size branch uses a direct helper
  contract test rather than new raw-request tooling.
- The current 32 KiB limit rejects oversized semantic requests but does not address streamed allocation before rejection.
- Provider timeouts remain outside this rollout; failure-mapping coverage still protects user work.

## Success Criteria (Summary)

- Invalid provider output is rejected before display or save, while valid proposals satisfy independently stated rules.
- Generation failures preserve a visible, editable draft and safe manual-save behavior.
- Hostile AI requests and cross-user mutation attempts fail without secrets, data leakage, or partial persistence.
