<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Manual Workout Create and Save Implementation Plan

- **Plan**: `context/changes/manual-workout-create-and-save/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: SOUND
- **Initial verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 10/10 paths ✓, 5/5 symbols ✓, brief↔plan ✓. Progress contract valid: one bottom `## Progress`, three
matching phases, every success criterion represented, and no checkboxes outside Progress.

## Findings

### F1 — Replacement can delete a plan the user never confirmed

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Manual planned-workout mutation and concurrency tests
- **Detail**: A boolean-only replacement confirmation permits a stale second tab to atomically delete a newer plan
  that the user never reviewed. The plan also required per-user serialization without naming a lock primitive or its
  ordering relative to current completion and child-mutation row locks.
- **Fix A ⭐ Recommended**: Expected-plan compare-and-swap plus explicit locking.
  - Strength: Prevents unseen-plan deletion and defines one concurrency boundary for create and replacement.
  - Tradeoff: Changes the RPC, endpoint, client payload, confirmation flow, and concurrency tests.
  - Confidence: HIGH — the missing expected-state token directly permitted the race.
  - Blind spot: Future edit/complete RPCs must reuse the recorded lock namespace.
- **Decision**: FIXED — applied Fix A. The plan now requires nullable expected workout ID, a transaction advisory
  lock, parent `FOR UPDATE`, stale-plan rejection, summary refresh/reconfirmation, and RPC-vs-completion/child tests.

### F2 — Same-origin and bounded-body promises are underspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Protected async save endpoint
- **Detail**: The plan promised a bounded same-origin payload but defined no media type, concrete byte/item limit, or
  explicit Origin check. Astro's default origin middleware does not cover `application/json`.
- **Fix**: Define the JSON wire format, explicit Origin equality, 32 KiB body cap, 20-exercise cap, and exact field
  schema/limits.
- **Decision**: FIXED — the endpoint contract now rejects non-JSON, missing/mismatched Origin, oversized bodies,
  extra fields, more than 20 exercises, invalid UUIDs, sets outside 1–99, and reps outside 1–999.

### F3 — RPC and HTTP failure contracts are unnamed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phases 1–2 — RPC, service, and endpoint contracts
- **Detail**: The service had to distinguish validation, confirmation, stale state, authentication, and persistence
  failures, but the plan named no SQLSTATE/result, HTTP status, or public response schema.
- **Fix**: Define stable database outcomes and API codes, keep client/network failures separate, and add private
  sanitized request-ID logging.
- **Decision**: FIXED — the plan now defines custom RPC SQLSTATEs, exact HTTP/public-code mapping, a safe
  `{ code, requestId }` envelope, separate client/network states, and logs limited to request ID, layer, safe code,
  operation, and sanitized technical code.

## Result

All accepted fixes are incorporated into the full plan and plan brief. The revised plan is SOUND and ready for
phased implementation beginning with Phase 1.
