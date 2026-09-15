# 2026-09-02 — Workshop Configuration v2: route split + Enrollment page design (DESIGN GATE)

Operator goal (verbatim intent): move the legacy `/workshopconfig/:id` editor to
`/workshopconfigold/:id`, create a `WorkshopConfigurationv2` component that owns
`/workshopconfig/:id`, then rebuild the editor tab by tab — code, UI and UX — **without
changing the shape of the `workshopconfiguration` document**. First tab: Enrollment
Page. Design first, operator confirms, only then development.

## What was done

### 1. Route split (code, done, prod build green)
- `src/app/app.routes.ts`: `workshopconfig/:id` → new
  `WorkshopConfigurationv2Component`; `workshopconfigold/:id` → legacy
  `WorkshopConfigurationComponent`. Both behind `authGuard`.
- Only referrer of the URL is `workshops.component.ts:125`
  (`window.open('/workshopconfig/'+id)`), so the Edit button on `/workshops`
  now lands on v2. No other code builds that URL.
- New shell `src/app/New-Workshop/workshop-configurationv2/` (ts/html/css):
  reads `workshopconfiguration/{id}` via `docSnapshots` (never writes), shows
  title + document size + the three tab names, and a prominent
  **Open legacy editor** button → `/workshopconfigold/:id`. Handles the
  missing-document case explicitly (legacy page rendered blank there).
- `ng build --configuration production` → exit 0. Warnings in the log are
  pre-existing (bootstrap `.btn-group>+.btn` selector warnings, unrelated files).

### 2. Enrollment page design (HTML + CSS only, awaiting sign-off)
Deliverables in `2026-09-02-workshopconfig-v2-enrollment-design/`:
- `enrollment-page-ui.html` — the proposed page, desktop + responsive (<900px
  the rail becomes a chip row, sections stack, 44px controls).
- `enrollment-page-states.html` — save-bar states, required error, limit
  reached, add-row rule, icon picker, date+time pair, rail legend, collapsed
  section, block drag, leave-guard dialog, save-failed, empty section.

Operator interrupted the first attempt ("i asked you to give me a ui only in
html css") — the design-canvas route was abandoned; deliverable is plain
HTML/CSS. Memory saved: `ui-mockups-plain-html`.

## Design decisions and WHY

- **Visual vocabulary = the `/workshops` list page**, not the legacy config
  page. Edit is reached from that list, so the flow should feel continuous:
  DM Sans, Playfair Display title, navy `#1a3c5e`, gold eyebrow `#c8a96e`,
  `#f4f6f9` page, `#dde3ec` borders, 6/10/14px radii, 38px buttons. The legacy
  page mixes pink/blue brand tokens with gray-zinc and indigo — three dialects
  on one screen.
- **Custom-styled inputs instead of `mat-form-field outline`**: same reason
  the approved eiflixhomeconfig redesign gave (Material theme tokens the app
  theme may not emit; the `indigo-pink` prebuilt theme fights the navy). Form
  logic stays reactive-forms; only the chrome changes.
- **One long page + sticky section rail**, not a wizard, not a split preview.
  Day-to-day edits are "fix one FAQ / change a price"; a rail with content
  dots and n/max counts gets you there in one click and shows at a glance
  what is empty. Alternatives considered: guided steps (better for first-time
  setup, worse for edits, one far-away Save) and form + live preview (the
  participant page is rendered by the app, not this repo, so a preview would
  be a hand-built copy that drifts — highest cost).
- **Section grouping**: Basics (information, pricing & CTA, schedule) ·
  Page content (blocks, description & join us, sneak peak, overview, know
  info, FAQ) · Lists (learn, requirements, who for, outcomes, skills,
  hometags) · Extras (testimonials, bonus). `type` (workshop/eiflix) moves
  from "Pricing & Type" to Workshop information as a segmented control —
  same field, better home.
- **Sticky bottom save bar with unsaved-changes pill** (the pattern the
  operator approved on eiflixhomeconfig) replaces the FAB. It names the
  edited sections and the blocker when Save is disabled.
- **Limits and rules preserved exactly**: 9/9/9 icon+text rows, 20 FAQ,
  10 templates, description required, add-row-only-when-filled, drag order →
  `sequence`. Presentation changes only: Add disables with a reason instead
  of a toast / vanishing button.
- **Icon picker popover** replaces the `mat-select` full of 40px images.
  Same source (`workshop images`, type icon), same stored value (imageUrl).
- **Schedule** shows each date+time pair on one line with the computed span;
  storage is still one merged `Timestamp` per pair.

## Proposed NEW behaviour (needs an explicit yes — not in the legacy page)
1. Leave-guard dialog when navigating away / switching tab with unsaved edits.
2. Inline persistent "Could not save · Retry" instead of a 1-second toast.
3. "Saved just now" confirmation in the save bar (legacy shows nothing).
Everything else is a re-skin of existing behaviour.

## Data contract (unchanged — checklist for the build)
`detailpage` keys written by `buildDetailPageData()` in the legacy component:
title, type, shortdescription, day, price, enrollbuttonname, whyworkshop,
pricestriked, enablebonus, bonussection, bonushead, bonus1, bonus2,
bonusfooter, selectedTaxonomies, description, joinus, primarylyTaught,
thumbnailImage, titleVideo, registrationStartDate, registrationEndDate,
workshopStartDate, workshopEndDate (Timestamps), learnings, prerequisites,
workshopfor, hometags (string[]), sneakpeak, workshopoverview, knowinfo, faq
({question, answer}[]), outcome ({value, title}[]), dynamicenrollment
({type, sequence, data}[]), testimonialmap ({id: {profileid, uploaded,
videourl}}). `selectTemplate` is patched but never written — keep that quirk
until the operator says otherwise. Save = `updateDoc(ref, {detailpage})`,
i.e. the whole map is overwritten.

## Surprises
- The legacy `patchDetailPageData` passes `selectTemplate` to `patchValue`
  although the form has no such control (commented out) — Angular ignores it.
- The legacy page is fully behind `*ngIf="workshopData"`, so a bad id renders
  nothing; the v2 shell shows a not-found card instead.
- `graphify` is not installed in this environment (rebuild skipped again).

## Pending
- Operator reviews `enrollment-page-ui.html` (+ states) and confirms or
  requests changes. **No Enrollment development until then.**
- After sign-off: build the Enrollment tab inside
  `workshop-configurationv2` (reactive form + `buildDetailPageData` ported
  as-is), then Challenges, then Settings; keep the legacy route until v2 has
  all three tabs.
- Operator commits manually (standing directive). Working tree also carries
  the earlier uncommitted contentanalytics changes.

---

## Same day — design APPROVED → Enrollment tab implemented in v2

Operator: "implement the exact UI what you created i want that exact UI UX strictly
100% without any difference." Built into `workshop-configurationv2/` (the shell was
replaced; route unchanged). Dev build green; **not** runtime-verified behind login
(Claude cannot sign in) — operator visual pass pending.

