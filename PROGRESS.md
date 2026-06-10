# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-10 (profiles e2e deepening)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/validated/README.md`.

## Current state
- Angular 19 + Firebase PWA across 3 Firebase projects. Two parallel workstreams: **(A) operator-validated documentation** (`specs/validated/`) and **(B) e2e testing** (`e2e/`, branch `cicd`, app build → disposable cloud test project `slabs-queue-e2e-exdcz`).
- **(A) Documentation — the original 6-group roadmap is now fully drafted:** #1 Journey & Products ✅, #2 Product Modes ✅, #3 Queue Manager ✅, #4 Dynamic Studio ✅ (validated 2026-06-10), **#5 Appointment System 🟡 draft, #6 Events/Arena/Calendar 🟡 draft** (both awaiting operator sign-off). The 7 extra e2e groups (content, workshops, support, profiles, comms, evomap, authroles) are **undocumented** — candidate #7+.
- **(B) e2e:** every non-ATC group has a GREEN anti-circular Playwright suite (appointments 7/7 · events 6/6 · modes 8/8 · content 9 · workshops 8/8 · support 10/10 · **profiles 23** · comms 9 · evomap 8 · authroles 11/11 · journey 8/8 · business 8/8; queue/studio/BIG 188/194). A **deepening pass** is bringing each group to full recon depth. ATC OFF-LIMITS throughout (`atcmodel:null`).
- Harness restored on this machine: data probes at `~/solarcode/starlabs-svstats` (NOT `~/Downloads` — macOS TCC); GitHub auth via `gh` (`solar345` = StarLabs access). Production read verified.

## Last session changes (2026-06-10) — why
- **Profiles e2e deepened 12 → 23 cases** (recon `profiles-analytics.md`). Added 4 spec files + additive
  seed/support extensions; the 12 existing cases untouched.
  - **PA-07 un-fixmed (load-bearing).** The prior fixme misdiagnosed `/participants-analytics` as
    "renders no table until a filter is built". In fact `fetchData()→onDataSearch()` runs with an EMPTY
    filter so ALL `participant metadata` rows render on load (Total reached 203 live); the "Error checking
    permissions" line is the auth-guard snackbar, not a no-table state. **No fixme remains in profiles.**
  - New: PA-08 (customerstatus filter narrows), PA-18 (selection badge), PA-PS-01 (ProfileScreen body),
    PA-EVO-01 (evolution-summary render via localStorage, NON-ATC name only), PA-FT-LL (Love Letter tab),
    PA-FT-FILT (participant-select where-clause), PA-AFB-FILT (app-flow-breaks type-chip), PA-CF-04/05
    (productsdata_to_pmd consumedproducts[] + productcount map), PA-14 (like toggle → forms-DB write).
  - Key gotchas (journaled): MatTable Filter is `(keyup)`-bound → use `pressSequentially` not `fill()`;
    poll `Total: N` text ≥ seeded floor as the loaded signal; direct-nav routes need a dashboard grant
    (added `/participant-evolution-summary`); ngx-mat-select-search input is disabled-on-open → click the
    option directly. See `specs/journals/2026-06-10-profiles-e2e-deepening.md`.
- (prior, still current) #4 Dynamic Studio VALIDATED; #5 Appointment + #6 Events/Arena/Calendar drafts
  awaiting operator sign-off; Karma harness pre-existingly broken (2 casing + missing `amazon-chime-sdk-js`).

## Pending / next
- **Operator sign-off** on `05` (§12) + `06` (§12) → flip both to VALIDATED.
- Optional: **doc↔e2e reconciliation** passes for the appointments + events suites (as done for #4 §11).
- Optional roadmap extension: document the 7 undocumented e2e groups (#7+).
- Carry-overs: Karma-harness cleanup (casing + chime dep + ATC spec-exclude); tier-A lock; TD-006 secrets; push `cicd` to origin (operator-gated).
