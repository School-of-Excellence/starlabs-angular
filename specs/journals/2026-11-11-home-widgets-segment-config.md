# 2026-11-11 · App widget library + per-segment tab layout (build)

Plan: `specs/plans/2026-11-11-home-widgets-segment-config.md` (A0–A3 built, A4 hooks only). Branch
`journey-segments-config`, uncommitted.

## What landed
- `src/app/app-widgets/app-widget-types.{ts,json,spec.ts}` — registry + verbatim copy of `specs/home-widget-types.json` (v2).
- `src/app/app-widgets/app-widgets.service.ts` — `appwidgets` CRUD/archive/seed with `/history` in the same batch;
  live segments with `tabwidgets`; layout save.
- `/appwidgets` (`widget-library/` + `widget-dialog/`, hooks `hwl-` / `hwd-`).
- `/segmentapplayout` (`segment-app-layout/`, hooks `shl-`), `?segment=<id>&tab=home`, canDeactivate guard.
- Segment Board: a "Home layout" button on master segment cards + history labels for the new entry.

## Decisions and why
- **Contract changed mid-build (operator):** library is `appwidgets` (with `tab`), and the layout is a map field on the
  existing segment doc, `segmentboardconfig/{id}.tabwidgets.<tab> = [widgetId…]`. No `segmenthomeconfig`, no theme
  (app derives palette from `journeys[]`), no version, no per-row enabled flag (removing = out of the array). The first
  draft built against `homewidgets` / `segmenthomeconfig` was rewritten, not kept alongside.
- **Save is a field-path `update` of `tabwidgets.<tab>` only** (+ `updatedAt/updatedBy`), with one entry in the board's
  own `segmenthistory` (action `tabwidgets`, `changedfields`, `changes`, `summary`, `updatedat`, `updatedby`) in the
  same batch — other tabs and every board field stay untouched, and the board's History tab shows the change.
- **Board saves don't wipe `tabwidgets` (checked, no fix needed):** edit = `set(..., {merge:true})` of a doc rebuilt by
  `buildDoc()` from known fields only (never contains `tabwidgets`); create = new id; archive/unarchive/order/group
  delete = `update`; id migration copies the full stored doc. Risk to watch: if anyone ever changes the edit path to a
  non-merge `set`, layouts are lost.
- **Registry mirrors the JSON as a typed literal** and a Karma spec deep-compares them. Needed
  `resolveJsonModule` in `tsconfig.spec.json` only (app tsconfig untouched). The JSON copy lives in `src/` because
  `specs/*` is gitignored except plans/journals.
- **Widget type (so tab) is locked after create** — layouts only store ids, and the app resolves type from the doc;
  changing type would silently change what a segment shows.
- **Archive is soft and forced-with-warning**: the confirm lists the segments whose `tabwidgets.<tab>` holds it; the
  ids stay in layouts and the editor flags them ("Archived" / "Missing" / "Inactive"), the app skips them.
- **Seed is idempotent by `type + seed:true`** (archived seeds count, so archiving a seed does not resurrect it).
- **Templates** map each type to the first active library widget of that type (seed first, then oldest); types with
  no widget are reported, not invented.
- **Reorder**: CDK drag (handle per row) and Move up / Move down buttons (disabled at the ends); position numbers and
  the phone preview re-render from the same `ids` array; any move sets the dirty flag; Save writes that array order.
- **Segment Board link** is a `data-homelayout` button in the engine's card footer (master set only) plus one click
  listener in `segment-board.component.ts` that calls `router.navigate` — the engine renders via innerHTML so it can't
  use routerLink, and a plain href would reload the SPA.
- The guard lives in its own file with a type-only import so `app.routes.ts` doesn't pull the component into main.
- `profileId()` copied from the board; cached per uid because the service is a root singleton.

## Pending / manual
- `dashboard` sidenav entries for `/appwidgets` and `/segmentapplayout` via `/routeconfiguration` (starlabs-test first).
- Firestore rules (console, both projects): `appwidgets` (+ `/history`) read for app users, write admins;
  the app must be able to read `segmentboardconfig` (for `tabwidgets`) — check the current rule; writes stay admin-only.
- No-segment fallback layout (plan Q3) has no home in the new contract.
- e2e specs (A4) not written; hooks are in place.
