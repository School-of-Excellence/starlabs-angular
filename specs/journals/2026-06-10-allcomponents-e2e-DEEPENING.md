# 2026-06-10 — All-components e2e: DEEPENING to full validated/recon depth

> Operator follow-up to `2026-06-10-allcomponents-e2e-COMPLETE.md`: "complete it for ALL the components
> with the full level of depth, refer to the validated documentation, use dynamic workflows where useful."
> The first pass built a green slice per group; this pass closes the gap to each group's full recon
> candidate-case list and to the **validated docs** (`specs/validated/01..06`) where they exist.

## Method
1. **Gap analysis** per group = recon candidate list (`e2e/recon-allcomp/<g>.md`) + validated doc MINUS the
   already-green cases. (Modes gap analysis done in-session against `validated/02 §7e`.)
2. **Modes engine first (by hand)** — the validated-core exemplar establishing the deep CF patterns.
3. **Deepening workflow** (one Opus agent/group) implements the remaining cases, referencing the validated
   doc + the modes-engine/appointments-status exemplars.
4. **Serial green + commit + journal** per group.

Validated docs referenced (all 6 now exist): 01 Journey&Products, 02 Product Modes, 03 Queue (already deep),
04 Dynamic Studio, **05 Appointment System** (new), **06 Events/Arena/Calendar** (new).

## DONE — Modes engine to full validated depth (commit b7d05c4, 16/16 green)
New `e2e/modes/engine.spec.ts` (8 CF-side-effect cases) covering `validated/02 §7e` transition tables by
driving the deployed `calculateParticipantMode` and asserting CF-computed output vs seeded preconditions:
- **Table B post-completion arc** — Performance / Extended Performance / After-Extended rungs, driven by
  pinning the engine's clock (`/Atestdate/date`, participantmode.js:12-17) + back-dating `statusdate.completed`
  so `floor(now − completed)` lands in each `[I,I+P)/[I+P,I+P+E)/≥I+P+E` band (I=P=E=30). Integration (rung 0)
  was already in cf-mode.spec.
- **Table D rollup** — multi-product headline = lowest `modes.sequence` across the participant's products
  (not the just-changed row); + customerstatus `non active` → Exploration Mode override.
- **Table A entry** — seed branch (deliveryplanning → Journey [Priority] Planning), cancelled → null,
  tentative-date ≥30d → Early Preparation.
Seed fix: added `Priority Mode` to the run's `modes` catalog (sequence > Integration) so a transient
out-of-catalog mode (indexOf==−1) can't win a racing rollup.

## Patterns reused for the deep (hard) cases
- **CF time-arcs** → pin `/Atestdate/date` + back-date state (modes/engine.spec.ts).
- **App-written docs** carry no `testrunid` → assert/clean by natural key.
- **Material mat-select** → `getByRole('combobox',{name}).click({force:true})` + retry-until-option-visible.
- **Polluted collections** (notificationrecord/participant metadata/dashboard/event collection) → screen
  Search box, run-unique label scoping, or page-position-independent assertions.
- **Camera/QR (zxing)** → inject via `ng.getComponent(el).onCodeResult(...)` through `page.evaluate`.
- **Not-deployed CFs** (appointment/event/content/comms/workshop) → assert the UI's own write + skip-guard.

## Final results — all 12 deepened groups committed GREEN (with documented fixmes)
The deepening workflow (Opus agents) authored ~110 new cases; the orchestrator greened each serially,
fixing the cross-spec-isolation regressions and fixme-ing the genuinely-fragile cases. Per-group (committed):

| Group | passed | fixme (documented) | CF/other skip | commit |
|---|---|---|---|---|
| modes | 23 | 0 | 2 (CF gated) | d41390d (+ engine b7d05c4) |
| appointments | 14 | 5 (booking 02/03/18 + roster 07 + team-hours 11) | 0 | 33cb267 |
| events | 15 | 0 | 0 | fa0688d |
| content | 11 | 4 (write-via-dialog 04/11/12/14) | 4 (CF gated) | 95af419 |
| workshops | 14 | 4 (write-dialog 06/08/10/13) | 0 | 9f76c6b |
| comms | 10 | 2 (template-create 03/04b) | 7 (CF gated + CN-15 unharnessable) | b2d9eb1 |
| support | 12 | 3 (ticket-create 04 / blocked-msg 08 / search 18) | 3 (CF gated) | 74e3c4b |
| profiles | 22 | 1 (form-tracker filter) | 0 | f947f96 (PA-07 un-fixme'd→green) |
| evomap | 13 | 1 (EM-02 4-step dialog) | 0 | ca30a85 (EM-12 un-fixme'd→green) |
| authroles | 18 | 1 (AR-02b wrong premise) | 2 (CF gated) | 050f662 |
| business | 20 | 1 (touchpoint filter race) | 0 | 3be098c |
| journey | 16 | 0 | 0 | 7e39a30 (validates source fixes 16b578a + product-delivery) |

**~188 passing deep cases** (vs ~111 before deepening) + modes 16-case engine. **No previously-green case
left broken** — every regression from the agents' shared-seed extensions was fixed (full-doc resets, future-
date/attended to exclude from existing queries, run-unique scoping, retry-until-option mat-select opens,
out-of-window slot placement). The fixmes are honest + documented in-file: the recurring fragile class is
**write-via-Material-dialog/stepper flows** (no testids, async validators) — authored but needing per-dialog
selector reconciliation; plus CF cases for CFs not deployed to the test project (skip-guarded).

**Source fixes the e2e SURFACED + then VALIDATED end-to-end (journey group):** the deep product-delivery
cases found two real production crashes — the `/deliverysequence?data=` EDIT path threw "Cannot read undefined
(length)" and stranded the form when a mapping had a delivery option with no `deliverysequence` (fixed:
`delivery-sequence.component.ts:72-79` null-guard, commit 16b578a), and the `/productdelivery` LIST collapsed
to zero rows + emitted a fatal by mutating the snapshot in place (fixed: `product-delivery.component.ts`
fresh-per-emit view-model). Both are now PROVEN by JP-EDIT/JP-PD — validated by rebuilding THIS repo's dev
bundle and serving it on a fresh port (the `:4200` default served a STALE sibling-worktree bundle lacking the
fix; see [[allcomponents-e2e-suites]] stale-build footgun). JP-05/06 tolerate ONE anchored benign class: the
participantpurchase screen reads the Watson prod secondary app (uninitialized in the test env).

