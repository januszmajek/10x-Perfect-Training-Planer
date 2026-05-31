---
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
---

## Why this stack

A solo learner shipping a workout-planning MVP in 3 weeks (after-hours, hard deadline) with auth and a BYOK AI proposer needs a battle-tested, agent-friendly starter that handles auth + database + edge deploy out of the box. 10x Astro Starter is the recommended default for (web_app, js) and clears all four agent-friendly gates (typed, convention-based, popular in training data, well-documented). Supabase provides PostgreSQL + auth + row-level security from day one; Cloudflare Pages delivers edge performance with zero-config deploy; React 19 islands enable shadcn/ui components for the workout builder and exercise catalogue UI. Bootstrapper confidence is first-class — scaffolding will be smooth with occasional manual steps at most.
