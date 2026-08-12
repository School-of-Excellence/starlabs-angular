# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-12 (Ads: Enable Wati per-day schedule in enlarged
dialog)_ · **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-06-ads-auto-notification.md` (ads feature, 4
rounds) and `specs/journals/2026-08-11-newusers-workshop-filter.md` (6
rounds on the New Users screen).

## Current state
- Branch `nanda-development`, tree clean at HEAD `db185c76`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). Not pushed/deployed.
- Ads dialog (`/eiflixhomeconfig` → Ads tab, now 1100px/94vh in ads mode):
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

## Last session changes (2026-08-12, why)
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
