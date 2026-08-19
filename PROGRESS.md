# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-14 (Evergreen workshop extensions + Extended
timeline · enablesharemessage)_ · **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-06-ads-auto-notification.md` (ads feature, 5
rounds) and `specs/journals/2026-08-11-newusers-workshop-filter.md` (6
rounds on the New Users screen).

## Current state
- Branch `nanda-development`, tree clean at HEAD `1c3c434a`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). Not pushed/deployed.
- Ads dialog (`/eiflixhomeconfig` → Ads tab, 93vw×93vh sectioned layout;
  daily messages render one row per day with App Notification left and
  Wati right):
  full auto-notification feature (autonotification → notifyto audiences
  incl. journey/funnel pickers → pinned start/end dates →
  enableappnotification → per-day appnotificationmap → **enablewati →
  per-day watimap**: searchable WATI template select per day (classify/
  wati `101723` config, UTILITY templates, Load/Reload), variables from
  the template's customParams each mapped static (single-line text) or
  metadata (only `name` for now), reconciled on template load).
- New Users screen (`/newusersprofile`):
  - Workshops filter (tags-style menu) with Funnel-only (default ON,
    evergreen configs) + Include/Exclude toggles; Workshop table column
    + export column in include mode only; per-workshop cached enrolled
    reads, fail-closed on errors.
  - Tags filter now also has Include/Exclude (Exclude auto-sets Match
    any; resets to Include on clear).
  - Import button (after Tags): Excel with A1 header `email`, mails from
    row 2 → replaces selection with matching profiles; snackbar reports
    matched/missing/hidden/ignored; zero-match leaves selection intact.

## Last session changes (2026-08-14 + 08-12, why)
- Workshop dashboard evergreen extensions (`1c3c434a`): Completed panel
  rows extend instead of navigating (arrayUnion of
  {extenduntill 11:59pm, created now} into
  evergreenaccessto.extendworkshop on the participant workshop doc);
  Extended node (amber, active/lapsed tooltip) holds extension-history
  users exclusively; premium timeline dialog with per-user history and
  Extend again (min = day after current extenduntill while active — no
  silent shortening). See
  `specs/journals/2026-08-14-evergreen-extend-workshop.md`.
- Workshop config Settings→General (`74d40984`): Enable Share row now
  expands (Test Mode pattern) with a Share Message textarea → string
  field `enablesharemessage` on the workshopconfiguration doc.
- Ads dialog redesign (`2ba1543e`): 93vw×93vh, sectioned layout (Ad
  Content / Display / Audience & Schedule / Daily Messages / Images),
  per-day rows with app+wati columns side by side. Template/CSS only —
  form model and payload untouched; `scheduleDays` iterates indices over
  the always-equal-length maps. Review fixes: sect-head flex-wrap
  (mobile overflow), empty day-list removed, lone column capped 980px.
- Ads Enable Wati (`db185c76`): watimap sized by the same day-count
  resize as appnotificationmap; searchable per-day template select
  (ngx-mat-select-search, shared search reset per open; current value
  stays selectable when filtered/unloaded); static values are forced
  single-line (WATI rejects newlines); review-driven: hydrated variable
  rows reconcile against freshly loaded templates (same-named values
  survive), setControl re-applies disabled state, static text survives a
  metadata round-trip. Review regressions lens confirmed comingsoon mode
  untouched. Accepted nits in the journal.
- Prior day (2026-08-11): New Users Excel import-select + tags
  Include/Exclude — see the newusers journal.

## Pending
- Operator Chrome pass on the New Users screen (filters, import, export)
  and the Ads dialog, then push/deploy when asked.
- Consumer of the ads notification fields (sender job) is not in this
  repo — admin UI only writes the schedule.
- Carried: phase-2 dashboard perf (scope/cache participant-metadata scan;
  bound event-wide changework / videoask-tag streams); revert one word in
  `main.ts` (firestore-atc transport) if a venue ever blanks ATC screens.
- `graphify` module not installed here — graph stale until `/graphify .`.
