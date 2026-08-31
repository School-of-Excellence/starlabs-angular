# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-27 (EiFlix home builder redesign)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-27-eiflixhomeconfig-builder-redesign.md`.

## Current state
- Branch `nanda-development`. UNCOMMITTED working tree: the redesigned
  **eiflixhomeconfig** tab (this session) + earlier uncommitted work
  (Upload Studio under `src/app/content/episodes-dashboard/`,
  newusersprofile, and others — see git status). Operator commits
  manually — standing directive. NOT pushed, NOT deployed.
- `/eiflixhomeconfig` tab 1 ("Create / Assign EiFlix Home") is now a
  two-pane builder: sticky searchable Library rail (Widgets / Home
  Series / Ads, click-to-add) + single-surface Layout list with
  collapsed-by-default expandable rows, sticky Save bar with
  unsaved-changes pill, drag-reorder, segmented Show-To, pill-style
  tags. Prod build passes.

## Last session changes (2026-08-27)
- Full UI/UX rewrite of `eiflixhomeconfig.component.{ts,html,css}` to
  fix the "multiple scroll / unusable" tab: the mat-select multi-picker
  and the stack of always-expanded form cards are gone. Firestore
  read/save logic untouched (same homeconfig shape, ad pairing ≤2 per
  index with adref, seriesref/enabletag/tags, merge write). Removed the
  now-dead `selected` FormControl; added-state derives from items.
- Custom segmented control + custom tag pills instead of
  mat-button-toggle / mat-chip-grid on purpose: avoids Material theme
  tokens the app theme may not emit. WHY details in the 2026-08-27
  journal.
- graphify module not installed in this env — code-graph rebuild
  skipped.

## Pending
- **Operator visual pass** of the redesigned `/eiflixhomeconfig` tab 1
  behind login (Claude verified compile only), then manual commit.
- Carried: operator visual pass + real upload test of
  `/videodashboard[/upload]`; consumers to wire (webactive, payment
  statuses, paired-ads rendering in EiFlix web app); newusertags
  backfill decision; `eiflixcampaign` rules unverified; eiflix register
  backfill + `/eiflixoperationsdashboard` route guard; episode-delete
  gaps (SRT not deleted, delete-dialog Cancel dead).
