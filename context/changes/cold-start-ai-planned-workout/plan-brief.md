# Cold-Start AI Planned Workout — Plan Brief

> Full plan: `context/changes/cold-start-ai-planned-workout/plan.md`

## What & Why

Build roadmap slice S-07 so a user with no completed history can generate a balanced full-body workout through their
own OpenRouter key, edit or re-roll it, and save it as a planned workout. The experience proves the product's AI
speed-and-variety promise while keeping the established manual lifecycle available as the fallback.

## Starting Point

Encrypted OpenRouter credential storage, a canonical exercise catalogue, the full manual workout lifecycle, optimistic
replacement, and a reusable draft editor already exist. The catalogue does not yet classify exercises as push or pull;
provider calls, generated-output validation, cold-start eligibility, and an atomic AI-origin save path also do not exist.

## Desired End State

One explicit Generate action returns an editable 5–7 exercise full-body proposal within the 10-second target. The
proposal remains ephemeral until Save, re-roll failures preserve the last valid draft, and persistence records immutable
AI provenance. Users with completed history receive a clear S-08 handoff instead of an unsafe generic starter.

## Key Decisions Made

| Decision          | Choice                       | Why                                                                    |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Trigger           | Explicit Generate button     | Avoids surprise BYOK charges and makes loading/errors intentional.     |
| Model             | Fixed server configuration   | Keeps schema support, latency, and testing predictable.                |
| Starter shape     | 5–7 exercise full body       | Makes “balanced” measurable across lower body, push, pull, and core.   |
| Movement metadata | Curated in the database      | Prevents application or model inference of push/pull classification.   |
| Proposal lifetime | Ephemeral until Save         | Matches the PRD and avoids unwanted planned workouts.                  |
| Existing plan     | Explicit CAS replacement     | Prevents silent loss and follows the existing workout UX.              |
| History boundary  | Typed S-08 handoff           | Preserves one future-facing entry point without taking S-08's work.    |
| Failures          | Typed recovery actions       | Tells users whether to retry, configure a key, or use manual planning. |
| Verification      | Mocked application tests     | Avoids live provider CI and new database concurrency-test scope.       |
| AI origin         | AI-assisted route provenance | Keeps editing unrestricted without adding proposal attestation.        |

## Scope

**In scope:**

- Fixed-model OpenRouter structured-output client with a bounded deadline.
- Database-owned push/pull classification for seeded exercises.
- Strict canonical proposal validation and balanced full-body enforcement.
- Lifetime-history cold-start eligibility checked on every generation.
- Explicit generation and re-roll using ephemeral proposal state.
- Shared draft editor for add, replace, remove, order, sets, and reps changes.
- Atomic AI-origin first save and confirmed replacement.
- Typed key, provider, timeout, output, and S-08 handoff states.
- Mobile and desktop verification plus a manual disposable-key Worker smoke test.

**Out of scope:**

- History-aware or recovery-aware AI recommendations (S-08).
- User-selected providers/models, streaming, automatic retries, or persisted proposal drafts.
- New exercises, custom exercise generation, weights, RIR, or volume-aware programming.
- Live provider calls in CI and new database concurrency tests.

## Architecture / Approach

The browser sends an empty versioned generation command to an authenticated same-origin API. The server verifies true
cold-start eligibility, decrypts the owner's key, loads the canonical catalogue, and calls a fixed OpenRouter model with
a strict schema. Catalogue serialization has a hard 64 KiB input ceiling. A separate validator uses database-owned
movement metadata to enforce catalogue membership and balanced coverage before the proposal reaches the shared editor.
Save uses a dedicated AI-origin database function with the existing advisory-lock and optimistic replacement protocol;
`origin = 'ai'` means saved through the AI-assisted route, not immutable proof of model authorship.

## Phases at a Glance

| Phase                   | What it delivers                                     | Key risk                               |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- |
| 1. Generation contracts | Fixed config, prompt, strict parser, provider client | Model/schema compatibility             |
| 2. Generation API       | Eligibility, orchestration, safe typed responses     | History users receiving a starter      |
| 3. AI persistence       | Atomic AI-origin save and replacement                | Diverging from manual lock semantics   |
| 4. Planning UI          | Generate, re-roll, edit, save, and recovery actions  | Losing proposal state on failure       |
| 5. Final verification   | Worker smoke test and documented S-08 seam           | Provider behavior differing in runtime |

**Prerequisites:** Working Supabase environment, `AI_KEY_ENCRYPTION_KEY_V1`, a configured fixed OpenRouter model, and a
disposable user-owned OpenRouter key for manual verification.

**Estimated effort:** Approximately 4–6 focused sessions across five independently verified phases.

## Open Risks & Assumptions

- The selected OpenRouter model must continue supporting strict JSON-schema output within the latency target.
- Catalogue size is bounded at 200 today; generation fails safely rather than truncating if deterministic serialized
  context exceeds 64 KiB.
- The selected test boundary does not add database concurrency coverage for the new AI save function; correctness relies
  on faithfully mirroring the established lock and replacement contract plus existing database regression tests.
- A history-bearing user will not receive AI output until S-08, even though the shared button and endpoint are designed
  for later extension.
- AI-origin analytics measure use of the AI-assisted save route and cannot prove how much of an edited workout came from
  the model.

## Success Criteria (Summary)

- An eligible user generates, edits, re-rolls, and saves a balanced AI-origin plan within the 10-second target.
- Missing/invalid keys and provider failures are safe, actionable, and preserve the last valid proposal.
- Users with completed history never receive a cold-start result, and credentials never reach browser data, logs, or
  persisted workout rows.
