# Participant Intelligence — round 2 APPROVED plan (2026-09-25)

## Flag list (NOT building — report after final build)
1. **uP!-and-above / CPM-and-above insights** (Insights #1, #2). No journey ranking exists in the data (the analytics `sequence` read is broken; the only grouping is segment-board: UP / CPM / FTM_LYL / BIG / DI / ARENA). The product side is ready: `UP_LIVE_PRODUCT_IDS` / `CPM_PRODUCT_IDS` against `unconsumedproducts`. Needs the operator to define which journey groups count as "and above".
2. **Column-header filters** (P7). Operator: too ambitious for now. Draft design: a popover per column type (contains / checkbox list / min–max / from–to). Open questions: share state with the side panel, include/exclude cycle, whether saved filters store them.
3. **Communication column + history** (P9). Operator: per-person sends aren't stored the way this needs ("we are not storing what is sent"). Needs a data model change first. Draft options were A (build from the archives at load) vs B (recent window + on-demand history), and email sent/failed vs `email logs` detail.
4. **Income filter** (P10). No income field exists anywhere (metadata, profile_data, forms). It has to be collected first.

## Decisions
- **P2 Retention-risk cards:** add 2 cards to Insights › Retention risk: (1) **Customer status None** (`customerstatus == 'none'`); (2) **Higher-order purchase mismatch**: active → `higherorderpurchase != activejourney`, non active → `higherorderpurchase != lastcompletedjourney`; an empty value counts as a mismatch (same as analytics). **The Checklists menu stays as it is** (Watson R1–R5 + all the previous reconciliation checklists); nothing is removed.
- **P3 Filter panel:** every section starts collapsed on every open (no memory). Clicking the name toggles it; count badges show on collapsed sections; Collapse / Expand all and search stay.
- **P4 Queue / Mode:** Mode options and matching use the mode NAME (as analytics). Queue and Event matching flatten the map values with concat (as analytics), which handles both single ids and lists. **Live queue, as analytics:** load `queue_token` where stagestatus == 'Approved' and tokenstatus == 'Active' at page load (PA:466), map queueref.id → profile_ids. The Queue section gets a Completed / Live choice. **No stage picker**: analytics' stage dropdown is commented out in its UI.
- **P5 Sticky layout:** fix the page to the visible window. The header bar, Insights cards and active-filter chips stay fixed; the filter panel and the table scroll on their own; the table header row is sticky; the bulk-action bar stays pinned at the bottom.
- **P6 Include / exclude:** click cycle on every checkbox-option section: include (✓) → exclude (✕, struck through) → off. Within a section, includes are OR'd and excludes are all removed. Exclude chips appear as "X: not Y" in red. Not for number / date inputs. Needs an exclude list per group in FilterModel and in saved filters (`pifilter`).
- **P8 Product cells:** product array columns (active, consumed, unconsumed, add-ons, gifts, bonus) show a list grouped by product with counts ("uP! Live event (1)"), sorted by count descending, up to 3 lines, then "+N more" (hover shows the full list). Products only; tags and tier unchanged.
- **P10 Age:** keep `participant metadata.dateofbirth` only (already built). No profile_data fallback, so no build work.

## Known facts from research
- Mode filter bug: `participant metadata.participantmode` stores the mode NAME. Our filter options use `modes` doc ids and should use `mode` names (analytics PA.html:138).
- Queue filter bug (likely): our `mapHasAny` needs array values. Analytics flattens with concat (PA:1062-1068), which works for both arrays and single strings. `queueevent` = completed queues per product (checklist builds it with currentstage == 'Completed').
- Live queue = `queue_token` with tokenstatus 'Active' and stagestatus 'Approved', stage = `currentstage`, participant = `profile_id`, queue = `queueref`.
- Higher-order mismatch (analytics PA:2360-2402): active → activejourney != higherorderpurchase; non active → lastcompletedjourney != higherorderpurchase.
- Comms per participant: `email archive` (profileid[], sent[]/failed[] emails via emailmap; detailed status in `email logs`), `wati archive` (profileid[], sent[]/failed[] numbers via numbermap), `notificationrecord` (profileid[], profilesuccess[]/profilefailed[]). No one-way-communication collection yet.
- Income: no field anywhere. Age: `participant metadata.dateofbirth` (in use) and `profile_data.dateofbirth` (app); none from forms.
