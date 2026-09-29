# Participant Intelligence — round 4 (testing report) — APPROVED plan 2026-09-30

Source: two testing reports (@Charan Reddy), deduplicated to 27 points. Build all at once after discussion.

## Already done (tester to re-check after deploy)
- #1 frozen columns scroll separately → nothing pinned by default (2026-09-29).
- #2 slow load → pagination + comms archives no longer read.
- #22 comms "Not seen" highlight → comms popover removed; 📣 opens /notificationrecord.

## Flag list (NOT building)
1. **#25C Customer-status computation (backend):** R2–R4 mismatches (finance discontinued / banned / late vs customer status) come from the backend job that computes `customerstatus`; raise with its owner. No manual overwrite from this screen (it would be reverted / conflict with journeys).
2. **#26 Onboarding status + Active-by-age insights.** Draft: Onboarding = live journey's `participantjourneyproduct.onboarded` for active participants (Onboarded / Not / Unknown; needs the full pjp collection, loaded in the background). Age buckets <25 / 25–34 / 35–44 / 45–54 / 55+ / No DOB for active participants (from the already-loaded DOB).
3. **Confirmed-event counts for every option at start** (operator 2026-09-30: don't load all approved event participation requests up front). Counts stay on-demand after Confirmed is selected.

## Decisions
- **#3 Responsive top bar:** the title / count shrink first; below ~1200px the count goes under the title, search min 200px, toolbar buttons icon-only with tooltips; tools wrap to a second row instead of clipping; the table scrolls horizontally inside its frame.
- **#4 Save filter:** rename "Save as audience" → **"Save filter"** (rail footer + prompt dialog wording); add a "Save filter" button in the active-filter chips strip next to "Clear all".
- **#5 Add-column search:** search box at the top of Columns → Add column; the menu stays open after adding.
- **#4b Saved filters move into the filter rail:** a "Saved filters" block at the TOP of the filter rail (searchable list with live counts; click to apply, the active one highlighted, "Manage" link). The Saved filters tab is removed from the top audience dropdown, which keeps Lists + Segments.
- **#6 Dropdown search in the list / segment dialogs (option A):** add a search box to every dropdown in the analytics list / segment dialogs (ManageParticipantlistDialog + the create list / segment dialogs it opens) and sort the options A–Z. This also changes the analytics screen (shared dialogs).
  Operator addition: **sort every such dropdown's options A–Z**.
- **#7 Journey segment filter:** new checkbox section "Journey segment". Options = `segmentboardconfig` (not archived, in displayIndex order); membership = `segmentboardlist` (segmentid → profilelist), shown with "updated <lastupdated>". Include / exclude cycle; loaded at page load; saved in `pifilter`.
- **#8/#9 Event / Queue sections merged:** Event = Attended / Confirmed switch + search + event checkboxes; Queue = Completed / Live switch + search + queue checkboxes. The separate "Event status" / "Queue status" sections are removed. The section title shows the state, e.g. "Event · Confirmed (2)".
- **#10 Duplicate event / queue names (option A):** option label = name · date (events: `start_date`; queues: created date) plus a participant count, e.g. "B!G Accelerator · 12 Mar 2026 (92)". Sorted by name, then date descending. Counts follow the section switch (Confirmed counts appear after the on-demand load).
- **#11 Queue Completed / Live from queue_token:** the existing page-load query (tokenstatus Active + stagestatus Approved) is split by `currentstage`: Completed = 'Completed' (as analytics' Queue Event checklist, PA:3397-3401), Live = any other stage. `queueevent` is no longer used by the filter. Also fixes Live wrongly including completed tokens.
- **#12 Count conditions in words:** a shared condition control At least / At most / Exact / Is between (inclusive) for **uP! count, CPM count, ATC count** and each consumed / unconsumed product rule (product + condition + number[s]). Chips in words. Product-count rules and count conditions get saved in `pifilter` (product rules weren't saved before). Age stays min–max. uP! attendance New / Already attended stays.
- **#13 Counts:** keep analytics' fixed `UP_LIVE_PRODUCT_IDS` / `CPM_PRODUCT_IDS` (correct on production, 0 on starlabs-test; accepted). ATC: show "—" when `atccount` is missing (map to null), 0 only when it's really 0.
- **#14 Subscription date filter:** one Angular Material `mat-date-range-input` (the app already provides a date adapter) plus a "Match subscriptions that…" select with 8 relations (S = start, E = end, range From–To, day precision, inclusive):
  1 Start between (From ≤ S ≤ To) · 2 End between · 3 Start and end in range · 4 Start in range, end after it · 5 Start before range, end in it · 6 Active throughout (S ≤ From, E ≥ To) · 7 Active at any time (S ≤ To, E ≥ From) · 8 Not active in the range (E < From or S > To).
  Fields: non active / discontinued → `lastsubscriptionstart` / `lastsubscriptionend`; others → `subscriptionstart` / `subscriptionend`. Missing date → no match; an open side means unbounded. The chip is in words. Replaces the two start / end range pairs; saved filters map it into `pifilter` (the old analytics `subscriptionstart` / `subscriptionend` keys are still written for relations 1 / 2 so analytics keeps working).
- **#15 Validation:** min > max → red inputs + message, the filter isn't applied and no chip; the range picker blocks reversed dates; number inputs min 0 with no silent coercion; "At least 0" / blank = no filter, no chip; At most / Exact / Between with 0 stay valid; a product rule without a number isn't applied or chipped.
- **#16 Sorting:** text / journey / mode / plan / status by label A–Z; numbers / money / dates by value; product / tag / playlist lists by the first shown item's name (products: most-held first); remarks by count; **blanks always last** in both directions; the header sort arrow gets a tooltip naming the sort basis.
- **#17 Insight cards:** clicking the active card toggles it off; rail **Reset** = Clear all (filters + insight card + loaded list / segment / saved filter); while a card is active the topbar count shows "N of M · Insight: <label> ✕".
- **#18 Refined audience:** keep the loaded audience when filters are added. Label "Segment X · + N filters" (list / segment) or "Saved filter X · modified" plus a one-click "Update saved filter". The loaded audience shows as its own removable chip (removing it keeps the other filters). "All participants" / Reset clears it.
- **#19 Subscription dates, current vs last:** for non active / discontinued rows the Subscription start / end cells show "<date> · last" with a tooltip ("last subscription"). New optional columns: Current subscription start / end (`subscriptionstart` / `subscriptionend`) and Last subscription start / end (`lastsubscriptionstart` / `lastsubscriptionend`). The profile page is unchanged.
- **#20 Tag Create button:** solid primary "+ Create tag", disabled until the name has ≥ 2 chars (and ≥ 1 "Tag for"); Enter creates.
- **#21 Tag for:** multi-select chips with the analytics' 4 options: live event · queue event · video ask · journey coach (same as tag-participants.component.ts:71). At least 1 required; replaces the hard-coded ['journey coach']. The tag list shows "for" badges, and **editing** an existing tag's "Tag for" is allowed (writes `participant tags.tagsfor`).
- **#23 Insight fixes:**
  a) `higher-order-mismatch` = HOP present AND HOP ≠ activejourney, for all statuses; an empty HOP is never a mismatch (reverses round 2's analytics-style rule).
  b) `active-sub-expired`: day precision; the end date is the last active day, so expired = end day < today.
  c) `status-none-engaged`: engaged = ≥ 1 real (non-blank, known) active or consumed product, or an active journey that resolves to a known journey. `arr()` drops blank / non-string ids everywhere.
  d) `active-never-contacted` renamed "Active, no remarks yet" (still on the move-to-JC-dashboard flag).
- **#24 Finance status insight (option A):** new Insights category "Finance status": breakdown cards per finance status (Regular, Fully paid, Defaulted, Locked, Late, Banned, Discontinued, None; click filters) + a flag card "Active customer, non-active finance" (customerstatus active AND financialstatus ∈ {defaulted, locked, banned, late, discontinued}). Watson R1–R5 unchanged; this is a separate business view.
- **#25 Watson mismatch R2–R4 (A):** show only; Watson checklist rows get a "View profile" link (opens /userprofile/:id in a new tab); CSV export stays. No data writes.
- **#27 Multiple DFU products:** Integrity card "Multiple DFU products active" = `activeproduct` has ≥ 2 entries (occurrences, so duplicates count) whose `products.type == 'DFU'`. Reference data keeps the product `type` (products are already loaded; no new read).