### What was built
- `workshop-configurationv2.component.{ts,html,css}` — full Enrollment tab.
  Form model, `patchDetailPageData`, `buildDetailPageData`, `saveDetailPage`
  (`updateDoc(ref, {detailpage})`), dynamic-block helpers, testimonial map logic,
  template→`participantvideoask` batching, uploads to `workshop/thumbnail|video`
  are ported from the legacy component. Same control names, same limits
  (9/9/9/20, 10 templates, description required), same `detailpage` shape.
- `unsaved-changes.guard.ts` + `canDeactivate` on the v2 route: "Leave without
  saving?" dialog rendered by the component (Stay / Leave without saving), also
  fired on tab switch (Leave discards) and mirrored by `beforeunload`.
- Chrome from the mockup: sticky section rail (content dots, n/max counts,
  red "needs attention" for the missing description, scroll-spy, click-to-jump,
  Collapse/Expand all, document-size meter), collapsible section cards with
  summaries, custom inputs with counters, segmented Product type / Block type,
  custom toggles, CTA preview, one-line date+time pairs with computed span,
  icon-picker popover (search + grid + "Manage icons ↗"), taxonomy / template /
  participant popovers with search, chips, drag-reorder with a navy drop line,
  sticky save bar with all six states (No changes · Unsaved changes + edited
  sections · Saving… · Description is required · Saved just now · Could not
  save + Retry), Discard = re-patch from last saved data.
- Responsive rules copied from the mockup (<1100 and <900px).

### Decisions worth knowing
- **Custom inputs, not `mat-form-field`** — required to match the design pixel
  for pixel; reactive forms unchanged underneath.
- **Material pickers kept for dates/times** (`[matDatepicker]`/`[matTimepicker]`
  on the custom inputs, opened from the icon buttons). A component-level
  `DateAdapter` (`EnrollmentDateAdapter`) formats "05 Sep 2026" / 24h "10:00"
  as designed. Storage is still one merged `Timestamp` per pair.
- **ngx-editor kept** for rich text (same library, same HTML output); its menu
  bar is skinned to the mockup bar. Toolbars: full for description/join-us/
  block content, small for block titles, minimal for icon-text items. Icon
  glyphs are ngx-editor's own SVGs rather than the mockup's letter mocks —
  the only visual liberty taken.
- **Scroll container** is `mat-drawer-content` (the shell's `.mainscreen` is
  `overflow:hidden` under a sticky toolbar), so the scroll-spy attaches to the
  nearest scrollable ancestor and sticky offsets are 16px, not 80px.
- **Bug fixed in passing**: legacy never assigned `mapProfile`, so testimonial
  names rendered blank; v2 builds it from `getProfileMap()` + new-user map.
- `MatNativeDateModule` deliberately NOT imported in the component so the
  adapter override cannot be shadowed (app.config provides the native adapter).
- Tabs Challenges/Settings still show the placeholder card with "Open legacy
  editor"; the Enrollment form stays mounted (`[hidden]`) while on other tabs.

### Pending
- Operator runtime pass on `/workshopconfig/<id>`: load, edit, save, discard,
  leave-guard, pickers, drag, mobile. Then manual commit.
- Challenges + Settings tabs in v2 (design first, as with Enrollment).

---

## Same day — Enrollment fixes after operator review + Challenges design

Operator review of the built Enrollment tab (seven changes, all applied to the v2
component; the mockup HTML is now superseded by the code on these points):
1. **Product type removed** from the UI. `type` still lives in the form and is
   written to the document; it patches as `dp.type || 'workshop'` and defaults to
   `'workshop'` for new documents. Operator: "it's always workshop".
2. **ATC taxonomy removed** from the UI. `selectedTaxonomies` still round-trips
   (patched from the doc, saved back unchanged). The `atc taxonomy` listener was
   dropped — one Firestore subscription fewer.
