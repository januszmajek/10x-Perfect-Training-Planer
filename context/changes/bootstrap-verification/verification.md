---
bootstrapped_at: 2026-05-31T21:47:49Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: perfect-training-planner
language_family: js
package_manager: pnpm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: failed
audit_command: "npm audit --json"
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
**Strategy**: git-clone
**Exit code**: 1

**Stderr (last 20 lines)**:

```text
Progress: resolved 869, reused 0, downloaded 738, added 737, done

dependencies:
+ @astrojs/check 0.9.9
+ @astrojs/cloudflare 13.6.0
+ @astrojs/react 5.0.6
+ @astrojs/sitemap 3.7.3
+ @eslint/config-helpers 0.6.0
+ @radix-ui/react-slot 1.2.4
+ @supabase/ssr 0.10.3
+ @supabase/supabase-js 2.106.2
+ @tailwindcss/vite 4.3.0
+ @types/react 19.2.15
+ @types/react-dom 19.2.3
+ astro 6.4.2
+ class-variance-authority 0.7.1
+ clsx 2.1.1
+ lucide-react 1.17.0
+ react 19.2.6
+ react-dom 19.2.6
+ tailwind-merge 3.6.0
+ tailwindcss 4.3.0
+ tw-animate-css 1.4.0

devDependencies:
+ @eslint/compat 2.1.0
+ @eslint/js 9.39.4 (10.0.1 is available)
+ eslint 9.39.4 (10.4.1 is available)
+ eslint-config-prettier 10.1.8
+ eslint-plugin-astro 1.7.0
+ eslint-plugin-jsx-a11y 6.10.2
+ eslint-plugin-prettier 5.5.6
+ eslint-plugin-react 7.37.5
+ eslint-plugin-react-compiler 19.1.0-rc.2
+ eslint-plugin-react-hooks 7.1.1
+ husky 9.1.7
+ lint-staged 16.4.0 (17.0.7 is available)
+ prettier 3.8.3
+ prettier-plugin-astro 0.14.1
+ prettier-plugin-tailwindcss 0.8.0
+ supabase 2.102.0
+ typescript 5.9.3 (6.0.3 is available)
+ typescript-eslint 8.60.0
+ wrangler 4.95.0

[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.27.3, esbuild@0.27.7, sharp@0.34.5, workerd@1.20260526.1

Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**.bootstrap-scaffold left in place at**: `.bootstrap-scaffold/`

## Post-scaffold audit

**Audit not run**: scaffold halted during the scaffold command; no project was moved into the current directory to audit.

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

Resolve the `pnpm install` failure, then re-invoke `/10x-bootstrapper`.

Useful manual checks in the meantime:
- Inspect `.bootstrap-scaffold/` if you want to review the partially installed starter.
- Run `pnpm approve-builds` inside `.bootstrap-scaffold/` if you want to approve the blocked dependency build scripts.
- Remove `.bootstrap-scaffold/` before retrying if you want bootstrapper to start from a clean clone.
