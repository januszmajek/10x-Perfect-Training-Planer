# Manual Verification Evidence

- **1.4** — Reviewed the committed fixture, runner, and configuration sources during implementation review. They do not
  serialize local credentials into committed files or browser payloads.
- **2.5** — Completed 2026-09-12 in the local app through a real narrow browser viewport. A disposable local-only
  account reached the Dashboard; the mobile navigation drawer opened, exposed the private navigation links, and
  closed with Escape with focus restored to its trigger. The Workout builder then exposed its narrow-layout mobile
  navigation and filter controls. This corroborates the fixed 360px Chromium checks.
- **3.6** — Completed 2026-09-12 with the retained trace from the controlled AI failure-path test
  `failed generation keeps an edited manual draft editable and saves it manually`. The trace contains the intended
  public diagnostics: invalid AI response, provider temporarily unavailable, and unchanged draft/plan after save
  failure. A scan of trace network/resources found no API key, bearer token, Supabase admin credential, OpenRouter
  credential, or submitted password value. The literal field labels `Password`/`password` appear only as UI/source
  text, not as a credential value.
