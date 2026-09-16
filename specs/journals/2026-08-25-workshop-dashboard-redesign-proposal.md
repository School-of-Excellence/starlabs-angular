# 2026-08-25 — Workshop Dashboard UI/UX redesign proposal (DESIGN ONLY)

Operator commissioned a presentation-only redesign of /workshop_dashboard —
explicitly NO code until they approve. Nothing in src/ was modified.

## What was done
- 8-agent inspection workflow (read-only) over
  workshop-dashboard.component.{ts,html,css} (3404/2238/1972 lines) + the 8
  child dialogs + workshops-list type labeling + a UX research brief, then
  an adversarial completeness critic (found 4 minor inventory errors, all
  folded in: dead onCodeSelectionChange/allSelected/metadata.reviewRequired,
  wrong ts:3160 citation → 2359).
- Full proposal published as artifact:
  https://claude.ai/code/artifact/9c03a875-ec63-4dff-b08c-c3d36991f806
  (sections A–J: audit, complete information inventory, type matrix,
  architecture, component UX, interactions, responsive spec, visual
  system, edge cases, blueprint).

## Load-bearing findings (for whoever implements)
- Exactly 3 effective dashboard presentations: Standard, CP
  (categorybased — access-based progress fork), Evergreen
  (+payment submode). journeybased/newusersonly/testmode/active/webactive/
  workshopcompleted have ZERO effect on this page (list page only).
- Two competing detail surfaces today: table row → scroll-down
  "Participant Data" card vs metric click → 400px side panel. Proposal
  unifies both into ONE right drawer.
- 5 visual dialects, 89 inline styles, 68 !important, native
  alert/confirm, single 768px breakpoint, color-only status dots.
- Hardcoded profile-ID gates (Clear/Enroll/Raw Data/moveParticipantToNext
  at WD.ts:2359) are BEHAVIOR — proposal keeps them, only groups the
  affordances under an Admin menu.
- Dead weight safe to drop in a later cleanup (not part of redesign):
  participant-dialog stub, ~8 commented-out template blocks,
  onCodeSelectionChange, workshop-dashboardv2.* duplicate files.

## Proposed architecture (awaiting operator approval)
Sticky compact header → KPI strip + "all metrics" tray (every current
card preserved) → Evergreen journey strip → sticky tabs
Overview/Participants/Submissions → single right drawer for participant
detail AND cohort lists/sends/filters. One token system (product blue +
tonal status ramp), styled confirms replacing native ones, WCAG-AA.
Explicitly deferred as NEW behavior (not to be built silently): saved
views, URL filter persistence, density toggle, column chooser,
virtualization.

## Status
NOT approved yet. No implementation. Section B of the artifact is the
preservation checklist to review against during any future build.

---

## Same day — interactive mockup added

Operator wanted a visible UI, not just the document. Built a
self-contained clickable HTML prototype of the proposed design with
sample data (CP + Evergreen combined so every surface shows):
https://claude.ai/code/artifact/8aab4ef7-d726-4967-bd60-ecea9f2e32d9
Sticky header + badges, KPI strip with "All metrics" tray (Categories
shelf), 14-day journey strip with Completed/Extended nodes, tabs
Overview/Participants/Submissions, 5-segment bars + labeled status
chips, 9-column table, unified right drawer (participant detail AND
cohort modes incl. extend flow), in-card VideoAsk player mock.
Verified interactively via local server (tabs, drawers, tray, charset).
Still design-phase: no Angular code touched.

Mockup v2: added a workshop-type switcher (Standard / CP / Evergreen /
CP+Evergreen) after operator noted the Standard (non-CP, non-evergreen)
presentation was missing. Mode toggles verified: badges, KPI sets
(Total Started + New Users tiles are non-CP; Completed tile +
Categories shelf + Type column + table filters are CP; journey strip +
share/purchase tiles are Evergreen). Same artifact URL.

---

## APPROVED → v3 implemented (same day)

Operator approved and directed: do NOT touch workshop_dashboard (or v2);
build the new UI as a NEW component. Done:

- `workshop-dashboardv3/` — TS is a byte-level derivative of the proven
  v1 component (class WorkshopDashboardv3Component, selector/urls
  renamed, child-dialog imports pointed at ../workshop-dashboard/ so the
  8 children stay SHARED and untouched) + v3-only presentation state:
  activeTab / metricsTrayOpen / showParticipantDrawer, setTab(),
  openParticipantDrawer() (wraps onParticipantClick),
  closeParticipantDrawer() (wraps clearSelectedParticipant). ZERO
  behavior methods modified.
