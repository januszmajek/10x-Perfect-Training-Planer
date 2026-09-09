---
change_id: history-aware-ai-proposal
title: History-aware AI proposal
status: implemented
created: 2026-09-06
updated: 2026-09-09
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-07: User approved adapting Phase 2 manual verification to deterministic ranking fixtures because the
  browser-facing history-aware generation flow is intentionally deferred to Phase 3. Repeat these scenarios end-to-end
  during Phase 3 manual verification.
- 2026-09-07: Phase 3 adaptation approved by the user. The original feedback schema could record a `reroll` event but
  could not link it to the replacement proposal. A forward migration adds `rerolled_from_proposal_id` and an overloaded
  proposal-recording RPC that owner-validates the prior proposal, preserves its lineage, and records the re-roll
  atomically. This expands Phase 3 beyond its original application-only file list; applied migrations remain unchanged.
- 2026-09-07: Phase 3 manual testing exposed the stale browser eligibility gate retained from cold start. The user
  approved bringing forward only Phase 4's removal of `initialEligibility` from the new-workout page and builder. The
  authenticated generation POST is now authoritative; the Phase 4 confirmation dialog and feedback UI remain deferred.
- 2026-09-07: The user then approved bringing forward the minimal reduced-generation confirmation dialog because it is
  required to manually exercise Phase 3's server-authoritative 3–4 candidate handshake. The dialog only stores the
  browser-safe token/count, preserves the manual draft on cancel, and submits a second strict command on confirmation;
  preference and telemetry controls remain deferred to Phase 4.
- 2026-09-08: Phase 3 browser testing showed that the hard novelty quota could shrink a large recovery-safe pool below
  the generation minimum immediately after a workout. The user approved treating similarity and exploration limits as
  ranking preferences with recovery-safe backfill when needed. Recovery and Don't suggest remain hard constraints;
  candidate-count decisions use that hard-eligible pool, and expected availability decisions no longer log as errors.
- 2026-09-08: Pre-Phase-4 scope review compared Phase 1 (database contracts), Phase 2 (pure ranking), and Phase 3
  (generation plus review fixes). The final phase is broader than any prior single slice and contains a latent retention
  conflict: proposal events cascade with raw proposals, so they cannot record a completion after telemetry expiry.
  Split execution into lifecycle-data-contract, feedback-UI, and release-gate commits. Phase 3 already owns the stale
  eligibility-gate removal, reduced-workout dialog, and atomic re-roll provenance; do not reimplement them.
