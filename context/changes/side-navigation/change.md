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
