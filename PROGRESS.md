# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-11 (New Users: Excel import-select · tags
Include/Exclude)_ · **New session? Read `specs/ORIENTATION.md` first**,
then `specs/journals/2026-08-11-newusers-workshop-filter.md` (6 rounds on
the New Users screen) and
`specs/journals/2026-08-06-ads-auto-notification.md` (ads feature).

## Current state
- Branch `nanda-development`, tree clean at HEAD `d821d721`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). Not pushed/deployed.
- Ads dialog (`/eiflixhomeconfig` → Ads tab): full auto-notification
  feature (autonotification → notifyto audiences incl. journey/funnel
  pickers → pinned start/end dates → enableappnotification →
  per-day appnotificationmap).
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

## Last session changes (2026-08-11, why)
- Excel import-select (`a6254e59`), review fixes (`464c67b7`): matches
  computed before clearing selection; toolbar wraps (1366px clip risk);
  detached input retained; non-email values ignored and reported.
- Tags Include/Exclude (`ffd790a7`), refinement (`d821d721`): Exclude
  flips mode to Match any so the default complement is "none of these
  tags", matching the workshop filter's semantics.
- All rounds adversarially verified by 3-lens workflows; every fix above
  traces to a verified finding. Accepted nits documented in the journal.

## Pending
- Operator Chrome pass on the New Users screen (filters, import, export)
  and the Ads dialog, then push/deploy when asked.
- Consumer of the ads notification fields (sender job) is not in this
  repo — admin UI only writes the schedule.
- Carried: phase-2 dashboard perf (scope/cache participant-metadata scan;
  bound event-wide changework / videoask-tag streams); revert one word in
  `main.ts` (firestore-atc transport) if a venue ever blanks ATC screens.
- `graphify` module not installed here — graph stale until `/graphify .`.
