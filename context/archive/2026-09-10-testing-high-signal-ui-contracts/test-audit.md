# Focused Test-Signal Audit

## Scope and criterion

This audit covers only the Node suites named in the Phase 1 plan. It evaluates Risk #3: a regression must fail for a
business-visible reason, using an oracle independent of the implementation under test. The existing suites remain
valuable domain contracts; the rendered suite introduced by this change fills their deliberately separate UI gap.

## `src/lib/manual-workout-builder.test.ts`

### Independently proves

- `filterCatalogue` applies trimmed, case-insensitive search; requires all selected muscle/equipment filters; and
  considers primary and secondary muscle tags.
- `orderRecoveryAwareCatalogue` preserves the expected ready-first ordering after filtering.
- Draft construction, duplicate prevention, removal, movement, replacement, dirty comparison, numeric bounds, and
  strict request parsing protect the manual-workout domain contract.

### Cannot prove as rendered behavior

- A filter's displayed search value and selected controls reflect controlled input, or visible interactions invoke the
  declared callbacks with the intended values.
- Catalogue cards expose Add, Added, Replace, or Current actions and pending/disabled states that a user can observe.
- Recovery grouping, result counts, recovery duration copy, and no-match output map those domain results to a useful
  rendered catalogue surface.

### Retained assertions and rendered replacement

All existing assertions remain. Phase 2 adds fixture-backed contracts for controlled filters, cards, panel grouping,
selection, preference feedback, recovery output, counts, and empty states. Those tests will declare visible expected
outcomes rather than derive them by calling `filterCatalogue` or `orderRecoveryAwareCatalogue`.

## `src/lib/workout-history-client.test.ts`

### Independently proves

- Date presets and local-day boundaries, including DST behavior, produce the intended request filters.
- History filter URL parsing/serialization, muscle/equipment canonicalization, opaque cursors, order comparisons,
client-side filtering, response validation, page merging, and latest-request generation rules preserve the History
client contract.

### Cannot prove as rendered behavior

- A completed History card visibly presents its origin, exercise count, and muscle summary.
- The Show details and Hide details controls reveal and remove the complete saved prescription in the rendered card.
- Exercise order, sets/reps, and primary/secondary muscle roles survive the mapping from supplied history data to UI.

### Retained assertions and rendered replacement

All existing assertions remain. Phase 3 adds a deterministic initial-data History-card contract that exercises only
summary/detail rendering. It will not mock request replacement, debouncing, pagination, URL changes, observers, or
responsive behavior; those lifecycle concerns stay in later browser work.

## Baseline conclusion

The Node suites are independent, high-signal protection for domain and client transformations. The new UI suite is not
a replacement for them: it adds the missing observable-contract layer where controls, callbacks, and complete saved
content meet the user.
