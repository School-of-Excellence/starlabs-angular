# Workshop dashboard: the Communication dialog

**Date:** 2026-09-11 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, dev + prod green, 34 unit tests passing, runtime unverified behind login

Operator: a **Communication** button before Q&A on `/workshop_dashboard/:id` that opens a dialog
listing **everyone** — all of `participant metadata` and all of `new_user_data` — with
existing/new, enrolled/not-enrolled, customer-status and journey filters, sort, pagination and
search, and **the same WhatsApp / Email / Notification buttons with the same functions** as the
side panel. Also asked: does the dashboard read all participant metadata, or only enrolled?

---

## 1. The question — what the dashboard actually reads

**Only enrolled.** `getParticipantMetaMapForIds()` runs `where('profileid','in', batch)` in
batches of 30 over the enrolled ids. `participant metadata` is never loaded whole — it is the
large collection. `new_user_data` *is* loaded whole (it is small and drives the New Users
cards). So the side panel can only ever reach people enrolled in this workshop, which is why a
separate on-demand dialog was needed rather than a filter on the side panel.

## 2. Shape of the change

- **`communication/communication-dialog.component.{ts,html,css,spec.ts}`** — standalone,
  lazy-imported from the dashboard, opened by `openCommunicationDialog()` with the
  `workshopconfiguration` document ref (`doc(db, 'workshopconfiguration', id)`) and three
  sender callbacks.
- **Four one-shot reads, in parallel:** all `participant metadata`, all `new_user_data`,
  `workshop participant enrolled where workshopref == ref`, and `journey` (id → `journey`
  field, for display and the filter). No listeners; nothing stays subscribed after close.
- **Merge rule (`buildRows`, pure and tested):** one row per person. A metadata document
  always wins. A `new_user_data` document adds a row only when metadata has nobody with that
  id — a fresh one as a NEW row, a `movedtoexist: true` one as an EXISTING row. A moved
  person who *does* have metadata gets their live metadata (phone, journey, status), not the
  stale new-user document — the same rule the Exist Users card landed yesterday.
- **Country code spelling differs by collection** — `countrycode` in metadata, `countryCode`
  in new_user_data. Each is read with the other as fallback; a leading `+` is stripped so the
  filter and display agree.
- **Filters:** audience (everyone / existing / new), enrollment (any / enrolled / not),
  customer status and journey (existing users only — hidden when the audience is new users,
  since new-user documents carry neither), country code, has-phone, has-email, free-text
  search over name / email / full phone / journey / status. Options are derived from the
  loaded people, never from config, so they are never empty. Sort on every column, paginator
  25/50/100/250, sticky header.
- **Selection:** tick rows or select-all-shown. Sends go to the ticked people, or to
  **everyone shown** when nothing is ticked; a filter change drops any tick it hides, so a
  send can never reach someone no longer on screen.

## 3. "Same buttons, same functions" — how that was kept literally true

The three senders on the dashboard were **refactored to take an optional recipient list**,
defaulting to `filteredParticipants` as before:

`sendEmailToSelectedParicipant(r?)` → `toEmailRecipients` + `sendEmailTo` (same
`EmailInputComponent`, same `email archive` write) · `sendWatti(r?)` → same
`WhatsappProgressDialogComponent`, same chunking · `sendNotificationinBreakthrough(r?)` →
same cloud function, same profile-id list.

The dialog hands rows back in the exact `{ profileid, name, metadata }` shape the side panel
uses, with the country code under **both** spellings because the senders read
`countryCode || countrycode`. Nothing about composing, templating, chunking, progress or
archiving was duplicated — the side panel and the dialog run the same code paths. The
footer counts show how many of the recipients actually have a phone / an email; the
matching button is disabled when that is zero.

## 4. Verification

- Dev and production builds green.
- **`communication-dialog.component.spec.ts` — 34 cases, all passing**, offline: the merge
  (doc id vs `profileid` field, both country-code spellings, `+` stripping, new vs moved vs
  metadata-wins, fresh/moved counts, enrolled flag, journey resolution), the derived options,
  every filter (incl. AND across status+journey, search on the full phone, audience→new
  clearing the existing-only filters, clear-all), selection (select-all, hidden ticks
  pruned), recipients (ticked vs everyone shown), and the shape each send button hands back
  — including that a moved user is sent with live metadata, not the stale document.
