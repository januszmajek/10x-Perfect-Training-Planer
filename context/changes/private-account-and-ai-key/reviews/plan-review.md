<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Private Account and AI Key Implementation Plan

- **Plan:** `context/changes/private-account-and-ai-key/plan.md`
- **Mode:** Deep
- **Reviewed:** 2026-08-27
- **Final verdict:** SOUND
- **Initial verdict:** REVISE
- **Initial findings:** 1 critical, 4 warnings, 0 observations

## Final Scorecard

| Dimension             | Verdict | Rationale                                                                 |
| --------------------- | ------- | ------------------------------------------------------------------------- |
| End-State Alignment   | PASS    | The plan delivers S-01 without pulling OpenRouter execution in from S-02. |
| Lean Execution        | PASS    | Three phases follow the repository's database-to-service-to-UI sequence.  |
| Architectural Fitness | PASS    | Direct writes, request-local auth state, and shared validation now fit.   |
| Blind Spots           | PASS    | Negative crypto paths and runtime compatibility have explicit gates.      |
| Plan Completeness     | PASS    | Persistence, crypto bytes, files, contracts, and progress steps align.    |

## Grounding

Grounding: 8/8 referenced paths verified, 6/6 referenced symbols verified, brief-to-plan consistency verified, and
the `## Progress` contract verified.

## Findings and Decisions

### F1 — Direct upsert conflicted with immutable-column privileges

- **Severity / confidence / dimension:** CRITICAL / MEDIUM / Architectural Fitness
- **Issue:** The original privilege model could deny PostgREST's `ON CONFLICT (user_id) DO UPDATE` path because the
  conflict key participates in the update contract.
- **Decision:** FIXED — selected proposal A. The migration grants only the same-value `user_id` update needed by the
  direct upsert, leaves `provider` un-updatable with a database default, and uses RLS `WITH CHECK` to prevent owner
  reassignment. The service omits `provider`, and pgTAP covers both successful owner replacement and denied
  cross-user reassignment.

### F2 — Cryptographic wire format was underdefined

- **Severity / confidence / dimension:** WARNING / MEDIUM / Plan Completeness
- **Issue:** Base64url padding and HKDF/AES-GCM context bytes were not precise enough to guarantee future decrypt
  compatibility.
- **Decision:** FIXED. V1 now specifies unpadded base64url, a 32-byte root secret, a 12-byte IV, exact UTF-8 HKDF
  salt and info, exact AES-GCM additional data, lowercase UUID context, and no trailing newline.

### F3 — Negative cryptographic paths lacked executable coverage

- **Severity / confidence / dimension:** WARNING / MEDIUM / Blind Spots
- **Issue:** The plan promised rejection of tampered ciphertext, wrong context, malformed encoding, and unknown
  versions but relied only on manual checks.
- **Decision:** FIXED — selected proposal A. Phase 2 adds focused Node 22.14 built-in tests and a `pnpm test:crypto`
  CI gate without adding a third-party dependency.

### F4 — Authenticated Supabase state was not explicitly request-local

- **Severity / confidence / dimension:** WARNING / MEDIUM / Architectural Fitness
- **Issue:** Reconstructing a client in pages or endpoints could duplicate refresh work or miss cookie state changed
  by middleware.
- **Decision:** FIXED. `App.Locals` now carries the nullable typed client created by middleware; the account page and
  credential endpoints must reuse it after checking the verified local user.

### F5 — Page data access and validation ownership could drift

- **Severity / confidence / dimension:** WARNING / LOW / Architectural Fitness
- **Issue:** Direct page queries would bypass the credential service, while independently implemented React and
  server validation could diverge.
- **Decision:** FIXED. The account page reads metadata through the service, and a client-safe shared validation
  module owns structural rules for both the React form and server service.

## Result

All accepted fixes are incorporated into the full plan and plan brief. The change is ready for phased
implementation, beginning with Phase 1.