3. **Pricing & CTA preview removed**; the four fields fill the card.
4. **Schedule**: registration and workshop windows sit side by side in one row
   (`.grid2.windows`, flexible date/time inputs; the span text moved into the
   label counter slot). Storage unchanged (one merged Timestamp per pair).
5. **Selected icon thumbnails shrunk** in every icon picker (22px, `object-fit:
   contain`; picker grid icons 28px) — sneak peak, know info, overview and block
   items share the same template so it applies everywhere.
6. **Bonus section removed** from the UI. All six bonus fields still round-trip.
7. **Overview moved last** (after Testimonials, group "Extras" in the rail). The
   icon+text card became an `ng-template` declared *inside* the `<form>` so
   `formArrayName` still resolves the parent `FormGroupDirective`.
8. **Header no longer shows `workshopconfiguration / <id>`**.
Dev build green after the changes.

### Challenges tab — DESIGN ONLY (no code)
Deliverables (plain HTML + CSS, same vocabulary, same operator preferences):
- `challenges-page-ui.html` — the tab: curriculum rail (numbered sets, activity
  counts, Zoom marker, Add set, evolution-mapping status), locked banner when
  the workshop is Active, set cards (type segmented Activity/Zoom call, icon,
  heading, sub heading, description, categories chips, facilitators-only,
  unlock date+time), activities as collapsible rows (grip · number · name · type
  badge · summary · delete) with "Insert activity here" gaps, one expanded
  VideoAsk activity showing the evolution-mapping rule, a full Zoom-call set,
  collapsed sets with summaries, sticky "Save Challenges" bar.
- `challenges-activity-types.html` — the type-fields box for all ten activity
  types (video, audio, form, videoask, quiz, assignment form/question,
  resource, offer, note, evolution mapping) plus the retired zoom-call
  activity as read-only legacy; states: add/insert menu, type menu, delete
  confirm (styled, names the activity count), Active-locked controls, empty
  curriculum, "no categories saved yet", set-level validation.
Rules carried over unchanged: max 2 final-evolution VideoAsks with unique
before/after; evolution-mapping toggle needs both; ordering + unlock dates
frozen while Active; type change clears type fields (proposed: confirm first);
categories come only from saved Settings categories; completed toggle strips
`status` when off; save overwrites the whole `challenges` array.

### Pending
- Operator reviews the Challenges mockups → says "develop" → then build the
  Challenges tab in v2 (port `patchChallengeData` / `saveChallengesPage` and the
  evolution-mapping validators verbatim).
- Operator runtime pass of the Enrollment tab with today's fixes; manual commit.

---

## Same day — data-contract audit (operator asked "did the document change?")

Mechanical diff (form keys, build payload, write path) + an adversarial audit agent
over legacy vs v2 `saveDetailPage`:
- **Structure: unchanged.** Same 39 form controls, same 35 `detailpage` keys written,
  same `updateDoc(ref, {detailpage})` whole-map replace, no other root field touched by
  v2. Hidden fields (`type`, `selectedTaxonomies`, six bonus fields) patch from the doc
  and write back unchanged. Timestamps, dynamicenrollment `{type, sequence, data}`,
  `{question, answer}` rows, `{value, title}` outcomes, `testimonialmap` entries —
  identical by construction.
- **One value difference, requested by the operator:** a document with a missing or
  empty `detailpage.type` is written as `type: 'workshop'` by v2 (legacy wrote `''`).
- **Legacy quirk uncovered:** legacy built the description control as
  `['', Validators.required].filter(Boolean)` → the empty string is filtered out, so
  FormBuilder took `Validators.required` as the *initial value* and attached **no
  validator**. The legacy never actually enforced "description required" (the user
  guide §3.5 is wrong on this). v2 attaches a real required validator (as in the
  approved design), so a workshop whose description is empty cannot be saved in v2
  until text is entered. Flagged to the operator; keep or drop is their call.
- **Bug fixed in v2 (found by the audit):** after a save, `lastSavedDetailpage`
  shared the `testimonialmap` object with the live map, and removing a testimonial
  mutates that map in place — so Discard could not restore a removed testimonial and
  the next save would drop it. Save now stores its own copy of the map.
- Noted, no action: v2 forbids removing the last icon-text item (legacy could persist
  `icontext: []`; both rehydrate it to one empty item on load). Discard re-patches the
  mounted rich-text editors, which normalises their HTML the same way any edit does.
- Challenges (design only): the workflow diff found no data-shape change in the
  mockups; watch items for the build are the new-set default type, the segmented
  defaults for assignmenttype / submissionformat, and whether a type change also
  clears the two rich-text fields (legacy leaves them behind).

---

## Same day — Challenges tab BUILT in v2 (operator: "start develop the challenges tab")

### What was built
- New child component `workshop-configurationv2/challenges/workshop-challengesv2.component.{ts,html,css}`,
  mounted by the parent for tab 2 and kept mounted (`[hidden]`) so edits survive tab switches.
  The parent's leave dialog / route guard / `beforeunload` now cover both tabs; switching tabs
  with unsaved edits asks first and discards the tab you leave (as designed).
- Shared stylesheet split: `wc2-shared.css` (all v2 tokens/components) imported by both
  component stylesheets; date adapter moved to `wc2-date-adapter.ts` (avoids a circular import).
