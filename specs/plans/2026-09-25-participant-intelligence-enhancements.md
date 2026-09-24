# Participant Intelligence enhancements — APPROVED plan (2026-09-25) — BUILT 2026-09-25, see specs/journals/2026-09-25-participant-intelligence-enhancements.md

## Flag list (NOT building — report back after final build)
1. **B!G Accelerator count** (#1 column, #11 filter). There's no B!G product-id list; the options are a product list vs attended `B!G`-model events. uP! and CPM counts/filters still get built.
2. **Active vs non-active segments** (#9, all parts: active/non-active split, one active segment per person, active-segment column). Operator has other plans for segments. Open question was how to define "active": manual flag / running queue / live list.
3. **"Not in package" filter** (#7). Participants who don't have product X. Open question: is "package" only `activeproduct`, or does it also include addons/gifts/bonus?

4. **Tag disabling** (#16). To discuss, choose one of:
   - (a) only mark inactive (the current analytics soft delete: `isActive=false`, participants keep the tag),
   - (b) inactive + remove from every participant's `profiletags` (bulk write + log; re-enable can't restore without the log), or
   - (c) inactive only, but everywhere tags are read (filters, table chips, pickers, signals, exports), check `isActive` so inactive tags are ignored. Reversible and needs no bulk write.
   Current behaviour: `tag-participants.component.ts:180-196` (soft delete), `:138-155` (re-create reactivates by name). The new screen has no delete/disable yet.

## Decisions
- **#8 Finance columns:** Purchase value (`pp_totalpurchasevalue`), Paid (`pp_totalpaid`), Balance (value − paid), Payment plan (`paymentplan`). They're optional columns in the column picker, visible to **everyone** (no role gating).
- **#1/#11 uP! + CPM counts:** optional columns + "at least N" filters. Count = consumed occurrences of the analytics engine's `UP_LIVE_PRODUCT_IDS` (3) / `CPM_PRODUCT_IDS` (4).
- **#10 New vs already uP!:** filter New (uP! count = 0) / Already attended (≥ 1). Based on consumed products (option A), not event attendance.
- **#2 Count after filtering:** keep the existing topbar "X of Y participants"; add a live match count on each saved filter / list in the audience menu.
- **#3 Search saved filters:** search box at the top of the audience menu (saved filters, lists, segments by name).
- **#4 Filter-panel search:** one search box at the top of the panel. It hides non-matching options in every section and opens only sections with matches; clearing restores the previous open state. Plus a Collapse all / Expand all button; per-section toggles stay.
- **#5 Edit saved filters:** Manage audiences gets Rename + "Update with current filters", both writing the existing `searchquery` doc (shared with the analytics screen). Names must be unique **within their own type** (option a), compared case-insensitively and ignoring spaces at the ends; this blocks create and rename.
- **#12 Event filter:** status choice. **Attended** = `participant metadata.productevent` ({productId: [attended eventIds]}), same as analytics, with no extra reads. **Confirmed** = `event participation request` with `status == 'approved'` (new; analytics doesn't have it), read on demand only for the selected events (`eventref in [...]`, batches of 30), cached per session and cleared by Refresh.
- **#13 Age filter:** min/max age from `dateofbirth`; participants without a date of birth are excluded when a range is set.
- **#14 Journey column:** same as the analytics `journeyForParticipant`: active → `activejourney`, non active → `lastcompletedjourney`, discontinued → `lastsubscribedjourney`, anything else (late/banned/none) → —. Needs `lastsubscribedjourney` added to the participant mapping.
- **#6 Separate types:** audience menu + Manage audiences get tabs Saved filters / Lists / Segments with counts. Display only.
- **#15 Watson status validation (BUILD).** Rules below: `financialstatus` = Watson "customer status", `customerstatus` = Star Labs "subscription".
   - R1: financialstatus ∈ {regular, defaulted, locked, fully paid} ⇒ customerstatus ∈ {active, non active}
   - R2: financialstatus = discontinued ⇒ customerstatus = discontinued
   - R3: financialstatus = banned ⇒ customerstatus = banned
   - R4: financialstatus = late ⇒ customerstatus = late
   - R5: balance (`pp_totalpurchasevalue − pp_totalpaid`) ≤ 1000 ⇔ financialstatus = fully paid (both directions); skip financialstatus ∈ {discontinued, banned, late}
   - Shape: 5 read-only reconciliation checklists under the Checklists menu (count + participant list showing both statuses + balance), plus a "Status mismatch" signal card. Prerequisite fix: `normFinancial` currently maps `fully paid` and `late` to `none`; add the exact values `fully paid` (the only correct spelling; no variant mapping) and `late` to the allowed list.
