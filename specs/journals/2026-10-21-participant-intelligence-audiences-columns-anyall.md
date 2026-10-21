# 2026-10-21 — Participant Intelligence: creator names, column layout memory, product rules AND/OR

Branch `charan-release`, uncommitted. All code in `participant-intelligence.component.ts` + its unit spec.

## What changed and why

| # | Change | Why |
|---|---|---|
| 1 | Manage audiences "Created by" shows a name (`profile_data.name`), "You" for the signed-in user, "Unknown" if the profile is gone, "—" if never recorded. | `searchquery.createdby` holds a profile id; the dialog printed it raw. One `profileid in [...]` query per 30 creators, at audience load. |
| 1b | New lists write `createdby` too. | Lists never recorded a creator, so the column was always "—". Old lists stay "—". |
| 1c | "Update with current filters" no longer rewrites `createdby`. | `persistAudience` wrote the current user's id on every save, so updating someone's filter made you its creator. Only a new save (`isNew`) writes it now. |
| 3 | Column layout (shown columns, order, pins) saved to `localStorage['pi.columnLayout.v1']`, restored on load; unknown keys dropped, `name` always kept. | Asked for pins only, but the table defaults to just `name` and nothing persisted the column set, so remembered pins on columns that aren't shown after reload would do nothing. Per-browser, per-viewer; guarded for SSR / blocked storage. |
| 4 | Consumed / Unconsumed product rules get a "Match all / Match any" switch (shown with ≥2 rules). Saved as `pifilter.consumedMatch` / `unconsumedMatch` (`'all'` default). | Rules of one kind were always AND'd. The two kinds stay AND'd with each other. Chips read "Consumed (any) …"; `filterSignature` includes the mode only when ≥2 rules apply, so a 1-rule filter isn't flagged modified. Old analytics ignores `pifilter`, no conflict. |

## Round 2 (same day, operator answers)

| # | Change | Why |
|---|---|---|
| 5 | Toolbar menus (audiences, columns, checklists, export) get `pi-menu`: panel max-height `100vh − 96px`, scrolls inside; audience footer sticky; the two Columns lists share the leftover height. | Material caps a menu at `100vh − 48px` but these open ~50px down, and the audience / checklist lists had no limit, so they ran off the bottom. |
| 6 | "Set as default" and "Toggle live" removed (button, store method, `isDefault` field, menu star). | Operator: remove. Both were local-only and lost on reload. The `Live` badge stays (it reads real data). |
| 7 | "Update with current filters" (Manage audiences + switcher) asks first: Saved now vs After update, removed chips struck red, added green, note if nothing changes. `filterDiff` compares chip labels. | Operator: confirm and show before / after. |
| 8 | Delete is a soft delete: `isdeleted: true, deletedby, deleteddate` on the doc (`searchquery` / `participant list` / `segments`), skipped on load; asks to confirm first. | It was local-only (came back on reload). Soft so it can be restored in Firestore. Round 3 made every other reader skip it (below). |
| 9 | Pipelines dialog (toolbar "Pipelines"): pick saved filters → one column per filter (picked order), header name + count, names only; All / In every pipeline / Not in every pipeline (in some but missing from one, shown under the ones it is in); name search; unique-name total. Nothing stored. Plan: `specs/plans/2026-10-21-pi-pipelines.md`. | Operator: one-time view, names only, filter matched-in-all vs not. "every"/"not every" are disabled below two pipelines. |

## Round 3 — soft delete everywhere, plain checkboxes

