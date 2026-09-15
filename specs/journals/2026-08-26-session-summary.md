# 2026-08-26 — Session summary: workshop dashboard evolution + admin fields

Continuation of the long-running session summarized in
`2026-08-21-session-summary.md`. This entry maps everything from
2026-08-21 → 2026-08-26. Branch `nanda-development`. **Nothing committed
— operator commits manually (standing directive).** Detailed WHYs live in
the per-feature journals referenced below.

## Arc, in order

### 1. webactive flag
Journal: `2026-08-21-workshop-webactive.md` (first entry)
`workshopconfiguration.webactive` boolean: "Workshop Active Web" toggle in
/workshopconfig Settings + "Web Active" toggle column on /workshops
(mirrors `active` exactly). NOTHING consumes it yet — the web participant
flow must read it where it checks `active`.

### 2. Workshop dashboard additions + fixes
Journal: `2026-08-21-workshop-dashboard-additions.md`
- Section headings; **All VideoAsk** section (in-card player after two
  iterations: `<source type="video/mp4">` child pattern from
  participant-videoask, player renders INSIDE the clicked card).
- **Forms → Export Excel**: parallel getDocs (was serial → "more more
  time"), no template reads (submission formarray carries fieldname+value),
  classic orientation (row 1 = Name|Q1|Q2…, one row per participant),
  sheet per form.
- **Participant Progress Details sorting** fixed via custom
  sortingDataAccessor (column-id ↔ property mismatch; category-aware
  values; Status sort added; sort re-attached on data load).

### 3. Workshop dashboard redesign saga
Journal: `2026-08-25-workshop-dashboard-redesign-proposal.md` (the whole story)
- Design-only phase: 8-agent read-only audit + adversarial completeness
  critic → proposal artifact
  https://claude.ai/code/artifact/9c03a875-ec63-4dff-b08c-c3d36991f806
  and clickable mockup (with Standard/CP/Evergreen/CP+EG switcher)
  https://claude.ai/code/artifact/8aab4ef7-d726-4967-bd60-ecea9f2e32d9
- Full v3 component built on approval → **REVERTED same day** (operator:
  no new version). Original dashboard was never touched by v3.
- Then SCOPED in-place redesigns of the CURRENT workshop_dashboard, one
  section per round, bindings/handlers verbatim every time:
  · **Challenge Progress Overview** (.cpo): cards + tonal chips +
    5-segment bars; labeled chips replaced color-dots.
  · **Participant Data** (.pd): hero strip; full-width challenge cards
    with the GRID INSIDE (sub-challenge tiles, capability action chips);
    Assignment Data card grid; regression fixed same round
    (scrollToParticipantData now targets #participantDataCard).
  · **All Assignments / Forms / VideoAsk** (.arc): group cards + compact
    submission-card grids; Export Excel in section header; VideoAsk
    in-card player preserved.
  · **Header** (.whd): purple gradient card → slim strip (title + type
    pill + dates + truncating description; Q&A / danger-styled Clear /
    primary Enroll; ID gates byte-identical).
- Still ORIGINAL (untouched): metrics grid, evergreen journey strip,
  participant table card, slide-in side panel.

### 4. workshopconfig paymentmap status selects
Journal: `2026-08-21-workshop-webactive.md` (2026-08-26 entries)
When Payment is on, after Payment For: "Payment Based on Customer Status"
(non active|active|discontinued|none|banned|late) and "Payment Based on
Financial Status" (fully paid|regular|discontinued|locked|defaulted|
banned|late) — MULTI-selects storing string[] in paymentmap
(.customerstatus/.financialstatus), values byte-exact per operator.
Nothing consumes them yet.

### 5. /newusersprofile Converted filter
Journal: `2026-08-21-newusertags-type-filter.md` (2026-08-26 entry)
"Converted" chip → movedtoexist === true; sortable "Moved On" datetime
column appears only while active (mirrors the workshop-filter
column/export pattern incl. export-chip auto-sync); export = select-all
over filtered rows, Moved On chip auto-offered.

### 6. eiflixhomeconfig Ads: from adsfor to paired home-row structure
Journal: `2026-08-21-workshop-webactive.md` (final entries)
- `adsfor` select on the ad dialog: built, then **REVERTED** on operator
  direction the next message.
- Replacement: in the assign-home screen, 'Ads' widget REMOVED from
  Widgets; new "Ads (two per home row)" optgroup lists ads from the Ads
  tab (eiflixhomewidgets, widgettype=='ads'); each picked ad = item row
  (Title/Subtitle/Show To). SAVE pairs consecutive ad rows into ONE
  homeconfig index: { type:'ads', label:'Ads', ads:[{value, label,
  adref: DocumentReference, title, subtitle, showto}, ≤2] } — Firestore
  forbids nested arrays, hence map-with-array encoding of "one index,
  two maps". Legacy ads-widget entries dropped on load.
- UI round (operator screenshot): items list renders from cached
  groupsView — consecutive ads share ONE card ("Ads · N of 2 in this
  row", per-ad sub-blocks with own fields/remove); card numbers = saved
  home-row indexes; drag moves whole cards. EiFlix web app must read the
  paired structure (consumer out of scope so far).

## Standing facts
- All rounds ended `ng build --configuration production` green; admin
  routes are auth-guarded so operator does visual passes signed in.
- Journal-every-round + manual-commits directives observed throughout.

## Pending (this session's items)
- Operator visual pass on: redesigned workshop_dashboard sections, the
  Converted filter, paymentmap selects, Ads pairing UI.
- Consumers not yet wired (all flagged at delivery): webactive (web
  visibility), paymentmap customer/financial statuses (payment flow),
  homeconfig paired ads (EiFlix web app rendering).
- Carried from earlier: newusertags backfill (11 docs), eiflixcampaign
  rules verification, wccalendar phase-2 ideas.