- Logic ported from the legacy Challenges tab: set/activity FormGroups (same keys, same
  defaults), `patchChallengeData`, `saveChallengesPage` (`updateDoc({challenges})`, falsy
  `status` stripped), `onTypeChange` field list, evolution-mapping trackers and rules
  (max 2, before/after unique, auto-assign on enable, clear on disable, `finalbeforeafter`
  precondition, exact snackbar strings), drag reorder (sets + activities) frozen while the
  workshop is Active, unlock date/time read-only while Active (never `.disable()` — that
  would drop the field from `form.value`), resource upload to `workshop/resource/`,
  the four launchers (form builder dialog, VideoAsk template tab, quiz dialog, episode
  upload dialog), category ids from the saved `categoriesforthisworkshop` with names
  from `workshopcategory`.
- UI per the approved mockups: curriculum rail (numbered sets, activity counts, Zoom marker,
  Add set, totals, evolution slots, document meter, scroll-spy + jump), locked banner, set
  cards (segmented set type, icon picker, unlocks-on, heading/sub heading, description,
  categories chip picker with the "no categories saved" state, Audience toggle), collapsible
  activity rows with badges + summaries, "Insert activity here" gaps, add/insert menu with
  "At the end", type menu with badges, per-type field boxes (all ten + read-only legacy
  zoom-call activity), Zoom-call set "Call" group, empty curriculum, styled confirm dialogs
  (delete set names the activity count; delete activity; change type), six-state sticky
  save bar with "Saves the whole curriculum…".

### Deliberate decisions
- **New set defaults to Activity** (`type: 'challenge'`): the segmented control has no
  empty state (agreed in the diff review). Switching Activity ↔ Zoom call clears nothing,
  as legacy.
- **Untyped activity = warning, not a block.** The mockup showed a blocking error; the
  legacy had no rule at all and old documents may contain untyped activities, so blocking
  could trap the operator. Save stays enabled; the save bar, rail and set header flag it.
  Flip to blocking on request (one line in `saveState`).
- **Type change confirms before clearing** when any type field holds a value (approved
  proposal); name/description are kept, exactly as the legacy field list.
- **Evolution counter is resynced from the form** after type change, delete and reorder
  (legacy drifted); persisted data unchanged.
- **Rich text keyed by activity `challengeid`** instead of index, so the legacy's editor
  re-indexing after removal is unnecessary. Full ngx-editor toolbar kept.
- Recording list reloads after the upload dialog closes (legacy required a page reload).

### Verification
- Dev build green. Template identifiers cross-checked against the component.
- Multi-agent review (data parity / template+runtime / mockup fidelity / parent
  integration, each finding skeptic-verified) — results and fixes appended below.
- Not runtime-verified behind login (operator pass pending).

### Review outcome (4 reviewers, every finding skeptic-verified: 20 confirmed, 2 refuted)
Fixed:
- **Blocker — Discard left inputs bound to discarded controls.** `patchChallengeData`
  rebuilds the FormGroups; with `trackBy` on `challengeid` Angular reused the set views,
  so the open set's inputs stayed bound to orphaned controls (no visible revert, later
  edits silently dropped on save). Fix: track sets/activities by control identity
  (`trackBySet = (_, s) => s`), which recreates the views on rebuild and still moves
  the same instances on drag. The Enrollment tab is not affected (block uids change on
  patch; the other lists have no trackBy).
- **Major — unlock time editable while Active.** `[readonly]` does not stop
  MatTimepicker from opening and `[disabled]` is not an input of `<mat-timepicker>`.
  Fix: when Active the date+time render as read-only text (controls stay in the form,
  so the values are still saved); pickers only render when not Active.
- **Major — tab switch during a save could discard to a stale snapshot.** Tabs are
  disabled and `selectTab` returns while either tab is saving; both `discardChanges()`
  no-op during a pending write.
- **Major — a Firestore read error rendered an editable empty curriculum.** Parent now
  shows a "Could not load this workshop" card (`loadError`) instead of the tabs; the
  child refuses to save and disables Add set until it has been initialised.
- Minor: sets with an empty legacy `type` now show a "No type" badge, no lit segment,
  a rail marker and a save-bar warning (value untouched until the operator picks one);
  blocked-state pill derives its reason (invalid date/time vs set type); edited-sets
  text falls back to "Curriculum (sets added, removed or reordered)" and a new set is
  named immediately; the rail highlights the first set when the tab opens; Zoom-call
  delete copy no longer says "0 activities"; legacy zoom-call box titled "Type fields
  · read-only legacy" at 85%; help-text placements and two counters aligned to the
  mockup; rail row height/padding and the header icon margin match the mockup; dead
  `note` class removed in both tabs.
Refuted (kept as is): the untyped-activity *warning* (agreed deliberate decision) and a
claim that the legacy allowed choosing an empty set type.

---

## Same day — Settings tab DESIGN (operator: "now settings tab ui … without any changes in the datastructure")

Inventory first: a workflow read the legacy Settings template (html 1052–1860), the
settings logic (settingsForm 976–1066, patchSettingsData, saveSettings — 53 root-level
fields per save — toggles, profile-picker pairs, evergreen daily arrays, category
dialog + in-use guard, cohorts max 2, hero uploads, wati templates) and guide §5–6,
merged them into 138 verified items (`scratchpad/settings-inventory.json` this
session; the substance is reflected in the mockups). Notable facts the guide missed:
`webactive` is an 8th General toggle; `loginlogchannel` and the cohort-category picker
are commented out (controls still round-trip); `loadRecentTemplates` loads wati
templates that are never rendered; `evergreenaccessto.new`-user picker is not gated by
its "All" toggle; `evergreenWorkshopMeta` children are *disabled* while Evergreen is
off and therefore dropped from the saved map (a legacy quirk the build must reproduce
or consciously fix — flagged for the build phase, not the design).