## Follow-ups (ranked)
1. Isolate the appointments **booking keystone** (APPT-02/03/18) on a dedicated `p_book` participant so it
   stops polluting the status board, then un-fixme (the 4-write batch is specified in validated/05 §4).
2. Reconcile the write-via-dialog selectors (content CN-04/11/12/14, workshops WS-06/08/10/13, support
   CS-04/08, comms CN-03/04b, evomap EM-02, business BM-TP-DELAY) — Material dialog/stepper open + submit.
3. Deploy the CF set to the test project to light up the gated CF cases (modes/content/comms/support/authroles).

---

## authroles DEEPENING (group key `authroles`, run `auth`) — 2026-06-10

**Gap closed (recon AR-01..15 → full depth).** The 11 green cases (AR-01..04/08..13 + smoke) covered
login admit/deny/redirect and the profile-role-access render/edit-write. Added `authroles/auth-roles-deep.spec.ts`
(10 cases) for the missing recon depth:

- **AR-05 / AR-06 (the #1 gap — role-gated NAV VISIBILITY).** Discovery: the live sidenav
  (`app.component.ts:filterNavItems` :536-551) role-gates ONLY the *children* of a dashboard parent —
  top-level docs are pushed unconditionally; a child survives iff `child.roles ∩ activeRoles ≠ ∅` OR
  `child.profileid ∋ profileid`. The pre-existing seed wrote only childless top-level route grants (they
  drive the GUARD ACL, not the sidenav filter), so nav-visibility was untestable. Fix: seed ONE
  run-namespaced parent (`auth_dash_navtree`, no route) with a 5-child role × profileid matrix
  (admin-only / participant / developer / by-admin-profileid / admin-favourite). The cases read the LIVE
  computed nav off `ng.getComponent(app-root).filteredDashboard` (dev-build window.ng, same idiom as
  events-deep QR) and assert which children the APP kept — admin sees admin+by-profile (not
  participant/developer); participant sees participant (not admin/developer/by-profile). Anti-circular:
  asserts the app's own filter output vs the seeded child ACLs.
- **AR-07 (EISDashboard Quick-Access favourites).** `guard.favouriteDashboard` = children whose
  `favourites[] ∋ profileid` (:550). One child seeded as the admin's favourite; assert it is in the
  computed favourite set + renders as an `app-main-dashboard .favorite-card` (and a non-favourited child
  is absent).
- **AR-02b / AR-03b (deny/admit matrix depth).** A participant denied a SECOND staff route
  (`/web-studio-invitation`); an `eis`-role staff ADMITTED to `/roster` by ROLE-match (isolates the
  role-OR branch the admin super-role can't).
- **AR-LOGIN-NONUM / NOROLE (dologin pre-auth gates).** The two middle gates the happy path skips:
  `number==null` → "mobile number required" alert; `role_ref → missing users_roles doc` →
  "Role data not found" alert. Both stay on /login, no Firebase-Auth round-trip. Seeded as
  PRECONDITION-only `profile_data` docs (no Auth user).
- **AR-11b (returnUrl carry).** Signed-out → guarded route → redirect preserves `?returnUrl=` (deepens AR-11).
- **AR-14 (createProfile_registeredUser CF).** Exported in source but NOT deployed on
  slabs-queue-e2e-exdcz (deployed set = calculateParticipantMode + *_to_pmd + queue CFs). Implemented as a
  REAL attempt with a deployment PROBE (`createProfileCfDeployed` — writes a throwaway user_data, polls for
  the CF's profile_data, self-cleans) → `test.skip` with a precise reason if absent; lights up
  automatically once deployed. No faked green.
- **AR-15 (sendEmailOTPNewUsers).** Documented `test.fixme`: an httpsCallable not invocable from the Admin
  SDK + not deployed + workshop-only entry point + fans out to Postmark (firewalled). The workshops suite
  already covers the registration-externals inverse.

**Seed (additive, idempotent).** `seed-authroles.js` +nav-tree parent (`navChildren()`), +`/web-studio-invitation`
route grant, +2 login-edge profiles; teardown unchanged (all tagged `testrunid:auth`, swept by the existing
`dashboard`/`profile_data` collections). Self-validated: `--teardown && --seed` clean
(staff 2 / participants 1 / routes 4 / ahcrmKeys 1 / navChildren 5 / edgeProfiles 2); `--list` compiles
21 tests in 3 files. ATC untouched. No firestore.indexes.json edits (none needed — all new reads are by
doc id / single-field email/id equality).
