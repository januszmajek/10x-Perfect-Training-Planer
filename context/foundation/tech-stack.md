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

## Why this stack

10x Astro Starter (Astro 6 + React 19 + Supabase + Cloudflare) extended with shadcn fits Perfect Training Planner because: the PRD demands auth + database (Supabase ships both out of the box), the BYOK AI proposer is a straightforward server-side HTTP call from an Astro API route, the 3-week after-hours timeline favors a batteries-included starter over assembling pieces, and the solo builder profile benefits from the starter's opinionated TypeScript-first conventions that keep an AI coding agent on-rails. Cloudflare Pages deployment is free-tier friendly for a small-scale MVP and edge-fast for the mobile-viewport users planning workouts on their phones.