Deliverables (plain HTML + CSS, same vocabulary + operator preferences):
- `settings-page-ui.html` — one page, rail grouped General / Access / Communication:
  Mode & visibility (8 toggle rows with the legacy ON/OFF descriptions; Test mode
  reveals the people picker; Share reveals the message), Audience (Active
  participants, New users, Journey chips, Tier, Facilitators), Category based
  (available chips + Create/edit, Cohorts ≤2, selected categories reorder list with
  "used by Set n" and disabled remove, thumbnail/video URL+upload, four welcome rich
  texts), Evergreen (days + last message, day chips + one editing panel for the two
  messages, Referral block, Payment block incl. customer/financial status chips, Who
  can refer, Evergreen access to), Logs & chat, Mail template, Messages, Hero (two
  toggles, heading/description, type, accent colour + swatch, three drop zones with
  preview/Replace/Remove), sticky "Save Settings" bar.
- `settings-states.html` — people picker (two directories, one list), category
  dialog, category-in-use row, cohorts max-2 popover, days-resize confirm, referral
  code/message rules, accent colour validation, save-bar states, Workshop Active note.

Design decisions (data untouched): the two profile dropdowns become one picker with
two directories (same single array); daily messages edited per selected day (same two
arrays); hero file inputs become drop zones (same fields, same storage path); the
category-in-use alert becomes a disabled remove button naming the sets; the cohort
max-2 alert becomes disabled rows. Proposed new behaviour needing a yes: confirm before
shrinking Workshop days when trailing days have messages.

### Completeness review of the Settings mockups (agent vs the 138-item inventory) — applied
Fixed in the mockups: Tier picker now drawn (was never shown); "Selected N" counters on
the two evergreen people pickers; category chips carry "name (description)"; section-level
ON/OFF wording for Category based / Evergreen; cohort rows labelled "name · N
participants" (legacy label, no dates); Payment for / Hero type are unset-able dropdowns
(legacy default ''), not forced segmented controls; "line breaks become spaces" (legacy
replaces newline runs with a space); Active-lock note only when ON and says "Activity-set
start dates"; exact legacy wording for Update Participant Workshop and Referral
Workshop; category-in-use guard also disables the picker row (legacy reverts a
deselect too); Evergreen access "All" keeps the legacy asymmetry (participants
directory disabled, new users still pickable); dialog validation (name/description
required, ≥2 chars, Creating…/Updating…); upload progress + failure with legacy
snackbar wording; referral-code pattern error for legacy values; raw-id / blank-name
legacy chips; legacy cohort-category chips (picker retired); save bar now shows all six
states and — as legacy — **never blocks**: Workshop days / accent colour are warnings.
Dropped: the "Shorten to N days?" confirm (legacy keeps hidden days' text until save
and restores it if the count is raised again — the mockup now states that rule).

### Build checklist for the Settings tab (data-shape guards from the review)
- D1 `evergreenWorkshopMeta` is replaced as a whole map; legacy disables its children
  while Evergreen is OFF, so the write then drops `workshopDays`/`lastChallengeMessage`.
  Decide: replicate exactly, or always write the 4-key map (operator call).
- D2 Payment for / Hero type must allow '' (unset) and write '' as legacy.
- D3 Daily messages must serialise back to two parallel string arrays of exactly
  `workshopDays` length, index-aligned, '' for empty days.
- D4 Hidden children persist: share message, referral fields, full 8-key `paymentmap`,
  3-key `referallowedusers`, 3-key `evergreenaccessto`, 4-key `cpwelcomemessage`,
  3-key `mailTemplate` are written on every save regardless of their toggle. Never
  clear on toggle-off.
- D5 People picker writes one flat id array per path, participants first then new
  users, de-duplicated; the "new" tag is derived, never stored; unknown ids kept.
- D6 `cohortcategoriesforthisworkshop` and `loginlogchannel` have no UI; keep
  round-tripping them via `updateDoc` (legacy chips only for existing data).
- D7 `categoriesforthisworkshop` order is the persisted drag order; picking appends.
- D8 Hero Remove writes ''; `heroAccent` trim+uppercase is the only save transform;
  `saveSettings` writes 53 root fields — v2 must write the same 53.
- Dirty tracking / disabled-when-clean Save is a v2 behaviour shared with the other
  tabs (legacy Save was always enabled) — accepted for consistency.

---

## Same day — Settings tab BUILT in v2 (operator: "implement the UI without any changes in the datastructure")

- New child `workshop-configurationv2/settings/workshop-settingsv2.component.{ts,html,css}`,
  mounted for tab 3 and kept mounted; parent leave guard / tab-switch discard / disabled
  tabs during saves now cover all three tabs.
- Ported verbatim: `settingsForm` (every control, default, validator, the disabled
  evergreen children), `patchSettingsData`, the four `ngOnInit` rules (category-in-use
  revert, evergreen enable/disable + validators, days → `syncDailyCommunicationArray`
  with its keep-until-save buffers, cohort-category guard), `saveSettings` payload as
  `buildPayload()` (the same 53 root fields, same `||`/`??` defaults, `heroAccent`
  trim+uppercase, `evergreenWorkshopMeta` written as `.value` so the legacy disabled-
  children behaviour is reproduced, D1), profile-picker buckets (participants first,
  then new users, de-duplicated, unknown ids kept — the merged picker calls the same
  `onProfileSelectChange`), cohorts max 2, `dropCategory`, referral code/message
  sanitising, hero/category upload paths and messages, `removeHeroAsset` writing ''.
