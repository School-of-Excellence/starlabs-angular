# 2026-11-13 — Workshop dashboard: Total Enrolled sort, and tags in Participant Data

## What
1. **Total Enrolled side panel: a sort button** (swap icon, next to the filter button) with four choices:
   Enrollment date newest first, Enrollment date oldest first, Name A to Z, Name Z to A. The active choice is
   ticked and the button turns accent. Picking the active choice again turns sorting off. Hooks:
   `wd-side-sort-btn`, `wd-side-sort-enrolled-new/-old`, `wd-side-sort-name-az/-za`.
2. **Participant Data header: the enrollment's tags**, after "Enrolled <date>" and "via <platform>", as the same
   green pills the Total Enrolled cards use. Hook: `wd-pd-tag`.

File: `New-Workshop/workshop-dashboard/workshop-dashboard.component.{ts,html,css}`. No data written. Reads
only `workshop participant enrolled.tags` and `newusertags.name` (cached, as the export and cards do).

## Why it is shaped this way
- **Opens newest-enrolled first.** The operator asked for this default, a follow-up the same day. The first
  cut opened unsorted. Each time Total Enrolled opens, the sort is back on "newest first", like the panel's
  other filters. Picking the active choice again turns sorting off (nothing ticked) for that visit. Other panels
  start unsorted.
- **The sort runs last**, after New/Exist, Tags, the other filters and the name search. The Export follows the
  sorted list, because it exports `filteredParticipants`.
- **Enrollment date comes from the first enrolled doc per person** (`firstEnrolledDocs()`), the same one the
  card, the export and Participant Data use. Timestamp, `{seconds}`, Date and string forms all read.
- **People with no date (or no name, shown "Unknown") go last** whichever direction is chosen. Ties keep the
  usual order, so the result is stable.
- **Name sort ignores case and reads digits as numbers** (`localeCompare`, base sensitivity, numeric).
- **Participant Data tags** reuse `loadTagNames()` (batched `in` reads, cached for the session) and `tagNamesOf()`
  (stored order, dead ids dropped). If another person is opened while the names load, the late result is
  ignored, so it can't paint someone else's tags.
- Only Total Enrolled gets the sort, as asked. Other panels have their own (Sale Achieved) or none.

## Coverage
- Unit `workshop-dashboard.export.spec.ts`, 15/15. The new sort cases:
  - with the sort off, the unsorted order;
  - newest and oldest first, with people without a date last both ways and the first doc winning;
  - A to Z and Z to A ignoring case, with nameless people last;
  - picking the active sort again turns it off;
  - other panels ignore it;
  - opening Total Enrolled starts on newest-first, other cards unsorted.
- Hub `workshop-dashboard-new-exist.spec.ts`:
  - WNE-06: the panel opens newest-first, with the moved person (enrolled today) above p0 (5 days ago) and
    that choice ticked.
  - Oldest first flips them. A to Z and Z to A match the expected list.
  - Picking the active sort again leaves nothing ticked, and reopening the panel is newest-first again.
  - Negative control: Exist Users has no sort button.
  - WNE-07: p0's enrollment, tagged venue / dead id / segment, shows "Venue, Segment" in Participant Data.
    Negative control: the same person, untagged, shows none. (p1 was tried first, but an "enrolled, not started"
    person has no progress row to click.) The tags are removed again in `finally`.

## Pending
- The operator commits the angular files. The hub commits stay local until "push" and a full workshops suite.
