# 2026-11-04 — Edit Home Series: per-episode "Copy link"

## What
`/eiflixhomeconfig` → Home Series tab → Edit Home Series: each episode card has a copy icon (before the
remove ✕) that copies `https://eiflix.com/eiflix/play/<eiflixhomeseries id>/<episode id>`.

Files: `New-Workshop/upcomingworkshops/homeseries/homeseries.component.{ts,html,css}`.
Hook: `hom-copy-link` (prefix `hom`, same as the rest of the dialog).

## Why it is shaped this way
- **Edit mode only, and only rows with an episode.** The link needs the saved series doc id. A new series
  has none until Save, and a stored row with no `episoderef` has no episode id, so `episodeLink()`
  returns '' and the button is not rendered. No half-formed link can be copied.
- **Episodes added in Edit but not yet saved still get a link.** The ids are already final (series id is
  the existing doc, episode id is the picked doc), so the link is correct once the user saves.
- **Clipboard:** `navigator.clipboard.writeText` first, CDK `Clipboard.copy` as fallback (older browsers,
  non-secure origins). A snackbar confirms either way.
- No data change — read-only on the two ids already in the form.

## Coverage
Hub `workshops/eiflix-home-config.spec.ts` WS-74 (seed helper `seedHomeSeriesLinkDoc` in
`support/wshop.ts`): a seeded saved series with one real episode row and one row without an episode.
Asserts exactly one button, the exact URL handed to the clipboard, and that the Add dialog shows none.
