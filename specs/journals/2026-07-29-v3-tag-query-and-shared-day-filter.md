# v3 — classify-tag removal, single tag query, shared day filter

Session 2026-07-29. Screen: `live-event-dashboard-v3`. All changes are WHY-notes for
three landings; see `specs/plans/2026-07-29-shared-day-filter.md` for the approved spec.

## 1. Removed the classify taxonomy (`videoAskTags`)

`videoAskTags` was loaded from `eventtags` on every init and read by nothing in v3.
It was inherited from the V2 screen, where classify tags were a real filter dimension.
Deleted the field, the load block, and the now-unused `getDoc` import.

**Why it was safe:** grep proved zero readers in the v3 component, template and service.
`doc` stayed — it is still used at four call sites.

**Left alone deliberately:** `participantVideoAskTags` is *also* dead in v3, but the
operator chose not to touch it this session. It is a live candidate for the next cleanup.

## 2. Two `participant tags` queries → one

Was: one query for `tagsfor` containing `'video ask'` (Video Ask Tags section) and a
second for `'live event'` (A&H CRM flag status). Now one `array-contains-any` for the
union, split client-side.

**The load-bearing subtlety — order.** Tag COLOR is assigned by palette index, and
`getParticipantTag()` returns "the first taxonomy tag the participant carries", so both
depend on `participantTags` order. An unordered Firestore query returns documents by
document id, and filtering a docid-sorted superset preserves each subset's relative
order — so the split lists are identical to what the two separate queries returned.
Change that query to an *ordered* one and this guarantee evaporates.

**Constraint to remember:** `array-contains-any` caps at 30 values and only ONE array
clause is allowed per query. Adding a third tag family is free; adding a second array
filter is not.

**Behavior change the operator accepted:** `crmTags` is now `isActive == true`, per the
standing "every query filters isActive" instruction. `first-timers-dashboard` does NOT
filter isActive, so v3 now deliberately shows *fewer* CRM flags than that screen. This
divergence is intentional, not drift.

Note: an equality filter *excludes documents missing the field* — any legacy tag doc
without `isActive` silently disappears from both lists.

## 3. Participant Data — dropped Present-on / Absent-on

Removed from the Participant Data filter only (`PdFilter`, `defaultPdFilter()`,
`pdMatch()`, `pdDayOptions`, and the two markup blocks). No other section shared that
logic — the day filters elsewhere are separate implementations with separate vocabularies.

## 4. Shared day filter — Daily Attendance ↔ Procedure Tracking

`data.procDayFilter` is now the single source of truth for both sections.

**Why the service, not a component field:** sync becomes structural. Both sections read
and write one field, so there is no propagation code, no ordering question, and no way
for the two to drift. The alternative — mirroring state and syncing on change — is the
class of design that goes stale the first time someone adds a third writer.

**Why the card body selects and the count opens the panel:** the operator's call. The
card previously opened the attendance panel on any click; that click is now the more
frequent action (selecting a day), so the panel moved to the count with
`stopPropagation`. `align-self:flex-start` on `.day-num` keeps its hit area hugging the
digits rather than stretching the full card width.

**Why Total approved became the All Days control** (operator follow-up, same session):
`'all'` originally lit no card. The operator read that as a *gap* — the grid looked like
nothing was selected, when the truth was that everything was. Total approved already
means "all days", so it carries the state rather than inventing an All Days chip. Same
split as the day cards: body selects, count opens the panel.

**Why `.selected` is a ring, not a background:** `.day-card.today` is `--z-900` with
white text and `.day-card.total` is beige. Any background-based selected state is
invisible on one or both. An accent border + `box-shadow` ring reads on all three.

**Cascade trap — the rule's position is load-bearing.** `.day-card.selected`,
`.day-card.today` and `.day-card.total` all have specificity (0,2,0), so the *last one
in the file wins* on `border-color`. Placed before `.today`/`.total` (where it first
landed), the accent border silently lost on exactly the two cards that most needed it
and only the ring survived. It now sits after both. Anyone adding a new `.day-card.*`
variant that sets `border-color` must add it *above* `.selected`.

### Consequences accepted up front