- UI per the approved mockups: setting rows with the legacy ON/OFF wording, expand
  panels, people picker (two directories, one list; "All" on Evergreen access disables
  the participants directory only), journey/tier/cohort/category chip pickers, category
  dialog (legacy `WorkshopCategoryComponent`), selected-categories reorder list with
  "Used by Set n" + disabled remove, day chips + one editing panel bound to the two
  arrays by index, unset-able Payment for / Hero type, accent swatch, hero drop zones
  with preview/Replace/Remove, six-state save bar that never blocks (warnings only).
- Alerts replaced by snackbars/disabled controls (same texts). No `confirm()` added.

### Review outcome (4 reviewers, skeptic-verified: 15 confirmed, 0 refuted) — all fixed
- **Blocker — day chips never rebound the two message textareas.** `[formControlName]`
  with a changing index is bound once by Angular, so text typed under "Day N" would have
  landed in Day 1's slot. Fix: bind by control instance (`[formControl]="dayCtrl(arr, i)"`),
  which re-attaches on change and keeps the two arrays index-aligned (D3).
- **Major — Discard re-serialised the four welcome-message editors** ('' came back as
  `<p></p>`). Fix: after each patch, the editor-bound controls are reset to the raw saved
  HTML with `emitModelToViewChange: false` (applied to the Enrollment description/join-us
  editors too).
- **Major — tab strip `[disabled]` read ViewChild fields before they existed** (NG0100 in
  dev). Fix: coerced to booleans.
- **Major — `.input.error` had no rule** (invalid-state border never showed). Added; also
  the narrow `.pop.menu` rule.
- Minor: people-picker bucket order now follows directory order (legacy `mat-select`
  emitted option order); form rules are wired in the constructor so the evergreen
  validator exists before the first patch; toggles close open popovers (head toggles stop
  propagation); category remove/reorder no longer close the picker; rail Evergreen hint is
  "On"/"Off"; cohort chips show the name only.
Dev build green after fixes; production build re-run below.

---

## 2026-09-03 — New-workshop flow + `workshoptype` (operator directive)

Operator: bypass `/create-workshop`; New Workshop opens `/workshopconfig/<id>` with a
pre-generated Firestore id and the document is created on the first save; add a mandatory
**Workshop type** dropdown (liveworkshop / evergreenworkshop / cpworkshop) to Enrollment ›
Workshop information stored as a ROOT field `workshoptype` (not inside `detailpage`);
remove "What are you creating?" from `/create-workshop`.

### What changed
- `/workshops` New Workshop → `doc(collection('workshopconfiguration')).id` and opens
  `/workshopconfig/<id>` in a new tab (as Edit does). `/create-workshop` stays routed
  but its type select is gone (the form still defaults `type` to `workshop`).
- v2 parent: a missing document is now **new-workshop mode** (`isNew`), not "not found":
  the three tabs work on defaults, the header shows "New workshop · not saved yet", and
  the first save from ANY tab creates the document with `setDoc({ created: Timestamp.now(),
  docid: <id>, ...that tab's payload })` — the two fields the old create step wrote besides
  `detailpage` and which the list needs (sort by `created`, edit/duplicate by `docid`).
  Later saves use `updateDoc` exactly as before. Leaving an unsaved new workshop creates
  nothing (the guard still asks).
- `workshoptype`: a separate `FormControl` (never spread into `detailpage`), patched from
  `data.workshoptype`, required; the Enrollment save writes `{ detailpage, workshoptype }`
  (`updateDoc` still replaces `detailpage` as a whole). Save is blocked with "Workshop type
  is required" until chosen — **this also applies to existing documents that predate the
  field**: their next Enrollment save requires picking a type once. Challenges/Settings
  saves are unaffected.
- The old create step's `detailpage.type` is still written by v2 (`'workshop'` default).

### Data note
This is the first deliberate document change of the v2 work: one new root field
`workshoptype`. Everything else is unchanged. (`created`/`docid` on new documents are what
the old create step wrote.)

---

## 2026-09-03 (later) — `workshoptype` promoted to the top + new-workshop review fixes

Operator: "the workshoptype is a main one .. so we need to show this in the top and
highlight because hereafter we use this mainly for all in workshop creation". Then: journal
everything, the session is ending.

