# Journal — 2026-06-10 · Dynamic Studio: documentation ⟷ e2e reconciliation (gap closure)

## What this is
A bidirectional gap analysis between **`specs/validated/04-dynamic-studio.md`** (the studio-runtime doc) and the **e2e suite** (`e2e/queue/` SS-00…SS-16 on `cicd`: `studio-core.spec.ts` + `studio-session.spec.ts`, plus `operator`, `cf-sideeffects`, `authoring`). Goal: find where the doc is wrong/thin and where the tests don't cover what the doc describes — so both can be closed. The doc has been updated in this pass (§3a, §6, §10, §11 + header). The tests' gaps are tracked below for follow-up work.

## Method
Read the studio specs + stubs (zoom/openvidu) and grepped the whole `e2e/` tree for every `04` feature term. Verified the headline finding against source (`app.routes.ts:114`, `arenastudioactivity.component.ts:59`, the two `closeStudio` buttons). No production data touched; ATC stayed off-limits.

## Direction 1 — what the TESTS caught that the DOC missed/got wrong → FIXED in `04`
1. **🔴 Security: `/arenastudioactivity` has no role gate (SS-15b / PLAN P0 #4).** The monitor is `canActivate:[authGuard]` only; the component's `if(developer)` / `admin||ah||integrator` gate around its data subscriptions is **commented out** (`arenastudioactivity.component.ts:59`). Any authed user sees every live studio cross-queue — participant identities + Zoom host emails. Only the force-close *button* is `*ngIf="developer"` (html :23,:112). The earlier doc draft implied the monitor was privileged — **wrong**. → new **§3a** + **§10-Q7**; spawned a fix task.
2. **`studio checkin log`** — each check-in/out toggle writes one audit row (ts:854-864; SS-02). Was missing from §6. → added to §6 + §3.3.
3. **`studioinvitation` expiry ≈ 120s** (ts:987; SS-04) — a hard 2-minute window. Doc named `expirydate` but not the value. This also **explains §10-Q3** (the 34% "no explicit response" is mostly auto-expiry). → §3.5, §6, §10-Q3 reframed.
4. **Other-studio visibility keys off `bonusactivityparticipant`** (`outsideLiveAssignment` query :412; SS-14), not `pairing`; Invite-More writes `bonusactivity` via an "Update Additional Specialist" dialog (SS-10, `studio.page.ts:477`). → §3.6 enriched.
5. **Stage-move CF side-effects** — `onQueueStageChange` (touchpoint) + `queueParticipantPositionUpdate` (ready-token recompute) fire on a move (CF-01/02). → §3.8 cross-ref.

## Direction 2 — what the DOC covers that the TESTS miss → coverage gaps to close
**Justified boundary (ATC OFF-LIMITS — not defects):** Add-ATC, Assign-changeagent, Prescribed-ATC render, Triple-ATC content. Products are seeded `atcmodel:null`; SS-07/SS-09 assert "ATC reads 0." Validate these *workflows* with the operator instead. Documented as a boundary in §11.

**Testable gaps (now tracked in `04` §11 as G1–G9):**
| # | Gap | Note |
|---|---|---|
| G1 | **Studio chat / messaging** | **zero coverage** — `studio conversation`/`getstudiochat`/`sendMessage` appear in 0 studio specs |
| G2 | Love Letters data-widget | seed `love letter`, assert read-only render |
| G3 | uP!-visit chip | seed journey/visit, assert label |
| G4 | Triple-ATC widget render | mount/no-fatal testable without ATC content |
| G5 | Move-to-next-month-review | action widget, no ATC dep |
| G6 | Regenerate Zoom link | stub Zoom, assert fresh `zoomdata` |
| G7 | Zoom embedded SDK path | only auto-link + OpenVidu covered |
| G8 | Positive multi-specialist session | SS-10 tests invite-more *cancel* only |
| G9 | Monitor force-close action | `data-testid="arena-close-studio-btn"` exists; never driven |

## Assessment
- The e2e suite is **strong on the spine and honest** — the role-gate leak is surfaced as a `test.fixme` + a documenting `test()` (never faked green). The test corpus was **ahead of the doc** on three facts (monitor leak, checkin-log, 120s expiry).
- The doc was **ahead of the tests** on the entire **read-only data-widget class** + several action widgets (G1–G9).
- Biggest single takeaway: **the monitor authorization leak (§3a)** — a real security gap, independent of testing, that the e2e finding flushed out.

## Delivered this pass
- **`04` §11 refined** into a per-ATC-widget table: *contract-testable now* (gating / dialog-opens / mount-no-fatal / side-effect writes — studio-runtime behaviour we own) vs *ATC-group owned* (content fidelity needing real ATC). Faking ATC to fill the right column = false-green, so it's explicitly deferred to the ATC concept group, not test debt.
- **Render-shape smoke shipped & GREEN:** `src/app/queue system/dynamic-studio/dynamic-studio.atc-list.render.smoke.spec.ts` — a TestBed/Karma spec rendering a faithful mirror of `dynamic-studio.component.html:351-406` against a *synthetic* ATC array. **4/4 pass** (empty-state, gating-off, full card render incl. adjustments→procedures + mapProcedure/mapQueue lookups + notes, multi-card iteration). **No Firestore, no ATC collections, no `src/app/ATC/**` import.** Run: `CHROME_BIN="…/Google Chrome" npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/queue system/dynamic-studio/dynamic-studio.atc-list.render.smoke.spec.ts'`.

## ⚠ Finding: the Karma (`ng test`) harness is pre-existingly broken repo-wide
To run the smoke I had to temporarily quarantine **3 unrelated broken specs** (restored afterward, untouched):
1. `src/app/ATC/Triple ATC/preview-triple-atc/preview-triple-atc.component.spec.ts` — imports `PreviewTripleAtcComponent`, but the class is `PreviewTripleATCComponent` (casing). *(ATC/** — CLAUDE.md already says exclude from the test pipeline.)*
2. `src/app/content/series-dashboard/assigncategorydialog/assigncategorydialog.component.spec.ts` — same casing class-name mismatch.
3. `src/app/Service/Deep Audio Filter/deep-audio-filter.service.spec.ts` — pulls `deep-audio-filter.service.ts`, which imports a **missing dependency `amazon-chime-sdk-js`** (not installed).
→ This is why `ng test` never runs and "real coverage ≈ 0": the whole-app Karma build fails to compile. It explains the project's reliance on the Playwright e2e suite. **Separate cleanup task:** fix the 2 casing mismatches, install/remove the chime dep, and add a karma spec-exclude for `src/app/ATC/**` (constraint-aligned). Until then, component render-smokes must be run with the broken specs quarantined or excluded.

## Pending / next (gap closure)
- ~~**Security:** add a `developer/admin/ah` route guard to `/arenastudioactivity` (and re-enable the component's commented gate). Flip SS-15b `test.fixme` → green once done.~~ **DONE 2026-06-10** — `roleGuard(['developer','admin','ah'])` added (`src/app/role.guard.ts`, wired in `app.routes.ts`); component data-subscription gate re-enabled; SS-15b flipped to a real negative test (seeded eis-only `changeagent` actor) + a positive admit test. Full write-up: journal `2026-06-10-arenastudioactivity-role-gate-fix.md`.
- **Tests:** author G1–G9 (start with **G1 studio chat** — highest-value, fully testable). Keep ATC widgets as a documented boundary, not tasks.
- **Doc:** `04` stays DRAFT until the operator walkthrough (§10) — now including the security finding (Q7) and the auto-expiry reframe (Q3).
