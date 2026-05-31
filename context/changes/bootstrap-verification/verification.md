---
bootstrapped_at: 2026-05-31T12:00:00Z
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
starter_id: 10x-astro-starter
package_manager: npm
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
```

### Why this stack

A solo learner shipping a workout-planning MVP in 3 weeks (after-hours, hard deadline) with auth and a BYOK AI proposer needs a battle-tested, agent-friendly starter that handles auth + database + edge deploy out of the box. 10x Astro Starter is the recommended default for (web_app, js) and clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented). Supabase provides PostgreSQL + auth + row-level security from day one; Cloudflare Pages delivers edge performance with zero-config deploy; React 19 islands enable shadcn/ui components for the workout builder and exercise catalogue UI. Bootstrapper confidence is first-class — scaffolding will be smooth with occasional manual steps at most.

## Pre-scaffold verification

| Signal        | Value                                              | Severity | Notes                                          |
| ------------- | -------------------------------------------------- | -------- | ---------------------------------------------- |
| npm package   | not run                                            | —        | cmd_template uses git clone; npm check skipped |
| GitHub repo   | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh    | from card.docs_url                             |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && pnpm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 1 (pnpm-lock.yaml)
**Conflicts (.scaffold siblings)**: .env.example, .nvmrc, .prettierrc.json, astro.config.mjs, CLAUDE.md, components.json, eslint.config.js, package-lock.json, package.json, README.md, tsconfig.json, wrangler.jsonc, .github/workflows/ci.yml, .husky/pre-commit, .vscode/extensions.json, .vscode/launch.json, .vscode/settings.json, public/.assetsignore, public/favicon.png, public/template.png, src/env.d.ts, src/middleware.ts, src/components/Banner.astro, src/components/Topbar.astro, src/components/Welcome.astro, src/components/auth/FormField.tsx, src/components/auth/PasswordToggle.tsx, src/components/auth/ServerError.tsx, src/components/auth/SignInForm.tsx, src/components/auth/SignUpForm.tsx, src/components/auth/SubmitButton.tsx, src/components/ui/button.tsx, src/components/ui/LibBadge.astro, src/layouts/Layout.astro, src/lib/config-status.ts, src/lib/supabase.ts, src/lib/utils.ts, src/pages/dashboard.astro, src/pages/index.astro, src/pages/api/auth/signin.ts, src/pages/api/auth/signout.ts, src/pages/api/auth/signup.ts, src/pages/auth/confirm-email.astro, src/pages/auth/signin.astro, src/pages/auth/signup.astro, src/styles/global.css, supabase/.gitignore, supabase/config.toml
**.gitignore handling**: append-merged (no new lines — content identical)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: pnpm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 1 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/1/0 — the MODERATE finding is transitive only

#### MODERATE findings

- **yaml** v2.7.1
  - Advisory: GHSA-48c2-rrv3-qjmp (CVE-2026-33532)
  - Description: Stack overflow via deeply nested YAML collections in parse phase
  - Path: @astrojs/check > @astrojs/language-server > volar-service-yaml > yaml-language-server > yaml
  - Fix: upgrade to yaml >=2.8.3
  - CVSS: 4.3

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