### Workshop type is now the first thing on the page
- Enrollment tab opens with a highlighted **Workshop type card** (`section.card.type-card`,
  navy 2px border, tinted background, Playfair title showing the chosen label or "Choose the
  workshop type first") holding a segmented picker (`.seg.type-seg`: Live / Evergreen / CP).
  The dropdown inside Workshop information is gone; the Why field stands alone there.
- Header: a `.type-badge` next to the page title on **every** tab (red "No workshop type
  yet" while missing) so the type is visible from Challenges and Settings too.
- Rail: "Workshop type" is the first item under Basics, with the attention dot while unset.
- The card turns red (`.attn`) when the type is missing and the operator has interacted, OR
  the document already exists (`!isNew`) — legacy documents that predate the field show the
  cue immediately instead of never (the Save button is disabled while blocked, so the
  old `submitAttempted`-only condition was unreachable).
- Nothing about the data changed: still one root field `workshoptype`, same three values.

### Multi-agent review of the new-workshop flow (4 reviewers, skeptic-verified: 12 confirmed, 2 refuted) — all applied
1. **BLOCKER — offline cache miss treated as "new".** `docSnapshots` can emit
   `exists()===false` from cache (offline, or a remembered miss); v2 entered new mode and
   the next save would `setDoc()` **over a real workshop**. Now a cache-only miss
   (`snapshot.metadata.fromCache`) triggers one `getDocFromServer()`: server says missing →
   new mode; server has it → the listener patches it; server unreachable → the existing
   "Could not load" card. New mode is only ever entered from a server-confirmed miss.
   Belt-and-braces: if a non-pending snapshot with data arrives while `isNew` is true, the
   form is re-patched from it instead of keeping the defaults.
2. **MAJOR — Discard was a no-op on a new workshop.** `patchDetailPageData` returned early
   when there was no `detailpage`, so `markAsPristine()` never ran and the leave dialog kept
   re-prompting. It now runs the full reset with `dp = {}` and re-seeds the one empty row
   that `initializeForm` starts with in learnings / prerequisites / workshopfor.
3. **MAJOR — a first save from Challenges or Settings created a document without
   `workshoptype` or `detailpage`** (bypassing the mandatory field; title-less row in the
   list). **Decision: only the Enrollment save creates the document.** While `isNew`, the
   Challenges and Settings save bars show blocked with "Save the Enrollment page first —
   it creates the workshop" as soon as they are edited; their `setDoc` branch is removed
   (always `updateDoc`). This supersedes the "first save from ANY tab" line above.
4. **MAJOR — `/workshops` Duplicate threw** on a document without `detailpage`
   (`workshop['detailpage']['title']`); now guarded like the other three actions.
5. **MINOR — `/workshops` Type badge** now reads the root `workshoptype` first
   (`typeLabel()`), falling back to the legacy `evergreenWorkshop` / `categorybased` flags
   for documents without it.
6. **MINOR — unreachable red state** on the type card (see above).
- **Not applied, deliberate:** the review asked to patch `detailpage.type` as `dp.type || ''`
  for existing documents (legacy preserved an empty value). Kept `dp.type || 'workshop'`
  because the operator directed "type default as workshop"; only documents with an empty
  `type` are affected, and only on their next Enrollment save.
- Refuted (intended): existing documents load with the required type unset and must pick
  one on their next Enrollment save; `/create-workshop` stays routed though nothing links
  to it.

### Verification
Dev and production builds green after every fix (`ng build` dev + production). Template
identifiers cross-checked by script (`strictTemplates` is off). **Runtime still not
verified behind login** — the operator pass covers all three tabs, the new-workshop flow
(create → save Enrollment → Challenges/Settings), Discard on a new workshop, the list's
Type badge, and the offline reload of an existing workshop.

### Pending
- Operator runtime pass (above), then manual commit of the whole v2 tree.
- D1 (evergreen disabled-children quirk) still undecided.
- Since `workshoptype` is now the main driver for workshop creation, the next step the
  operator hinted at is type-dependent creation (which tabs/sections a live / evergreen /
  CP workshop shows). Nothing of that is built or designed yet — ask before assuming.

---

## 2026-09-03 (bug) — header badge full width: Bootstrap 5 is global and eats `.row`

Operator screenshot: the "Evergreen workshop" badge under the title spanned the whole
header width (and, unnoticed, the two header buttons were stacked instead of side by side).

### Root cause (reproduced in a harness, not guessed)
`angular.json` loads `node_modules/bootstrap/dist/css/bootstrap.min.css` for every page.
Bootstrap's grid rule `.row > * { flex-shrink:0; width:100%; max-width:100%; padding:0 12px }`
plus `.row { margin: 0 -12px; flex-wrap: wrap }` matched the v2 vocabulary class `row`
(26 uses across the three tabs). The v2 stylesheet only sets display/align/gap on `.row`
and nothing on its children, so Bootstrap's `width:100%` survived: the title took the full
line, the badge wrapped underneath and stretched; the negative margin is why the badge
started 12px left of the title. A static harness with the real `wc2-shared.css` rendered
correctly; the same harness with Bootstrap included reproduced the exact numbers
(badge 1241px wide, row margin-left −12px).

Why it never showed in design review: the mockups are standalone HTML without Bootstrap,
and the legacy editor never used a bare `row` class.

### Fix (component-scoped only; the global stylesheet order is not ours to change)
- Deterministic sweep: every class name in the v2 templates intersected with every class
  selector in bootstrap.min.css → **8 collisions**: `row`, `btn`, `btn-primary`,
  `btn-danger`, `btn-sm`, `badge`, `card`, `placeholder`.
- `row` → **`hrow`** everywhere in v2 (templates + `.hrow.wrap/.between/.end/.center`).
  Renamed rather than overridden: a `.row > *` reset in component styles would carry
  higher specificity than the children's own width rules (`.w220`, `.txt`, `.input.date`…)
  and break them.
- `.card` now `display:block` (Bootstrap makes it a flex column); `.placeholder` resets
  Bootstrap's skeleton look (50% opacity, wait cursor, inline-block) — this was the
  load-error card; `.badge` sets `color:inherit` (Bootstrap paints badges white);
  `.btn[disabled]` restores `pointer-events:auto` so the not-allowed cursor shows.
- `.btn`, `.btn-primary`, `.btn-danger` define `--bs-btn-active-*` and
  `--bs-btn-focus-box-shadow` in our colours: Bootstrap's `.btn:first-child:active` and
  `.btn:focus-visible` selectors out-rank ours and read those variables — without them a
  pressed Save button flashed Bootstrap blue and keyboard focus drew a blue ring.
- Bootstrap reboot element rules (`button{border-radius:0}`, `p{margin-bottom:1rem}`,
  `img,svg{vertical-align:middle}` …) were checked against the v2 elements; a multi-agent
  sweep of all six global stylesheets was run afterwards (outcome below).

### Sweep of all six global stylesheets vs the v2 screens (4 lenses, skeptic-verified: 8 confirmed, 1 refuted, 1 duplicate) — all applied
The class-name intersection only catches Bootstrap *components*. The sweep found the rest:
- **Material typography leaks (the bigger visual delta):** `<body class="mat-typography">`
  (indigo-pink theme, loaded last) hands down `14px/20px Roboto` + `.018em`, and
  `.mat-typography h2` sets `Roboto 20px/32px` on every `<h2 class="sec-title">` (11 section
  heads on Enrollment, 8 on Settings — each ~12px taller, Helvetica fallback typeface).
  `:host` now sets `line-height: normal; letter-spacing: normal` (the mockup body's
  defaults) and `.sec-title` / `.title` pin font-family, line-height and letter-spacing.
- Bootstrap reboot: `a { color: blue; text-decoration: underline }` inside the ngx-editor
  bodies (links typed by admins, or already present in legacy description/joinus HTML) →
  editor links are navy, no underline; Material `h1–h3` inside the editors → skinned
  (DM Sans 20/17/15px, weight 700). `button { line-height: inherit }` on `.tab`/`.ptab` →
  `line-height: normal`. `.card` now `color: inherit` (Bootstrap painted card text
  `#212529` instead of the navy-black `--t1`).
- Keyboard focus: Bootstrap removes the outline and draws its ring via
  `--bs-btn-focus-box-shadow`, but our `.btn-primary` drop shadow out-ranked that ring, so
  Save buttons had **no focus indicator**. `.btn-primary:focus-visible` now layers the
  ring over the drop shadow. (Two reviewers reported this independently; one verification
  died on a server 500 — same defect, same fix.)
- Refuted: the global `::-webkit-scrollbar` 6px rules in `styles.css` reach v2 scrollers
  too, but the mockups show no scrollbar state, so no visible mockup delta.
Dev + production builds green after the sweep fixes. **Runtime still unverified behind
login** — the operator pass should now include: header badge + buttons, section heads
height, tab strip, a link inside a description editor, Tab-key focus on a Save button.

---

## 2026-09-03 — Settings › Messages: the two "enrollment not allowed" fields

Operator: in the Messages section add two more textareas alongside WhatsApp enrol message
and Congratulations message — "Exist users enrollment not allowed message"
(`enrollmentnotallowedmessage`) and "New users enrollment not allowed message"
(`enrollmentnotallowedmessagenew`).

### What was actually needed — no data change at all
Both root fields **already existed** in v2: form controls (`.ts:225-226`), patch
(`:361-362`) and the save payload (`:475-476`), ported verbatim from the legacy editor.
What was missing is that they only rendered **inside the Referral Workshop expand** of the
Evergreen section, i.e. invisible unless `referralworkshop` is toggled on — which is where
the legacy editor put them too. So this was a placement change, not a new field.

- **Moved** both textareas into Communication › Messages (now a 2×2 grid with the WhatsApp
  and Congratulations messages), labelled exactly as the operator asked. A first pass added
  a "Saved as `<field>`" help line under each; the operator rejected it — **internal field
  names are never surfaced in this UI**, so both lines were removed and the rule applies to
  every future field.
- The Referral expand keeps `referraldialogmessage` (now full width) plus a one-line
  pointer to where the two messages went, so an operator used to the legacy layout is not
  left hunting.
- `sections[]` control lists updated: the two keys move from `evergreen` to `messages`, so
  the rail's dirty/content marks follow the fields. Nothing else changed — same two root
  fields, same values, same payload.
- Decision: **moved rather than duplicated.** Rendering one `formControlName` in two places
  works in Angular, but it makes two sections light up as edited for a single change and
  invites the operator to wonder which copy is authoritative.

### One collision caught in passing
Those (now removed) help lines used `<code>`, and Bootstrap paints bare `code` **#d63384
pink**. The `.ph-text code` rule kept an explicit `color: var(--t2)` as a standing guard, in
case a `<code>` is ever used again; the `.help code` half was reverted with the help lines.
Verified against the **compiled** stylesheet in the build output rather than a harness.

### Harness lesson (worth knowing next time)
A static harness that maps `:host` onto `body` and drops Angular's `[_ngcontent]`
attributes **understates v2's specificity** and shows false failures — it reported
`.sec-title` as Roboto when production is correct. The trustworthy check is to read the
compiled CSS out of `dist/browser/chunk-*.js` (search for `.sec-title[_ngcontent`), because
that is exactly what the browser gets. Attempts to rebuild the harness from those literals
were abandoned: splitting the JS string literals mangles quoted font names and silently
invalidates the stylesheet.

### Verification
Dev build green on the final state; production build green (one earlier production run
failed while inlining a Google Fonts stylesheet for `Fraunces`/`Hanken Grotesk` declared in
`src/index.html` — a network fetch, unrelated to this change; the retry passed). Layout
confirmed rendering: 2×2 grid, both new fields present with the requested labels.
**Runtime behind login still unverified** — the operator pass should type into both new
fields, save, reload, and confirm the two root fields round-trip.