- Selecting a day card fires a `livechangework` re-query. Browsing attendance days used
  to be free; it now costs a round-trip per click.
- Selecting a past day changes the LIVE banner in **Adjustments & Procedures** — that
  banner's `liveCount` and Procedure Tracking's `procLiveTotal` are the same
  `liveChangeworkTotal`. Pre-existing coupling, newly easy to trigger.
- Both Daily Attendance instances (frontend + backend view) get the behavior. Their
  markup is byte-identical and they share `attDays`, so this was not separable.

## Verified, not assumed

- Live/completed grouping in Live Changework is airtight **at the query level**: two
  mutually exclusive `procedurestatus` subscriptions (`'live'`, `'completed'`). The
  operator's question was whether counts could cross-contaminate; they cannot. No change.
- The Procedure Tracking table counts in **three different units** — occurrences
  (`totalOpportunities`/`totalCompleted`, raw array length), distinct people (the four
  doer/beneficiary cells, `Map.size`), and documents (Live, `liveData.length`). This is
  why a live badge can legitimately exceed its own panel's row count. Not a bug.

## 5. Video Ask Tags — rebuilt on per-submission tags

The section used to bucket participants by `participant metadata.profiletags`. It now
buckets by the `tags` array on each `participantvideoask` document, scoped to the shared
day filter.

**Why the old source could never work.** `participant-videoask.component.ts:624-630`
writes every tag to *both* places, so neither was "wrong". But `profiletags` is a flat
cumulative array on the profile — it carries no event and no date. A section titled
"Video Ask Tags" sitting next to a day filter could not answer "tagged what, on which
day", because its source had thrown that away. Per-submission tags keep it.

**Expect the numbers to fall.** Same tags, far narrower scope: this event, this day,
versus every event since the profile existed. That drop is the fix, not a regression.

**Query.** `participantvideoask where arenaevent == selectedEvent.docref`. Verified
compatible: `participant-videoask.component.ts:301` filters that field with
`doc(firestore, 'event collection', id)` refs, and v3's `selectedEvent.docref` is
exactly such a reference (service:290). It also escapes the 30-campaign ceiling the
older path still lives under — that one resolves `arenavideoask` ids and feeds them to
an `in`, which Firestore caps at 30, and `service:610` **silently slices**. No `in`
here, so no cap.

**Why a SECOND subscription rather than widening `subscribeToVideoAsk()`.** The two
reach the same collection by different keys — `videoaskid in [...]` versus `arenaevent`
— and need not select the same documents. Folding them together would have quietly
moved Daily Attendance's per-day Video Ask counts, a section the operator did not ask
to touch. The cost is one extra listener; the alternative was an untraceable change to
a neighbouring number. Worth revisiting once someone can confirm the two sets match.

**Three rules that are easy to get wrong** (all in `computeTagGroups()`):

1. A participant now appears in **every** tag they carry. Column sums exceed headcount
   by design. Under the old taxonomy-priority rule they summed to exactly headcount, so
   anyone who remembers that will read the new totals as double-counting.
2. **Addressed requires at least one tagged document.** "All tagged docs are addressed"
   is vacuously true for someone never tagged — without the guard they would land in
   Addressed by accident. This is the single subtlest line in the rewrite.
3. **Addressed is judged per selected day**, so the same person can be Addressed today
   and sitting under a tag tomorrow. Operator's explicit choice over event-wide.

**Decisions taken by the operator, not by me:** Addressed scoped to the selected day;
columns render the full active taxonomy including empty ones (so "show only unique tag"
meant *one entry per participant per column*, not *hide empty columns*); the day comes
from the shared `procDayFilter`; and `created` (MM/DD/YYYY) is the date field, parsed to
a Date then normalised — not the `uploaded` Timestamp the rest of the screen uses.

**Two silent-loss paths, both logged rather than hidden:**
- A document with a missing or malformed `created` belongs to no day *and* to All Days
  either — it is counted nowhere. `subscribeToVideoAskTags()` warns with a count.
- A tag on a submission whose taxonomy doc was later deactivated has no column to render
  in, and those participants vanish. `computeTagGroups()` warns with the offending ids.

