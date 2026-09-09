# Phase 4 Implementation Review Follow-ups

- F1: FIXED — restored 44px controls for catalogue Add, Like, and Don't suggest actions.
- F2: RESOLVED — the existing change note documents the forward re-roll lineage migration.
- F3: FIXED — updated the migration registry through the Phase 4B migrations.
- F4: PENDING HUMAN ACTION — perform and record the human-only Worker smoke and retention inspection.
- F5: FIXED — corrected the cold-start smoke instruction about preference controls.

## Architecture and type review

- F1: FIXED — feedback controls now require an explicit feedback capability.
- F2: FIXED — preference-load failures withhold controls instead of treating data as neutral.
- F3: FIXED — generation metadata uses a narrow proposal-snapshot preference type.
- F4: FIXED — generation success serialization preserves its domain type.