- Rendered in a harness against the compiled component CSS **and the real global
  stylesheet** (Bootstrap + both Material themes, `body.mat-typography`): header, segmented
  filters, chips, table, footer all as designed; no leaks.
- **Not verified at runtime** — behind login. Operator pass: open a workshop, click
  Communication, confirm the header counts, filter to *New users · Not enrolled*, tick two
  people, send a WhatsApp and check the same template dialog appears as from the side panel.

## 5. Two small things done to make it testable

- The Firestore handle became a lazy getter (`get db()`), so the class can be constructed
  in a spec without a Firebase app. No behavioural change.
- `ng test` is still broken repo-wide by the stale stubs noted yesterday
  (`assigncategorydialog`, `channeltemplates`, `preview-triple-atc` — wrong class names — and
  two `import 'console'` lines). I scoped `tsconfig.spec.json` to this spec to run it and
  **restored it** (byte-identical to HEAD). Those five one-line fixes would unblock `ng test`.

## 6. Testids

All `wdash-comm-*`: `-open-btn` (dashboard header), `-close-btn`, `-audience-all/-exist/-new`,
`-enroll-all/-enrolled/-not`, `-status-btn/-option`, `-journey-btn/-option`,
`-country-btn/-option`, `-need-phone`, `-need-email`, `-search`, `-clear-filters`,
`-shown-count`, `-selected-count`, `-select-all`, `-select-row`, `-send-email`,
`-send-whatsapp`, `-send-notification`. As with yesterday's card, the id→spec linkage the CI
gate wants lives in the hub repo `starlabs-e2e-tests`, not here.

## 7. Second pass — "so many bugs": selection lost on search, search slow

Operator, after trying it: ticking someone, searching for someone else and ticking them
**un-ticked the first**; and search was "very very slow — don't query every time".

**Selection.** Self-inflicted. `applyFilters()` pruned any tick the current filter no longer
showed, on the theory that a send should never reach someone off-screen. That is the wrong
model: search-tick-search-tick is exactly how you build a list. Now the **selection is
independent of the filters** — a tick survives any search or filter change, sends go to every
ticked person (or everyone shown when nothing is ticked), select-all adds the shown rows to
the existing ticks rather than replacing them, and the strip gained **Show selected** (a view
of just the ticked people, for a last look before sending) and **Clear selection**. Clear
filters leaves the selection alone; clearing the selection also leaves the view.

**Speed.** Nothing queried Firestore per keystroke — all four reads happen once — but the
filtering was doing far too much work per change:
- every keystroke re-ran the predicate over all rows, building a lower-cased string per row;
- MatTableDataSource then re-sorted with `toLowerCase()` inside the comparator;
- the template had ~8 getters (`shown`, counts, `withPhone`, `recipients`, the three option
  lists…) that each re-scanned the whole list on **every change-detection pass**.

Now: each row is indexed once at build time (`hay` for search, `keys` for sorting); the
search is a single `includes`; typing is **debounced (180 ms)**; filtering runs once per
change into `dataSource.data` (the data source only sorts + paginates); every count and
option list is a field recomputed in that one pass. Measured with the real component on
**30 000 people with sorting on**: 2–25 ms per filter change, < 1 ms per tick.

**Two more found on the way, both would have bitten at runtime:**
- `@ViewChild(MatSort)` / `MatPaginator` live inside `*ngIf="!loading"`, so `ngAfterViewInit`
  saw `undefined` and **sorting and pagination were never attached**. They are setters now.
- `<label>` wrapping a `mat-checkbox` (which has its own label) double-toggles in Chrome —
  the Has phone / Has email boxes would not have changed. Plain `<span>` now.

Spec grew to **41 cases** — the operator's exact sequence is a test
("keeps a tick when a later search hides that person"), plus persistence across filter
switches, select-all adding not replacing, Show selected, Clear selection, filters-leave-
selection-alone, the precomputed index, and the debounce. Dev + prod builds green; harness
re-rendered with the compiled CSS.