Neither field (`created`, `addressed`) is read or written **anywhere else in this repo**
— grepped across `src`. They are taken on the operator's word, so there is no
second implementation to check the shape against. First place to look if counts surprise.

## 6. Day chips repeated inside the Video Ask Tags card

The operator was scrolling back up to the day cards to re-filter this section, so the
Day row now renders a second time in the Video Ask Tags header.

**Zero component code.** It reuses `procDayChips` and `setProcDay` verbatim. This is
worth stating plainly because it is the return on decision #4: since the day lives in
the service, the second row is not a copy of the filter that must be kept in step — it
**is** the filter, drawn twice. The `.on` highlight tracks for free, and clicking a chip
moves the Procedure Tracking chips and the Daily Attendance cards with it. Had the state
stayed in the component, this would have been a sync problem instead of a template edit.

**The one real CSS constraint:** `.pf-group` is `display:flex` with no wrap. Procedure
Tracking gets away with that because it spans the page; the Video Ask Tags card is the
`1.6fr` column of `.bottom-grid`, so on a long event the chips would run off the edge.
`.tag-filters .pf-group{flex-wrap:wrap}` is scoped so Procedure Tracking's single-line
row is untouched.

## 7. Arena Followup — two columns renamed

`Not doing CW` → **No CW to Others**, `CW not received` → **No CW to themself**.

The old names read as "this person isn't participating". Both cards are actually about a
missing *direction*: `notDoingCWIds` gave changework to nobody, `cwNotReceivedIds`
received none for themself. The new labels say which. Labels only — the underlying id
sets and their service derivations are untouched.

**Deliberately left inconsistent, pending a decision.** Each card carries a second
string, `title`, which becomes the panel heading on click (html:516). Those still say
"Not doing changework" / "Changework not received", so a column now opens a panel with
the old wording. The operator named two specific strings and the titles were not among
them, so they were not changed unilaterally. Proposed follow-up: "No changework to
others" / "No changework to themself", plus the stale quote of the old names in the
`component.css:860` comment.

## State at end of session

All seven landings are implemented and `ng build --configuration development` passes.
Nothing is deployed. Files touched: `live-event-data.service.ts`,
`live-event-dashboard-v3.component.{ts,html,css}`.

Every Daily Attendance HTML edit was applied with `replace_all` because the frontend and
backend views carry byte-identical markup. That is convenient today and a trap tomorrow:
the two Total-approved blocks already differ on one label ("Unique" vs "Unique
participants"), so `replace_all` is only safe after diffing the exact lines first.

Build noise to expect, none of it ours: two CSS-nesting warnings in
`journey-onboarding-detail.component.css`, `duplicate-case` warnings in
`live-event-dashboard-v2`, and an unused-import warning in `queue-web-version1`.

## Pending / gotchas for next session

- `npx ng build --configuration development` passes. `tsc --noEmit` is clean apart from
  four **pre-existing** errors unrelated to this work: three spec-file class-name
  mismatches (`PreviewTripleAtc`, `Channeltemplates`, `Assigncategorydialog`) and a
  missing `amazon-chime-sdk-js` module.
- The graphify rebuild in CLAUDE.md **cannot run** — `ModuleNotFoundError: No module
  named 'graphify'`. The package is not installed in this environment. `graphify-out/`
  is therefore stale with respect to this session.
- Day-filter vocabularies are still inconsistent across the screen: `'all'`/`'today'`/
  date vs `''`-means-today vs `'any'`. Explicitly out of scope, still tech debt.
- **Arena Followup panel titles** still carry the pre-rename wording — see §7. Smallest
  open item; needs one word from the operator.
- **Two subscriptions now read `participantvideoask`** (§5). Deliberate, but if someone
  confirms `videoaskid in [arenavideoask ids]` and `arenaevent ==` select the same
  documents for an event, they collapse into one listener.
- **`participantVideoAskTags` is still dead** — written in `subscribeToVideoAsk()`, read
  nowhere. The rewrite in §5 did not touch it, so it is now dead code that *looks* like
  it feeds the section it no longer feeds. Prime candidate for the next cleanup.
- Everything this session is **uncommitted** — an earlier commit attempt was denied by
  the permission system and was not retried.
