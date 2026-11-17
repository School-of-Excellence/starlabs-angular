# 2026-11-18 — Pull Joshua's JC Health + delivery dashboard v4 (joshua-development)

**Operator ask:** "get journey coach health and delivery dashboard code". Only those two components (+ the Ev. Prep
board JC Health embeds). Nothing else from joshua-development (JE dashboard, onboarding pipeline, PI prototype,
globals, qa/, benchmark/, PROGRESS.md) was taken.

## How it was merged (not a branch merge — file-level 3-way)
Joshua's branch forked 2026-09-09 and never merged development, so a plain diff would revert charan-release work.
Each component was 3-way merged from the LAST point the two sides agreed:

| Component | Base | Ours | Theirs | Conflicts |
|---|---|---|---|---|
| JC Health (`journey-coach-health-dashboard`) | `e05da704` (his 09-24 port onto origin's component — closest to ours, charan-release last touched JC Health 09-23) | HEAD | joshua tip `01b79258` | ts 14 · html 13 · css 1 |
| Delivery dashboard (`delivery-dashboard-clone`) | `eb67431f` (the version we pulled 11-12) | HEAD | joshua tip | ts 7 · html 3 |

## Resolutions (and why)
**JC Health ts → Joshua's file whole.** In September both sides ported the same features separately, so a 3-way
produced duplicated members (jcDoneEvents, jcPipeline, setSchedBucket…). His later commits already carry our fixes
(cancelled JCs excluded; hardened `isOnboardingAppt`; coach's-own-schedule = his "review F3"). Our side had no hooks
in the ts. Checked: tsc + `ng build --configuration development` clean.

**JC Health html → his markup, OUR hook names.** The hub references our ids, none of his. Mapped:
`jchd-needs-attention→jchd-btn-014`, `jchd-sum-quiet→jchd-btn-019`, `jchd-mc-{needs,quiet,locked,renewing,tickets,flagged}→jchd-btn-04{1..6}`,
his relocated finance chips `jchd-hero-locked→jchd-btn-020`, `jchd-hero-defaulted→jchd-kpi-defaulted`, missed tile
gets `jchd-kpi-missed`, theme toggle moved into his tab bar `jx-theme-toggle→jchd-theme-toggle`, A&H overlay
`ahd-overlay→jchd-ahd-overlay` + backdrop hook restored, ah-mini buttons get their hooks back. Our A&H row chips
(Critical / Needs Attention / Opportunity) were never on his branch → kept alongside his new "Due" follow-up chip.

**Delivery dashboard — Stuck: operator's rule + Joshua's columns.** WHO is stuck stays the Mahalakshmi rule taken
2026-11-12 (ongoing + priority mode, > 15 d since last attended appt else since ongoing, no future booking). From
Joshua's `0bb85765`: APPOINTMENT / STATUS / DATE / ASSIGNED TO filled from that last attended appointment, DAYS STUCK
badge with `data-basis` + `*` when it fell back, error banner when the lookup fails. Columns: his DAYS STUCK
(`stuckdays`) replaces our status-based DAYS STUCK + LAST APPOINTMENT DATE + DAYS (now redundant); SUBSCRIPTION
START/END kept. Weekly Report code (Mahalakshmi) kept. Sparklines removed (his v4 dropped them). `hasSpecialistData`
left commented (reads `slotOverview`, removed on charan-release).

**Delivery dashboard v4 html → his layout.** One funnel replaces the KPI bento / attention tiles / pipeline-by-product.
Hooks renamed to the component prefix `ddc`: `dd-funnel-{stuck,idle,awaiting,ready}→ddc-btn-01{1,4,2,3}` (the
hub-referenced tile ids), other `dd-*` / `pm-*` → `ddc-*`. `ddc-div-009/010` (KPI cells) are GONE — hub spec must drop them.

## Specs
- His Karma specs brought as `*.unit.spec.ts` (unit lane): `delivery-dashboard-strip`, `delivery-dashboard-hidden-scope`.
  `hidden-scope` adapted to charan-release: `allParticipants` stub; PP docs carry `mode: 'Priority Mode'`; Stuck is
  checked on the candidates handed to `getRecentAppointmentDetails` (membership needs the Firestore lookup).
- Unit lane (delivery-dashboard-clone + JC Health folders): **210/210**.

## e2e coverage (hub branch `test/jc-health-delivery-v4`) — gate MATCHED
- Prefix rule: JC Health's `jx-*` / `ov-*` / `sched-*` → `jchd-*` (`jchd-tab-*`, `jchd-ov-*`, `jchd-sched-fu-*`), slide-over
  `so-fu-*` → `jcso-fu-*`. Ev. Prep board keeps `evp` (its own component); 2 unhooked elements hooked (`evp-retry`, `evp-modal`).
- Hub `dashboards.spec.ts`: `ddc-div-009/010` dropped (KPI cells removed by v4).
- New cases: JCH-13 tabs mount lazily / Onboarding + Ev. Prep kept alive / Overall rebuilt · JCH-14 Overall schedule tiles,
  plan grid needs one coach, month stepping · JCH-15 follow-up buckets + row Due chip · JCH-16 slide-over follow-ups + Mark
  done · JCH-17 Defaulted mini card · EVP-01 columns + exclusions · EVP-02 start prep (variation + note required, write
  read back) · DDC-STK-01 rewritten for the one `stuckdays` badge · DDC-STK-03 appointment columns · DDC-FN-01/02 funnel,
  strip, stage mix. Undriven hooks registered as ADDR fixmes.
- Seed: follow-ups on the JCH base (healthtracker_activity) + an Ev. Prep world under its own run tag `<run>_evp`.
- Firestore index `appointments(participantproductid, attended, endtime desc)` from Joshua's 0bb85765 NOT needed by our
  merged lookup (it queries `participantproductid in` only) — not added.

## Follow-ups on top (operator, same day)
- **"Ongoing by product" → All products chip** showed a hardcoded `&mdash;` (Joshua's v4) → now `kpiOngoingTotal`, the
  same figure as the funnel's In delivery (the old hero showed the total here).
- **Analytics tab crash** `Cannot read properties of undefined (reading 'length')` at `specialistData.length` — PRE-EXISTING
  since d88d9736 (Mahalakshmi 2026-09-08, "delivery-dashboard revert changes" commented `specialistData` out of the ts
  but left the template live). Guarded with `(specialistData?.length || 0) > 0` → shows the existing "coming soon" empty state.
- **Logic tooltips** (`logicTip` in the ts, one source): funnel steps (Awaiting, Ready, In delivery, Delivered), the
  Needs-attention label + Stuck / Not-consuming flags, Participants tabs (Awaiting, Not Consuming, Stuck), Products
  Overview stage legend + column tags + per-row pills (Yet to Start, Init, Started, Ongoing, Done) — 25 places.
- Flag label **"stuck 14d+" → "stuck >15d"**: the Stuck rule is > 15 days (STUCK_DAYS), not 14.
- **Search in every select + control alignment.** All 10 mat-selects got an `ngx-mat-select-search` box (already a
  dependency, same pattern as view-participants-form): `optSearch[key]` + `filterOpts()` for *ngFor lists, `optMatch()`
  guards on fixed options; multi-selects keep earlier picks (library behaviour). Misalignment cause: the Participants
  filter selects reserved a validation strip (no `subscriptSizing="dynamic"`) and three stacked infix overrides fought
  each other. Fix: `subscriptSizing="dynamic"` on all 14 remaining form fields + one CONTROL ALIGNMENT block at the end of
  the css (40px via `--mat-form-field-container-height`, search boxes and `.pm-btn-primary` 40px). The 3 native
  `<select>`s (modal purchased/bonus, specialist activity, items-per-page) were left as they are.
  Verified live in the operator's Chrome (localhost:62714): Participants row, Overview "Select Event", Weekly Report row
  and Stages header all measure 40px on one line. Fixes found while checking: labels rendered at 16px (this Material
  reads `--mdc-outlined-text-field-label-text-size`, + an explicit 13px), arrows sat on the border (an old rule zeroed the
  text-field wrapper padding → `0 10px 0 12px`), search box restyled to the outline skin, select panels grow to the
  longest option (`panelWidth=""`, 220–420px), Weekly "Choose a product" widened to 280px, Stages Export button 40px.
- Stages section: operator asked for a redesign, then parked it ("leave for now").

## Revert guide
Per-screen: `git checkout f0d92722 -- "src/app/Journey Onboarding/<folder>/"` for `delivery-dashboard-clone` or
`journey-coach-health-dashboard`; delete `jc-evprep-board/` and the two new `*.unit.spec.ts`. (f0d92722 = charan-release before this pull.)
Hub side: revert the hub commit on `test/jc-health-delivery-v4` (specs + seed) together with the app, or the renamed hooks fail.