- Template assembled programmatically: NEW shell (sticky header with
  type badges + gated Enroll/Clear using the ORIGINAL gate expressions
  extracted verbatim; KPI strip + "All metrics" tray with all 20 metric
  cards' exact bindings; sticky tabs Overview/Participants/Submissions)
  + VERBATIM copies of the proven blocks: evergreen journey (357-408),
  challenge overview card (647-784), participant table (786-1027, row
  click → openParticipantDrawer), participant-data card (1029-1468, now
  inside the right drawer), the three archives (1469-1773), the cohort
  side panel (1776-2233) and overlay — all handlers/conditionals intact.
- CSS: inherited v1 stylesheet as layout base for the copied blocks +
  appended v3 token skin (wd3-* shell, pdrawer, tonal status/type chips,
  card re-skin). Panes hide via display:none (not *ngIf) so
  paginator/sort ViewChilds resolve.
- Route: workshop_dashboard_v3/:id (lazy, authGuard — mirrors original).
- /workshops dashboardNavigation() now opens /workshop_dashboard_v3/.
- Prod build green FIRST run (AOT template check = all bindings valid).
  Route is auth-guarded → operator to visually verify signed in.
- Old dashboard untouched and still reachable at /workshop_dashboard.

---

## REVERTED (same day, operator directive)

Operator: "i dont want a new version 3.. revert". Fully reverted:
workshop-dashboardv3/ folder deleted, workshop_dashboard_v3 route
removed from app.routes.ts, /workshops dashboardNavigation restored to
/workshop_dashboard. Verified zero v3 references remain in src/; prod
build green. The design artifacts (proposal doc + clickable mockup)
still exist as reference only — no redesign code is in the tree. The
original workshop_dashboard was never modified at any point.

---

## Scoped redesign round — Challenge Progress Overview only

After the full-v3 revert, operator asked for the redesign applied to ONE
section of the CURRENT workshop_dashboard: "Challenge Progress Overview"
— completely new UI/UX, data strictly unchanged.

- HTML lines 647-784 (challenges-card + mat-accordion) replaced by a new
  `.cpo` section: section header (title + subtitle + the same CP category
  filter), one card per challenge with number/videocam badge, category
  pill, collapsed tonal summary chips, chevron; expanded body has the
  same 4 clickable status chips + Zoom Call Action / Zoom Attendees, and
  per-sub-challenge rows with a 10px 5-segment bar (same widths + title
  tooltips) and labeled tonal status chips replacing the color-only dots
  (all 6 statuses → same onStatusClick).
- EVERY binding/handler copied verbatim: participantsByStatus.get(...),
  isChallengeVisibleForCategory display toggle, onCategoryFilterChange,
  onChallengeMainStatusClick, openZoomDialog/openZoomAttendees,
  onStatusClick, statusDisplayMap, totalEnrolled math. One deliberate
  presentation change: the category pill now shows in both collapsed AND
  expanded states (was collapsed-only, an accident of
  mat-panel-description).
- TS: only presentation state added — expandedChallenges Set +
  toggle/isChallengeExpanded (replaces mat-expansion internal state;
  default all-collapsed like before).
- CSS: appended scoped .cpo block (tonal status token pairs, segment
  hues, responsive wrap ≤768px). Old .challenge-* rules left in place
  (now dead for this section; other sections unaffected).
- Prod build green (AOT validates all bindings). Auth-guarded page →
  operator to eyeball signed in. Rest of the dashboard untouched.

---

## Scoped redesign round 2 — Participant Data section (grid)

Operator: redesign the Participant Data section of the CURRENT dashboard;
data strictly unchanged; wants a GRID because the per-participant list
"takes more and more scroll".

- HTML lines 1016-1455 (participant-data-card: info-grid + challenge
  accordion + assignment-data-card + raw panel) replaced by `.pd` section:
  · Hero strip: avatar, name+New badge, CP type chip, status badge,
    enrollment date, progress % + mini bar (same categorybased branches),
    plus a Clear (✕) button wired to the EXISTING clearSelectedParticipant().
  · "Challenge Progress Details" = responsive GRID (auto-fill minmax 380px)
    of challenge cards — no accordion, everything visible & compact:
    number/name/statusClass chip/type, metadata chips
    (started/completed/manual), zoomcall block, sub-challenge tiles
    (idx/name/status/type/dates) with capability ACTION CHIPS: Quiz
    Results(+count), Video Ask, Form, Assignment (Form),
    Assignment (Question)(+file count), Previous Submission chips
    (date + files/Form Data + first-note preview, same reversed-index
    click math + tooltips). Text answers render as quoted blocks
    (dropped the misleading eye icon; VA tooltip copy fixed from
    "view current form" — copy only).
  · "Assignment Data" = grid of per-sub-challenge cards (challenge name
    as context line) with View/Review buttons, file counts, text
    response, Previous Submissions incl. Date/Type/preview + FULL notes
    list — all original fields.
  · Empty/loading/error states restyled; Raw Data expansion panel kept
    verbatim (same 2-ID gate); #participantDataSection ref + id kept so
    onParticipantClick's scroll still lands.
- The old accordion's [expanded]=isCurrentChallenge disclosure became
  always-visible-but-compact; current challenge/sub highlighted via
  pd-current/pd-sub-current instead.
- TS untouched this round (Clear button uses an existing method). CSS:
  appended scoped .pd block. Prod build green. Not committed.

Layout correction (operator): challenge cards must stay FULL WIDTH like
before — the grid belongs INSIDE. Challenge container switched
.pd-grid → .pd-stack (single column, full-width cards); .pd-subs is now
the grid (auto-fill minmax 340px → 2-3 sub-challenge tiles per row,
1-col ≤760px). Assignment Data cards keep the multi-column .pd-grid.
No binding changes. Prod build green.

Regression fix (operator report): row click stopped scrolling to
Participant Data — scrollToParticipantData() queried the old
'.participant-data-card' class that left with the mat-card markup.
Selector switched to '#participantDataCard' (the id the redesigned
section kept). Prod build green.

---

## Scoped redesign round 3 — All Assignments / All Forms / All VideoAsk

Operator: same treatment for the three archive sections; data strictly
unchanged.

- HTML lines 1290-1594 (three full-assignments-card accordions) replaced
  by three `.arc` sections sharing one language:
  · Section header: title + count subtitle; Forms keeps the Export Excel
    button (same click/disabled/busy bindings) moved into the header row.
  · Group cards (full-width) with custom expansion
    (expandedArchiveGroups Set in TS — presentation only; keys
    assign-/form-/va-+index; default collapsed like the old accordions):
    icon badge per family (assignment indigo / form green / videoask
    blue), name + challenge context sub-line (was a body h6), type pill,
    participant count, rotating caret.
  · Expanded body: description quote block (assignments), same
    empty-participants copy, and an .arc-grid (auto-fill minmax 250px) of
    compact submission cards: initial-letter avatar (derived from the
    existing name), name, tonal status chip ([class] participant.status +
    statusDisplayMap), date (Forms keeps the .toDate() date pipe),
    preview rows (Form Submitted / n file(s) / text — text visually
    line-clamped to 3, full content in DOM), previous-submissions and
    notes counters, eye affordance only on clickable cards.
  · VideoAsk cards keep the EXACT idle/loading/playing bindings and the
    va-card-player/va-player markup (existing player CSS reused).
- All handlers verbatim: viewParticipantAssignment (hasResult-gated
  ternary), openChallengeFormReview, playVideoAsk/stopVideoAsk,
  exportFormsToExcel.
- Also this round: scroll regression fix (scrollToParticipantData now
  targets #participantDataCard). Prod build green. Not committed.

---

## Scoped redesign round 4 — workshop header card

Operator (with screenshot): the purple gradient header takes too much
space; redesign completely, data strictly unchanged.

- HTML lines 21-53 (header-card mat-card: title/description/type
  subtitles, dates row, Q&A/Clear/Enroll mat-card-actions) replaced by
  `.whd` — a slim white strip (~70px vs ~180px): title + type pill +
  dates inline on one row, description as a single muted truncating line
  below (wraps on mobile), actions right-aligned (Q&A secondary, Clear
  DANGER tonal, Enroll primary). Purple gradient retired for this
  section.
- Bindings verbatim: workshopTitle/Description/Type, the
  'N/A'-gated dates row, openQADialog, openClearDialog + 4-ID gate
  string, manualenroll + 2-ID gate string (both gate expressions copied
  byte-identical, operator-precedence quirk preserved). No TS changes.
- Prod build green. Not committed.