| # | Change | Why |
|---|---|---|
| 10 | Every other reader of `searchquery` / `participant list` / `segments` treats `isdeleted: true` as **deleted**: listing reads skip it, by-id reads (`getDoc`, `exists()` checks) treat it as missing. Files: participants-analytics (saved filters + default search falls back to the plain search if its default was deleted), manage-participantlist / create-segments / create-participantlist dialogs, dynamic-queue-manager-clone, queue-planning, queue-planning-clone, queue-planning-review, QueueWebVerison1 (participant app), planning-tab, events-stage-data. | Same behaviour as the old hard delete (code already tolerated missing docs), so a segment / queue plan pointing at a deleted list just ignores it. Client-side filter, not `where('isdeleted','!=',true)` (that drops docs without the field). |
| 10b | NOT changed: write paths (queue manager pruning a profile from a list, segment-board id remap of saved filters, the old dialogs' own hard deletes). | A restored doc stays consistent. Old screens still hard-delete with their own buttons. |
| 10c | Check inlined per file, no shared helper. | `src/app/shared/**` is crossCutting in `suites-manifest.json` — one helper there would fan out to every suite. |
| 11 | PI filter checkboxes are plain: click = tick / untick. Clicks never exclude. An exclusion an older saved filter carries still applies, shows (red cross), and a click clears it. | Operator: no include/exclude cycle. Engine keeps exclude support so older saved filters don't silently change. |
| 12 | ~~Per-section Include / Exclude switch~~ — built, then replaced by #13 the same day (operator: "include and exclude for each option"). | — |
| 13 | Every option row (checkbox sections + uP! attendance) has labelled **Include** / **Exclude** pills at the right; the label is the Include target. Outlined until set, Include filled blue, Exclude filled red (label struck red). Clicking the active pill clears it; the other switches the option over. Hooks: row `pi-filter-option` / `pi-filter-up-status` (now a `div`), pills `pi-filter-option-include/-exclude`, `pi-filter-up-status-include/-exclude`. | Operator wanted both actions visible per option instead of the hidden click cycle. A first version with two bare ✓ / ✕ boxes was rejected ("not resembling include and exclude"), so the pills carry the words. Saved filters unchanged (`field` + `exclude.field`). |

e2e (round 3): changed screens in the **queue**, **profiles** (participants-analytics) and **events** suites need their affected suites run before push; new hooks `pi-filter-option-include/-exclude`, `pi-filter-up-status-include/-exclude` (PI suite).

Revert round 3: `git diff` each file listed in #10 and drop the `isdeleted` lines (each carries the comment "soft-deleted (isdeleted, set by Participant Intelligence) counts as deleted" or sits next to it); #11–#13: restore the two option-row `<button class="opt">` blocks (section options + uP! attendance), `cycle` / `cycleHint` (`nextExc = st === 'in' ? [...exc, value] : …`) in place of `setOption`, and the `.opt` / `.box` CSS (`.opt.in .box`, `.opt.out .box` instead of `.pills` / `.pill.inc` / `.pill.exc`).

## Round 4 — pipelines: unique names + communication

| # | Change | Why |
|---|---|---|
| 14 | With ≥2 pipelines, **In every pipeline** / **Not in every pipeline** switch the board to one list of **unique** names (each person once, A–Z; "not in every" also tags which pipelines they're in), with a checkbox per row + select-all. Footer: "N selected" + a **Communication** menu (Email, WhatsApp, In-app notification, Wati messages, Broadcast, Wati configuration — same as the table's bulk menu). "All names" keeps the columns. `uniquePipelineNames` (pure, tested). | Operator: those two views should give unique names they can select and message. |
| 15 | The communication handlers (`composeEmail`, `composeWhatsapp`, `notify`, `sendWatiMessages`, `broadcast`, Wati config) take an explicit `people` (default: the table selection, so the bulk bar is unchanged); the dialog sends through `sendCommunication(action, people)` passed in its data. Counts in the snack now use the people captured when the composer opened. | Every handler read `store.selectedParticipants()` = **table filter ∩ selection**, so people picked in pipelines but outside the table's current filter would have been silently dropped. |
| 15b | Only the ticked people **in the list shown now** (after mode + name search) are sent to; ticks survive switching views. | Same rule as the table (shown ∩ selected): nobody hidden is messaged. |

Hooks (PI suite): `pi-pipe-unique`, `pi-pipe-select-all`, `pi-pipe-unique-row`, `pi-pipe-unique-check`, `pi-pipe-selected`, `pi-pipe-comm`, `pi-pipe-email`, `pi-pipe-whatsapp`, `pi-pipe-notify`, `pi-pipe-wati-messages`, `pi-pipe-broadcast`, `pi-pipe-wati-config`.

Revert round 4: drop `uniquePipelineNames`, `CommAction` / `PipelinesData`, the dialog's unique list / selection / menu / `send`, `sendCommunication`, and the `people` params (handlers back to `this.rawSelected()` / `this.store.selectedParticipants()` / `selectedCount()`); `openPipelines` back to no data.

## Round 5 — Product subscription filter (plan: specs/plans/2026-10-21-pi-product-subscription-filter.md)

| # | Change | Why |
|---|---|---|
| 16 | Rail section **Product subscription**: one product + the 8 Subscription relations + a From–To range. Chip "<product> · <relation>: <range>". Saved under `pifilter.productSubscription` (analytics ignores it). | Operator: filter on a product's own subscription start / end, from `participantsproduct`. |
| 17 | Data: `participantsproduct where productref == products/{id}` (the query export-with-filters and 4 other screens already run — no new index), loaded once per product on demand and cached; also for saved filters that use it, so their counts / pipelines are right. Refresh clears the cache. | Same on-demand pattern as Confirmed events; the collection is big, so never loaded whole. |
| 18 | Match = any of the participant's docs for that product fits; profile ids collected in a Set (**deduplicated** — someone holding the product twice counts once). "Not active in the range" instead needs **every** dated doc inactive. Docs with status cancelled / shifted (any case, both spellings exist) are dropped; docs without dates never match. | Operator: dedupe profileid; exclude cancelled + shifted. "Not active" by any-doc would match someone whose current copy is active because an old copy expired. |
| 19 | Until a product's docs load, the filter matches nobody (rail shows "Loading…"), and a saved filter using it counts as pending (null). After load the rail shows "N participants with this product in the range (each counted once)". | Never show "everyone" for a filter that isn't applied yet. |

| 20 | Operator follow-up: removed the "N participants … (each counted once)" line and the long explanation under the section. "Match subscriptions that…" (both Subscription dates and Product subscription) now has an ⓘ and a hover tooltip listing every option in words plus how the range is read; the product one also carries the moved explanation (cancelled / shifted ignored, dedupe, "Not active" rule). | Less text in the rail; the explanation is on demand. |

| 21 | **Range in the Firestore query** (operator: the per-product load pulled thousands of docs and slowed the screen). `productSubscriptionQuery` maps each relation to one ranged field: start/within/start-in-end-after → `subscriptionstart` in From–To; end/start-before-end-in → `subscriptionend` in From–To; throughout → `subscriptionstart <= end of From`; any time → `subscriptionend >= From` (or `subscriptionstart <= To` with no From); not active → no bound (must see every doc). Bounds are local whole days. `productSubscriptionMembers` re-checks every returned doc, so a loose bound never changes the result. Nothing loads until a product **and** a date are set; cache is per product + relation + range (`productSubscriptionKey`). | Firestore allows the equality on `productref` plus a range on one date field per query; the second condition can't be pushed down, so it stays a browser check. Status stays a browser check too (mixed case). Operator confirmed the dates are always Timestamps, so a Timestamp range finds them all. |
| 22 | Two composite indexes added to `firestore.indexes.json`: `participantsproduct (productref ASC, subscriptionstart ASC)` and `(productref ASC, subscriptionend ASC)`. **Not deployed** — needs `firebase deploy --only firestore:indexes` per project (that file is the e2e project's; prod indexes may be console-managed). Until then the query fails with failed-precondition and the section says "This filter isn't available yet: its Firestore index hasn't been deployed." (operator chose an error over a full-load fallback). A failure isn't retried until Refresh. | Avoids silently falling back to the heavy load. |
| 23 | "Active throughout", "Active at any time" and "Not active in the range" stay, with "Loading… this option checks most of the product's records, so it may take a moment." | Operator: keep them with a note; their bound is one-sided (or none). |

| 24 | Product picker is a **searchable** Material autocomplete (type to filter; shows the picked product's name when not searching). Both "Match subscriptions that…" dropdowns (Subscription dates + Product subscription) are Material selects whose **options each show their explanation on hover** (`RELATION_HELP`, tooltip on the right); the label's ⓘ + full-guide tooltip (#20) was then removed at the operator's request, so the per-option tooltips are the only help. Panels use `pi-select-panel` (13px, compact). | Operator. A native `<select>` can't search and its options can't show tooltips. No e2e spec drove the old selects. |

Hooks (PI suite): `pi-filter-psub-product` (+ `-product-search`, `-product-option`), `-relation` (+ `-relation-option`), `-range`, `-from`, `-to`, `-loading`, `-error`, `-clear`; `pi-filter-sub-relation` (+ `-relation-option`). Unit spec 137/137.

Revert round 5: remove `ProductSubscriptionFilter` / `ProductSubscriptionDoc` / `productSubscription` (model, `emptyFilter`, `filterTouched`, `filterSignature`, chips, `removeChip`, `mapSavedFilter` + `productSubscriptionFilter`, `persistAudience`), `productSubscriptionActive` / `productSubscriptionMembers` / `toProductSubscriptionDocs` / `matchesWindow` (fold back into `matchesSubscription`), the two lines in `applyFilters`, `loadProductSubscriptions` (data + store), `productSubscriptionQuery` / `productSubscriptionKey` / `HEAVY_PRODUCT_RELATIONS`, `productSubDocs` / `productSubErrors` / `productSubLoading` / `productSubRequested`, the two indexes in `firestore.indexes.json` + the effect + the `audienceCounts` pending check, the `productSub` rail section and its handlers.

Gotcha: a saved filter on *Confirmed* events counts only once those events' approved requests are loaded (same as `audienceCounts`), so its pipeline column can be short until then.

## Checks
Unit spec 127/127 after round 4 (all unit specs 2130/2130 after round 3) (round 1: all vs any, kinds stay AND'd, chips + signature, saved-mode mapping; round 2: filterDiff, pipelineColumns all / every / notEvery / duplicates). `tsc -p tsconfig.app.json` 0 errors. Dev build OK. Not checked in the browser: the route needs a sign-in.

## e2e
Hub `profiles/participant-intelligence.spec.ts`:
- PI-05 rewritten for the Include / Exclude pills; every other case includes via the Include pill.
- PI-13 goes through the new confirm step.
- New cases: PI-18 match all / any, PI-19 pipelines, PI-20 confirm diff (removed / unchanged), PI-21 product
  subscription (its own PSUB-* people, so `productsdata_to_pmd` cannot rewrite the PI six's products) and
  PI-22 soft delete.
- PI-ADDR3 registers the rest.
Why the seed looks that way: hub `specs/journals/2026-10-21-participant-intelligence-pipelines-psub.md`. Not
covered: column layout memory, creator names, and the soft-delete readers on other screens (their suites run,
but no case seeds a deleted list).

## Revert guide (per screen)
- Item 1: in `loadAudiences` drop the `profileNames` block and set `createdBy` back to `data['createdby'] ?? '—'` / `'—'`; remove `createdby` from `persistList`; remove the `isNew` param from `persistAudience` (and the `, true` in `saveCurrentAsAudience`).
- Item 3: delete `COLUMN_LAYOUT_KEY` / `readColumnLayout` / `writeColumnLayout`, the `savedLayout` field and the first `effect` in the store constructor.
- Item 4: remove `RuleMatch`, `consumedMatch` / `unconsumedMatch` (model, `emptyFilter`, `filterTouched`, `filterSignature`, `mapSavedFilter`, `persistAudience`, `ruleRows`, `setRuleMatch`, the `.seg` block in the `ruleKind` template), restore the two `for … matchesProductCount` lines in `applyFilters`, and drop the "match all / any" describe from the spec.
- Item 5: remove the `pi-menu` class from the 4 `<mat-menu>`s and the `.pi-menu.mat-mdc-menu-panel` rule in the .css; restore `.menu-foot` (drop sticky) and `.list, .add-list { max-height: 300px }`.
- Item 6: restore from git (`isDefault`, `setDefaultAudience`, `toggleListLive`, the two buttons, the menu star).
- Item 7: delete `ConfirmDialogComponent` / `confirmUpdateFilter` / `filterDiff` / `updatePreview`; the two callers go back to `store.updateAudienceFilter` + snack.
- Item 8: delete `softDeleteAudience`, the `live()` filter in `loadAudiences`, `remove()` in the manage dialog (button back to `store.deleteAudience`). Docs already flagged stay flagged: clear `isdeleted` in Firestore to bring one back.
- Item 9: delete `PipelinesDialogComponent`, `pipelineColumns` / `PipelineMatch`, `audienceMembers`, `openPipelines` and the toolbar button.
