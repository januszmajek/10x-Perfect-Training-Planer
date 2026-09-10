# Responsive Sidebar, Account, and Signup — Plan Brief

> Full plan: `context/changes/side-navigation/plan.md`

## What & Why

Replace the authenticated horizontal header with a responsive sidebar system that preserves workout-builder space and uses the existing mobile drawer. The same change removes email confirmation, resets existing users by explicit operator action, and hardens OpenRouter-key handling so no saved key characters are retained or exposed.

## Starting Point

The private Astro layout currently owns a horizontal header and the mobile drawer; the drawer already has the accessibility/lifecycle behavior this change must retain. Signup always routes to an inbox-confirmation page, and the encrypted-key schema/UI still stores and renders first/last key characters.

## Desired End State

Desktop users see a full sidebar on wide, non-Workout pages and an icon-only rail for Workout pages or constrained desktop widths. Mobile retains the existing drawer. Account is a generic avatar-plus-label link to `/account`, where Sign out lives; no account menu, navigation email address, or sidebar sign-out remains.

Email/password signup creates an immediate session and lands at Dashboard with an account-created toast. OpenRouter keys are live-validated server-side before storage, while Account displays only configuration state and update time.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Desktop layout | 16rem full sidebar; compact rail for Workout and constrained desktop | Protects builder room without making mobile a rail. | Plan |
| Compact navigation | Icons with hover/focus tooltips | Keeps the rail discoverable and accessible. | User |
| Account footer | Generic avatar + “Account” link; Sign out on Account page | Removes menu complexity and email from navigation. | User |
| Signup | Disable confirmation; session goes straight to Dashboard | Removes the inbox activation journey. | User |
| Account-created email | No notification email | Avoids adding transactional-mail infrastructure. | User |
| Key validation | Live server-side OpenRouter current-key request | Provider can directly validate submitted credentials. | Research / User |
| Validation failures | Reject and preserve existing key | A saved key is always provider-validated. | User |
| Key privacy | Drop prefix/hint columns; show only state/update time | No key-derived plaintext remains available. | User |
| User reset | Delete all Auth users and cascade application data | Produces the requested clean local/hosted environments. | User |
| Verification | Lint and build only; no new/manual tests | Matches the requested scope and repository gates. | User |

## Scope

**In scope:**

- Full sidebar, desktop compact rail, and adapted existing mobile drawer.
- Generic Account link/footer and Account-page sign-out.
- Immediate-session signup/Dashboard toast and confirmation-route removal.
- Forward removal of key metadata, live OpenRouter validation, and metadata-free Account UI.
- Local/hosted Auth-user reset runbook and requested remote operation.

**Out of scope:**

- Account menu, navigation email display, confirmation callback, account-created email, extra navigation features, saved-key reveal, tests/E2E tooling, and automated remote deletion.

## Architecture / Approach

The private layout renders all desktop variants using the current pathname; CSS selects full versus compact presentation, while the existing React drawer remains mobile-only. Key validation stays server-side and checks OpenRouter's current-key endpoint without reading its response body; encryption/upsert follows only after success. A forward migration deletes secret-adjacent columns, and a privileged operator—not application code—performs the user wipe.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Remove Confirmation and Secret-Derived Persistence | Confirmation removal, schema cleanup, reset runbook | Permanent hosted-user deletion targets the wrong project |
| 2. Auto-Session Signup and Validated Key Lifecycle | Dashboard signup toast and fail-closed live key saves | Provider outage blocks key replacement |
| 3. Responsive Sidebar and Drawer Adaptation | Full sidebar, compact rail, Account links | Accidentally replacing mobile-drawer lifecycle |
| 4. Configuration and Handoff Cleanup | Stale-reference removal and build gates | Obsolete key metadata remains in a source surface |

**Prerequisites:** A confirmed hosted Supabase project, dashboard/Admin access for the user wipe, and an OpenRouter network path available to the Worker.  
**Estimated effort:** ~3 implementation sessions across four phases.

## Open Risks & Assumptions

- Hosted Auth email confirmations must be disabled before release; local configuration alone does not change it.
- OpenRouter downtime intentionally prevents a new/replacement save and leaves an old encrypted key unchanged.
- User deletion invalidates refresh sessions but already-issued JWTs can remain valid until expiry.
- The destructive remote operation requires confirmed-project review; this plan does not execute it.

## Success Criteria (Summary)

- Private desktop/mobile routes use the specified sidebar information architecture with a mobile drawer that retains its existing lifecycle behavior.
- Signup lands auto-confirmed users on Dashboard; confirmation routes/content are gone.
- Saved key material is absent from schema metadata, browser output, ARIA, and logs; only successfully live-validated keys are encrypted and persisted.

