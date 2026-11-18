# 2026-11-13 — /eiflixhomeconfig Upcoming Workshops: why "Confirmed" differs from the View dialog

Investigation, then the operator picked option 1 (implemented below, same day).

## The two numbers have different sources
- **Confirmed column**: the number stored in `eiflixhomewidgets/<id>.confirmed`, shown as is
  (`upcomingworkshops.component.html:96-98`; missing reads 0).
- **View dialog**: a live count of `upcomingworkshopsresponse` docs whose `upcomingworkshopref` is exactly that
  widget's document reference (`upcomingworkshopresponses.component.ts:129-134`, `total = rows.length`).

## Who writes them
- Only the EiFlix app (workshop repo, `lib/workshop_v2/widgets/home/upcoming_workshops_section.dart`
  `_notify`, since e4e68ab 2026-07-13). One transaction writes the response doc
  `{widgetId}_{profileId}` and `confirmed: increment(1)`, and does nothing if the response already exists. New
  taps therefore move both numbers together. They can't drift through this path.
- The admin app never writes `confirmed`. Creating a widget doesn't set it, and editing uses `updateDoc` without
  it (`createupcomingworkshops.component.ts:806-836`). No cloud function touches either.

## So a gap means someone changed one side outside that flow
- **Confirmed higher than View:**
  - `confirmed` was typed in by hand (a starting or "social proof" number); or
  - response docs were deleted (test-data cleanup, removed users). The production rules snapshot
    (2026-09-16) allows `write: if true` on `upcomingworkshopsresponse`, and nothing decrements the counter.
- **View higher than Confirmed:**
  - responses were added outside the app (import or console); or
  - `confirmed` was reset or lowered by hand.
- **View shows 0 while Confirmed doesn't:** the responses point at another doc. The widget was recreated or
  copied, and its old responses reference the old id.

Production data was not read: the only prod key on this machine is in the hands-off `script` folder.

## Options (operator's call)
1. Make the table's Confirmed column count the responses, as the dialog does, with an aggregate count per row.
   Admin then always matches View. The stored number EiFlix shows participants ("N already confirmed") stays
   as it is.
2. Show both, e.g. "156 (150 responses)", so a hand-set number is visible as such.
3. A one-off repair that sets `confirmed` to the response count per widget. This is a data change, so it needs
   explicit approval and, for production, an approved way to run it.

## Done: option 1 (operator, 2026-11-13)
**What.** The Upcoming Workshops table's Confirmed column now counts the responses for each row, the same set
View lists. File: `upcomingworkshops.component.{ts,html}`. Hook: `upc-confirmed-count`.

**How**
- One `getCountFromServer` per row, a server-side count: one read each, and the responses are not downloaded.
- Refreshed whenever the widget list changes, and again when the View list closes, so new responses show up.
- While counting, the cell shows "…". If a count fails, it shows "—".
- Sort and search use the counted number.
- The header tooltip explains the column without naming fields.

**What is not changed.** The stored `confirmed` on the widget is never written. EiFlix still shows participants
that stored number ("N already confirmed"). Only the admin column changed. Fixing the stored number would be
option 3, a data change.

**Coverage.** Hub `workshops/eiflix-upcoming-confirmed.spec.ts`, gated on the new hook; 2/2.
`eiflix-home-config.spec.ts` still passes 7/7.
- UCC-01: a widget storing 99 with two real responses shows 2, and View lists 2. A widget storing 5 whose only
  response holds a plain string instead of a reference shows 0; neither the column nor View counts it. The
  stored 99 is untouched.
- UCC-02: a third response written meanwhile appears in View. After View closes, the column shows 3. The
  stored number is still untouched.
