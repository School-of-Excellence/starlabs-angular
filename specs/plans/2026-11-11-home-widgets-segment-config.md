# 2026-11-11 · App widgets + per-segment Home layout (plan, REVISION 2 — APPROVED 2026-11-11)

Revised 2026-11-12 from the operator's answers (questions page https://claude.ai/artifact/CsfA6zLCqx7syVJPtivajo,
ids quoted). Branch `journey-segments-config` (worktree `starlabs-angular-journey-segments`, cut from
`origin/development` @ c22b3acf, staying on development as it is). Nothing is built until this revision is approved.
Commits: ask every time (A4: the global rule wins over this repo's "commit after every piece").
Companion: `breakthroughs-flutter-journey-segments/specs/plans/2026-11-11-journey-segment-home.md`.

## Context
- The Breakthroughs app's Home tab runs on journey segments. Each segment chooses its Home widgets, their order,
  and the colour.
- Everything happens **inside the existing Segment Board** (`/segmentboard`) — no new pages, no menu entries
  (B6).

## Data contract (shared with the app)
```
appwidgets/{autoId}
  widget       string   app name: one lowercase word (a-z, 0-9), the key the app maps (R2)
  displayname  string   what people read here (R2)
  delete       bool     soft delete only

segmentboardconfig/{segmentId}     EXISTING doc, two new fields
  tabwidgets  { home: [appwidgetsId, …] }       array order = screen order
  apptheme    'blue' | 'magenta' | 'purple'      required to save a layout
  saved with updateDoc({'tabwidgets.home': ids, apptheme, updatedAt, updatedBy})
  + a row in segmentboardconfig/{id}/segmenthistory, one writeBatch
```
- Only the Home tab is edited for now (B7).
- The app maps each widget's **app name** to its Flutter widget. Both names can be renamed freely (R2: risk accepted).
- No `_default`, no kill-switch. A profile in no segment or in 2+ segments sees "not configured" in the app.
- Every Segment Board save path must keep `tabwidgets` and `apptheme` (verify; fix minimally if a save rebuilds
  the doc).

## Approach

### S1 · "App widgets" button + dialog (developer role only)
- One button in the Segment Board header, shown only when `guard.loggedinRoles['developer']` (the same check
  `app.component.html` uses for `/routeconfiguration`).
- It opens a `MatDialog` listing `appwidgets` where `delete != true`: name, "used by N segments".
- **Add**: app name (validated: one lowercase word) + display name. A duplicate app name, or a display name that
  differs only by case/spacing, is refused.
- **Delete** (soft, sets `delete: true`): first checks `segmentboardconfig` where
  `tabwidgets.home array-contains <id>`. If any segment uses it, the delete is blocked and those segments are
  listed (R3).
- Rename: either name, any time (R2); the dialog warns when segments use the widget.

### S2 · Colour + Home widgets inside the segment's own New / Edit form (operator, 2026-11-11)
- No separate Home layout dialog or card button (removed). The Segment Board's New / Edit segment form gets:
  - **App colour (required)**: uP! blue / LYL·CPM magenta / B!G purple. The form will not save without it.
  - **Home widgets**: the list in screen order with position numbers, Move up / Move down, Remove, and
    "+ Add widget" from the non-deleted app widgets (display name · app name). Empty list = the app shows
    "Your Home isn't set up yet".
- Saved with the rest of the segment (`saveSegment`, merge): `apptheme` and `tabwidgets: {home: [...]}`; history
  rows record "App colour" and "Home widgets" like any other field.
- Starter layouts (D2): deferred until the widgets are named.

### S3 · Remove what is no longer wanted
- Delete the `/appwidgets` and `/segmentapplayout` routes and pages, the 28-type registry
  (`app-widget-types.ts/.json/.spec.ts`), and the `tsconfig.spec.json` `resolveJsonModule` edit.
- The reusable parts move into the two dialogs: the service, the drag-drop list, and the dirty guard.

### S4 · e2e hooks (repo rule)
- `data-testid` hooks on both dialogs, one prefix each: `awd-` (app widgets dialog) and `shd-` (segment Home
  dialog). Add specs in starlabs-e2e-tests with negative controls: a deleted widget, a widget in use (delete
  blocked), a save without a colour (blocked), and an inactive segment.

## Phases
| # | Deliverable | Done when |
|---|---|---|
| S1 | App widgets dialog (dev only) | Add / soft delete / in-use block work on starlabs-test |
| S2 | Home layout dialog with colour + order + starter layouts | A test segment saves `tabwidgets.home` + `apptheme`; history row written |
| S3 | Old pages, routes and type registry removed | `ng build` OK, no dead imports |
| S4 | e2e hooks + specs + journal | hook-diff clean |

## Risks
- Firestore rules are set in the console: app users need read on `appwidgets`, `segmentboardconfig` and
  `segmentboardlist`, and only admins may write (R7).
- Names as keys: a rename or typo breaks the app mapping, hence the lock in S1.
- Never seed or test against production (`fir-sample-aae4a`). Writing your widget names to starlabs-test happens
  only with your OK.

## Verification
- Unit: the layout save writes the exact shape above; delete is blocked when a widget is in use; save is blocked
  without a colour.
- e2e: add widget → layout (add, reorder, colour) → save → reload; other segment fields untouched.
- Cross-repo: a starlabs-test profile in the segment sees the widgets in the saved order and colour.

## Build log
- 2026-11-12 S1–S3 done (uncommitted): `src/app/app-widgets/app-widgets.service.ts` (+ spec, 8/8),
  `app-widgets-dialog/`, `segment-home-dialog/`; Segment Board header button `sgb-app-widgets` (developer only,
  `store.isDeveloper`), card button `sgb-card-homelayout` opens the dialog; `saveSegment` no longer writes
  `tabwidgets` / `apptheme`. Removed `/appwidgets`, `/segmentapplayout`, the type registry and the
  `tsconfig.spec.json` change. `ng build` (development) OK.
- S4 (e2e specs in starlabs-e2e-tests): hooks are in (`awd-`, `shd-`, `sgb-app-widgets`); specs not written yet.
- 2026-11-12 (operator): colour and widget selection moved into the segment's New / Edit form; the Home
  layout dialog, its card button and the service's layout-save code removed. `ng build` OK, specs 5/5.
- 2026-11-12 Live app preview in the segment form ("Show app preview", "Preview as", phone frame) — app build served
  at /apppreview/ from `src/apppreview` (git-ignored; `scripts/sync-app-preview.sh` builds it from the Flutter
  checkout). Deploys must run the sync first. `ng build` OK.

- 23 Nov 2026: branch fast-forwarded to origin/development 0f342e32 (operator: "merge"). Uncommitted Home-widgets
  work kept as is; no files overlapped. Dev build OK (warnings only); segment board and App widgets dialog checked.
