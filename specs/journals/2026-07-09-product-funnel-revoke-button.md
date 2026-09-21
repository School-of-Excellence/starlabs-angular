# 2026-07-09 — Product funnel: add "Revoke" action (cancel product → auto-open bulk-add to re-assign)

**Screen:** Product funnel (`<app-product-funnel>`), embedded in the routed `event-participation-confirmation` page.
**Files:**
- `src/app/Events/event-participation-confirmations/product-funnel.component.ts`
- `src/app/Events/event-participation-confirmations/product-funnel.component.html`

## What changed
Added a **Revoke** action alongside the existing Mark attended / Mark not attended controls (attendance mode).

New method `markRevoked(rows)` (added right after `markUnattended`, ~line 955) is a **near-clone of `markUnattended`**. It performs the identical 4 writes in one `writeBatch`. The request write additionally stamps audit fields **`revoked_by`** (the logged-in **profile id** — `(this.guard.loggedinProfile as any)?.['profileid'] ?? null`, NOT the auth uid) and **`revoked_date`** (`serverTimestamp()`). Field-level diff vs unattended:

| Collection | Operation | markRevoked | markUnattended |
|---|---|---|---|
| `event participation request` | update | `status = 'revoked'` + `revoked_by` + `revoked_date` | `status = 'unattended'` |
| `events_profiles` | **delete** (profile_ref + event_ref match) | same | same |
| `participantsproduct` (via deliverable's `participantproductid`) | update `status = 'cancelled'` | same | same |
| `deliverables` | update `status = null` | same | same |

**After a successful commit** (guarded by a `committed` flag so it never fires on error/cancel), it **auto-opens** the shared `BulkAddProductsComponent` dialog pre-loaded with the revoked profiles and **this event's product** — `data: { participants: [{profileid, name, email}], productrefId: this.arena?.['productref']?.id }`, `width:'70vw'`, `disableClose:true`, `panelClass:'sx-dialog-surface'`. On dialog close it reloads via `loadData()` while preserving `selectedDeliverySet` / `selectedQueueVariation` — same pattern as `assignProduct` / `assignImportNoProduct`.

New getter `get selectedToRevoke()` = `this.selection.selected.filter(r => r.isApproved)` (identical set to `selectedToUnattend`; kept separate for clarity).

**HTML (2 buttons):**
1. Bulk toolbar (attend mode, after the "Mark N not attended" button): `Revoke {{ selectedToRevoke.length }}` (icon `block`, class `sx-danger`, disabled when 0 selected) → `markRevoked(selectedToRevoke)`.
2. Per-row (attend mode, after per-row "Not attended"): `Revoke` (class `sx-mark-danger`) → `markRevoked([row])`.

## Why
- Operator wants a distinct terminal status `revoked` (vs `unattended`) so revoked participants are distinguishable in the DB, while still cancelling the product / clearing the event profile + deliverables exactly like unattend.
- The differentiator of Revoke over Unattend is the **re-assign flow**: cancel their old product, then immediately hand off to the existing bulk-add dialog to create a fresh product. Decisions confirmed with operator: (a) offer **this event's product** (`productrefId = arena.productref.id`, locks the dialog dropdown), and (b) **auto-open** the dialog after revoke (single continuous flow) rather than a separate button.
- Reused the already-imported `BulkAddProductsComponent` and the established `assignProduct` open-pattern — no new imports, no new dependencies.

## Behavioral note / risk
- Same product-cancel gap as unattend/event-approve: a request with a product **but no deliverable** won't have its product cancelled (cancel is driven off the deliverable's `participantproductid`). Accepted for parity.
- No read path yet renders `status: 'revoked'` as its own segment/label. Revoked rows are terminal and simply drop out of the live buckets (the funnel query only pulls `['requested','approved','attended','unattended']`, so `revoked` rows are excluded from the funnel entirely, like any non-listed status). If a visible "Revoked" segment is later wanted, add it to the segment machinery the way `unattended` is handled.
- Writes are one atomic `writeBatch` (unlike the queue-manager-clone's sequential updates).

## Revert guide (per-screen)
Two files, self-contained. To fully remove the Revoke feature:
1. **`product-funnel.component.ts`** — delete the `get selectedToRevoke()` getter and the entire `async markRevoked(rows)` method (the block between `markUnattended` and `finalizeAttendance`, headed by the comment `// ---- Revoke (destructive) ...`).
2. **`product-funnel.component.html`** — remove the bulk `Revoke {{ selectedToRevoke.length }}` button (in the `selectionMode==='attend'` toolbar, right after the "Mark … not attended" button) and the per-row `<button ... (click)="markRevoked([row])">Revoke</button>` (right after the per-row "Not attended" button).
No other file, shared component, route, or collection schema changed. `BulkAddProductsComponent` was already imported and used by `assignProduct`, so no import cleanup needed.

## Update (same day) — "Revoked" now a first-class funnel segment
Added a **Revoked** count/segment mirroring `unattended` end-to-end so revoked rows are counted and browsable (previously they dropped out of the funnel entirely).

**`product-funnel.component.ts`:**
- `SegmentKey` union += `'revoked'`; `PRow` += `isRevoked: boolean`.
- `cards[]` += `{ key:'revoked', label:'Revoked', cls:'rv', ... }`; `funnelTree` attendance panel += `{ key:'revoked', depth:1 }`; `computeSplits` keys += `'revoked'`; `counts` init += `revoked:0`.
- `loadData`: EPR query status filter += `'revoked'`; new `revokedIds` set populated from `status=='revoked'` rows; treated **terminal** exactly like `unattendedIds` (deleted from `requestedData`, `approvedReq`, `attendedIds`; added to the `ids` set). Introduced `const isTerminal = isUnattended || isRevoked` and swapped the per-row bucket gating from `!isUnattended`/`isUnattended?` to `isTerminal`. Row gets `isRevoked`; `reason` for revoked = `'Revoked — product cancelled'`. `counts.revoked = rows.filter(r=>r.isRevoked).length`.
- `matchesSegment` += `case 'revoked': return r.isRevoked;`.

**`product-funnel.component.html`:** added a per-row Revoked label (`segment==='revoked'` → `block` icon + "Revoked · product cancelled") and added `&& segment!=='revoked'` to the generic status-column `*ngIf`.

**Revoked-by / date display:** `PRow` += `revokedBy: string` (resolved display name) + `revokedDate: number` (millis). In `loadData` the `status=='revoked'` branch now captures `revoked_by` → `revokedByPid` and `revoked_date` (via `this.toMillis`) → `revokedDatePid`; the row resolves `revokedBy` through `mapProfile[id]?.name` (fallback = raw id), `revokedDate = revokedDatePid.get(pid) ?? 0`. The HTML Revoked label shows `· by {{ row.revokedBy }}` and `· {{ row.revokedDate | date:'d MMM y, h:mm a' }}` (falls back to "· product cancelled" when both absent, e.g. rows revoked before this field existed).

**`product-funnel.component.css`:** added `.sx-bd-row.rv .sx-bd-dot` and `.sx-card.rv` color rules (`#6b3f8a`, purple) mirroring `.un`.

### Revert guide (segment addition)
To remove just the Revoked *segment* (keeping the Revoke button): in `product-funnel.component.ts` drop `'revoked'` from the `SegmentKey` union, `PRow.isRevoked`, the `cards`/`funnelTree`/`computeSplits`/`counts` entries, the `revoked` case in `matchesSegment`, and in `loadData` remove `revokedIds` + the `'revoked'` query value and revert `isTerminal` back to `isUnattended`. In the HTML remove the Revoked `<span>` and the `&& segment!=='revoked'` guard. In the CSS remove the two `.rv` rules. (Note: if you keep the Revoke button but remove the segment, `status:'revoked'` rows will again be invisible in the funnel.)

## Update (same day) — "Approved by journey" journey grouping (persisted per event)
Admins can now combine journeys in the **Approved by journey** card into named groups; grouping is saved to **localStorage keyed by arenaevent id** (`arena['docid']`), so it restores per event.

**`product-funnel.component.ts`:**
- `JourneyRow` += `members?: string[]` + `isGroup?: boolean`.
- New state: `journeyGroups: Record<string,string>` (journey label → group name), `groupEditMode`, `journeyFilterMembers: Set<string>`.
- localStorage: `journeyGroupsKey()` = `'epc_journey_groups_' + arena.docid`; `loadJourneyGroups()` (called at top of `loadData`, SSR-guarded via `typeof localStorage`), `saveJourneyGroups()`.
- **Selection-based editing** (operator wanted: tick journeys → group them → keep multiple groups): state `journeySel: Set<string>` + `groupNameInput`. `toggleJourneySel` / `isJourneySel`, `groupSelected()` (applies `groupNameInput` to all ticked journeys — creates a new group or adds to an existing one), `ungroupSelected()` (removes ticked from their group), `ungroupGroup(name)` (disband a whole group), `existingGroupNames` getter (datalist). `toggleGroupEdit()` clears the pending selection/name.
- New getter `displayedJourneys`: collapses journeys sharing a group name into one aggregated row (summed total/first/repeat, `members` = grouped labels, `isGroup`), ungrouped journeys pass through; sorted by total desc.
- `setJourneyChip`/`setJourneyFr` now take a **`JourneyRow`** (not a key) and set `journeyFilterMembers` = the row's members → **union filtering**. `journeyMatches` checks `journeyFilterMembers.has(label)`. `journeyColor` and the `setSegment` reset updated accordingly.

**`product-funnel.component.html`:** card header gains a **Group** toggle (`workspaces`/`check` icon). Two modes under `splitsReady`: (1) **edit mode** — a group-bar (name input with datalist + "Group (N)" + "Ungroup" buttons) above a checkbox list of raw journeys (`<label>` rows with `.sx-jchk`, current group shown as a `.sx-jgroup-tag`); tick → name → Group; (2) **normal mode** — iterates `displayedJourneys`, group rows show a `workspaces` icon + "· N journeys", click calls `setJourneyChip(j)` / `setJourneyFr(j, …)`.

**`product-funnel.component.css`:** added `.sx-jgroup-btn`, `.sx-jgrp-ic`, `.sx-jmembers`, `.sx-jedit-hint`, `.sx-jedit`, `.sx-jgroup-input`.

Validated with a full `ng build` (AOT templates OK; only pre-existing warnings in unrelated components).

### Revert guide (journey grouping)
Remove the `.ts` additions (JourneyRow fields, the `journeyGroups`/`groupEditMode`/`journeyFilterMembers` state, the localStorage + group methods, `displayedJourneys`), revert `setJourneyChip`/`setJourneyFr` to take a `key: string` and `journeyMatches` to compare `=== this.journeyFilter`, drop the `loadJourneyGroups()` call in `loadData` and the members reset in `setSegment`. In the HTML restore the single `*ngFor="let j of approvedByJourney"` block (calls with `j.key`) and remove the Group button + edit-mode block. Remove the six CSS rules above. **localStorage note:** stale `epc_journey_groups_*` keys are harmless if left behind.

## Update (same day) — Overall requested includes terminal buckets + group participant list

### 1. `overallRequested` now = requested + approved + unattended + revoked
- Getter `overallRequested` and `counts.overallRequested` both extended; `matchesSegment('overallRequested')` now `r.isRequested || r.isApproved || r.isUnattended || r.isRevoked`.
- HTML: card hint/tooltip updated; the overallRequested status column now renders `unattended` / `revoked` instead of mislabelling terminal rows as `requested`.

**Load-bearing bug found & fixed while doing this.** `cohort` was built as `approvedReq.keys() ∪ scanned` *before* terminal ids were stripped. A participant **scanned at the event and revoked afterwards** stayed in `cohort`, so `counts.approved` (= `cohort.size`) counted them even though no row has `isApproved` — and summing the buckets for `overallRequested` would have **double-counted** them. Fix: terminal ids are now also `cohort.delete(p)`'d, making the four buckets genuinely disjoint. `counts.notRequested` additionally guards `!unattendedIds.has(o) && !revokedIds.has(o)`, since terminal owners no longer fall out via `!cohort.has(o)`.
*(This also silently corrected a pre-existing over-count of `Approved` that predates the revoke work — it arrived with `unattended` being made terminal.)*

### 2. Group rows expand to show their participants + journeys
- `product-funnel.component.ts`: `expandedGroups: Set<string>`, `isGroupExpanded`, `toggleGroupExpand(key, ev)` (calls `ev.stopPropagation()` so expanding doesn't also fire the row's filter), `journeyLabelOf(r)` helper, and `groupParticipants(row)` → approved rows whose journey label ∈ the group's members, sorted by name.
- `product-funnel.component.html`: the group row is wrapped in `.sx-jrowline` so a chevron `<button class="sx-jexp">` can sit **beside** the row button (HTML forbids nesting a button in a button — this was the reason for the restructure). Expanding renders `.sx-jmemlist` with one `.sx-jmem` per participant: name (email on hover) + their journey chip; empty-state when none.
- `product-funnel.component.css`: `.sx-jrowline`, `.sx-jexp`, `.sx-jmemlist` (scrollable, max-height 190px), `.sx-jmem`, `.sx-jmem-name`, `.sx-jmem-journey`, `.sx-jmem-empty`.

Validated: full `ng build` (AOT templates) + `tsc --noEmit` clean.

### Revert guide (this update)
- **Overall requested:** revert the getter to `counts.requested + counts.approved`, `counts.overallRequested` to `requestedData.size + cohort.size`, `matchesSegment` to `r.isRequested || r.isApproved`, and the HTML hint/tooltip/status expression. **Keep the `cohort.delete(p)` fix** — it is correct independently of this feature.
- **Group participant list:** remove `expandedGroups`/`isGroupExpanded`/`toggleGroupExpand`/`journeyLabelOf`/`groupParticipants`, unwrap `.sx-jrowline` back to a bare `.sx-jrow` button, delete the `.sx-jmemlist` block and the seven CSS rules.

## Pending
- `markRevoked` still has a temporary `console.log('REVOKE→bulk-add', …)` diagnostic (added while debugging the empty bulk-add dialog — awaiting operator's console output to pinpoint why the dialog opens empty). **Remove once the bulk-add re-assign issue is resolved.**
- Bulk-add re-assign after revoke reported broken (dialog opens empty); root cause not yet confirmed. Not to be fixed by changing bulk-add (operator constraint) — fix must live in `markRevoked`'s passed data.
