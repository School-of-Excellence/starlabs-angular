# 2026-09-24 — Participant Intelligence: collapse into a single component + cleanup

## CHANGE LOG & REVERT GUIDE

All uncommitted. The feature folder was never committed on this branch. The original multi-file version is in commits `f54adbdc`..`5f2c49ec` (other branches) and in `origin/joshua-development`.

| # | Files | Change |
|---|-------|--------|
| 1 | `src/app/Participant Intelligence/participant-intelligence/` | ~30 files (models, core, data, 8 dialogs, 8 child components) merged into one `participant-intelligence.component.ts`. `.html` and `.css` stay as the page's template and styles. The child components' `.html` and `.css` are inlined as `template` and `styles`. |
| 2 | `auth-only.guard.ts` | Deleted at the operator's request. The route uses the standard `authGuard`, so the screen needs a `dashboard` route-config doc like every other route. |
| 3 | `src/app/app.routes.ts` | `loadComponent` path updated; `canActivate: [authGuard]`. |
| 4 | `participant-intelligence.component.css` | The theme was folded into the component CSS and `theme.css` deleted; `angular.json` is untouched. The `--pi-*` tokens sit on `:host` plus `::ng-deep .cdk-overlay-container`; the dialog and menu rules use `::ng-deep .pi-dialog …` / `.pi-comms-menu`. `.pi-badge` moved into the manage-audiences dialog. The `.material-symbols-rounded` class was dropped because the Google Fonts stylesheet in `index.html` already defines it. On this branch the theme had never been loaded, so the screen was missing its colour tokens until now. |
| 5 | `REMOVED-FEATURES.md`, `data/mock-participant-data.service.ts` | Deleted. The ledger only described the commented-out export/import block, and the mock service had no references. |

**Revert:** restore the folder from `origin/joshua-development:src/app/Participant Intelligence/`, then undo rows 2–4.

## Cleanup done in the merged file
- **Removed dead code:**
  - the commented-out export/import block
  - `columnMap`, `ColumnState`, `countActiveFilters`, `setFilter`, `selectIds`, `avatarHue`, `trackById`
  - the unused `Participant` fields `eiflix` / `solarvoice` / `generalcontent`
  - `ReferenceData.supportCategories` and `ChecklistDef.group`
  - the `'export'` and `'checklist'` bulk actions (nothing emits them)
- **Data service:** the abstract `ParticipantDataService` with its single Firestore subclass became one concrete `ParticipantDataService`.
- **Format fixes:**
  - legacy `[ngSwitch]` / `*ngSwitchCase` → `@switch`
  - `CommonModule` → `DecimalPipe`
  - redundant `standalone: true` removed (it's the Angular 19 default)
  - all `styles` in one form, and the inlined templates indented
  - imports grouped
  - `@for` over non-unique names now tracks `$index`
- **Duplication:** 4 copies of the id→name map were replaced by one `toNameMap()`.
- **Consistency:** every dialog opens through `dlg()`, so they all resolve this screen's store.
- **Bug:** "Extend subscription → duration" computed from a hard-coded `2026-06-16`. It now counts from today.
- **Copy:**
  - the broadcast note said "UI prototype on mock/test data"; it now says delivery isn't wired up
  - `console.log` on the upload error → `console.error`
- **Page CSS:** removed the unused `.tbtn.icon-only`, a redundant `.tbtn.active .pill` rule, and a duplicate font in the stack.

## Why
The operator asked for "a single component" and clarified: no sub-folders, everything in the `.ts`. Dialogs and menus render in the CDK overlay, outside the component's scoped styles. Their rules therefore use `::ng-deep`, scoped by the `pi-dialog` / `pi-comms-menu` classes, so nothing leaks into other screens. Once the component has loaded, these rules are global, same as the old global theme.

## Notes
- Angular's template compiler needs child components (and the types their templates use) to be **exported**, even from the same file (TS-993004 otherwise).
- Verified with `tsc --noUnusedLocals` (clean) and `ng build --configuration development` (clean). The screen was not viewed logged-in, because the dev environment points at production.

## Fixes: product activity counts + subscription extension (same day)

Both fixes were ported from `participants-analytics.component.ts`, the screen that works.

| # | Change | Revert |
|---|--------|--------|
| 6 | **Consumed/unconsumed count filter.** Both rules read the single `productcount` field, so "consumed" behaved like "unconsumed". They now count how often the product appears in `consumedproducts` / `unconsumedproducts`, as `participantProductMap` does in the old screen. The now-unused `Participant.productcount` was removed. | Restore `p.productcount[rule.productId]` in `matchesProductCount`. |
| 7 | **Extend subscription.** It only updated local state and never wrote to Firestore. Earlier today I also mis-fixed it to count from today. It now matches the old `addSubscription`, per selected participant: the doc is `purchaseref` (active) or `lastsubscribedpurchaseref` (non active), and other statuses are skipped and counted in the snackbar. The current `participantjourneyproduct` doc is copied to `subscription extend log` with `extendreason`. `subscriptionend` is set to current end + N months, or the chosen date at 23:59:59.999, with `extendreason` and `journeystatus` (`completed` if the new end is in the past, otherwise `ongoing`). | Remove `extendSubscriptions`, `extendedEnd`, `subscriptionPurchaseId`, `SubscriptionExtension`. |

**Why the old model:** the subscription lives on `participantjourneyproduct`, not on `participant metadata`. The metadata copy is derived from it, so writing only the metadata, or only local state, has no lasting effect.

**Not ported:** the old dialog warns when a fixed date is earlier than a participant's current end (`profilesNeedAttention`). Here that participant's subscription is simply shortened to the chosen date.
