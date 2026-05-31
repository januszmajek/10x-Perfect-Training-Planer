---
bootstrapped_at: 2026-05-31T21:53:07Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: perfect-training-planner
language_family: js
package_manager: pnpm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "pnpm audit --json"
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: pnpm
project_name: perfect-training-planner
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

### Why this stack

10x Astro Starter (Astro 6 + React 19 + Supabase + Cloudflare) extended with shadcn fits Perfect Training Planner because: the PRD demands auth + database (Supabase ships both out of the box), the BYOK AI proposer is a straightforward server-side HTTP call from an Astro API route, the 3-week after-hours timeline favors a batteries-included starter over assembling pieces, and the solo builder profile benefits from the starter's opinionated TypeScript-first conventions that keep an AI coding agent on-rails. Cloudflare Pages deployment is free-tier friendly for a small-scale MVP and edge-fast for the mobile-viewport users planning workouts on their phones.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | `cmd_template` starts with `git clone`; no `create-*` npm package to verify |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-05-17T10:33:39Z | fresh | from card.docs_url |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && pnpm install`
**Retry note**: an existing `.bootstrap-scaffold/` from the prior failed run was reused; `pnpm approve-builds --all && pnpm install` completed successfully before the move-up.
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 30673
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted
**Post-move sanity**: `pnpm install --frozen-lockfile`, `pnpm rebuild`, and `pnpm run build` completed successfully from cwd.
**Dependency remediation**: removed the stray `package-lock.json`, kept PNPM as the package-manager source of truth, and added PNPM overrides in `pnpm-workspace.yaml` for `vite: ^7.3.2` and `yaml: ^2.9.0`.

## Post-scaffold audit

**Tool**: `pnpm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: no active advisories
**Exit code**: 0
**Resolution note**: the original `npm audit` output was based on the generated npm lockfile, while this project was scaffolded and installed with PNPM. After removing `package-lock.json` and applying PNPM overrides, `pnpm audit --audit-level moderate` reports no known vulnerabilities.

### Resolved dependency graph

| Package | Resolved version | Reason |
| --- | --- | --- |
| `vite` | `7.3.3` | Preserved starter override in PNPM's active configuration |
| `yaml` | `2.9.0` | Forced patched transitive version for `yaml-language-server` path |

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

None.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified.

Useful manual steps in the meantime:
- `git init` is not needed here because this directory already has a `.git/` directory.
- Keep using `pnpm install` and `pnpm audit`; do not regenerate `package-lock.json`.
- Review the starter-provided `CLAUDE.md` against the existing `AGENTS.md` before relying on either as agent context.
