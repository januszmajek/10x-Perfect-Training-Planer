---
change_id: side-navigation
title: Side navigation
status: implementing
created: 2026-09-10
updated: 2026-09-10
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-09-10: Credential validation adaptation

OpenRouter's current-key endpoint rejected an existing working inference key in the running app. The user approved an
alternative validation boundary: before encryption or persistence, send a fixed-model OpenRouter completion capped at
one output token, inspect only the HTTP outcome, and discard its body. This can consume a small amount of the user's
credit, but it verifies the capability the product actually requires. Invalid, timeout, rate-limit, network, and
provider failures remain fail-closed and preserve any existing credential. No key, key-derived metadata, or provider
response body is logged, rendered, or stored.

### 2026-09-10: Local migration applied

Applied `20260910130000_remove_ai_provider_key_metadata.sql` to the local Supabase database with `supabase migration
up --local`. This forward-only migration removes the obsolete required metadata columns while preserving local Auth and
application rows, allowing the new metadata-free credential upsert to persist successfully.

### 2026-09-10: Navigation and account refinement

Added Astro's shared client router so ordinary internal navigation swaps pages without a browser document reload. The
existing `pageshow` reload remains unchanged and still applies only to browser back/forward-cache restoration. The
mobile drawer's portal now uses React's server snapshot mechanism so its browser-only target mounts after hydration
without a mismatch during client-side route swaps. Both desktop sidebar variants now stay viewport-height and
non-scrolling, the compact mark reads `PTP`, and the full mark is smaller. Account settings now hide the key entry form
after configuration (remove the saved key before adding another) and align Sign out with its card's right edge on wider
screens. Paired section eyebrows were removed; their surviving headings use the same `text-purple-300` color.
