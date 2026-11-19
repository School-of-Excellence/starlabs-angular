# 2026-11-16 — Enrollment-date range on the enrolled panels; Responses dialog layout + export

## 1. Workshop dashboard: filter by enrollment date
**What.** The Total Enrolled, Exist Users Enrolled and New Users Enrolled side panels have an "Enrolled from /
To" pair of date inputs under the filter row, plus a ✕ to clear. Hooks: `wd-side-enrolled-range/-from/-to/-clear`.
Files: `workshop-dashboard.component.{ts,html}` (styles reuse the Sale Achieved range).

**Why it is shaped this way**
- **Whole local days, either end alone.** From = start of that day and To = end of that day, in the browser's
  time zone, the same as the date inputs. Ends typed the wrong way round are read as the same window, and the
  pickers' min and max stop that happening by mouse.
- **The enrollment date is the person's first enrolled doc** (`firstEnrolledDocs()`), as the cards, export, sort
  and Participant Data use. With a range set, people without a date are left out, because they can't be shown
  to fall inside it.
- **It runs after the New Users subscriber and referred filters.** Those rebuild the list from
  `mapProfileNew`; running earlier would let them undo the range.
- **Cleared every time any panel opens** (top of `onMetricClick`), like the other side filters. The CSV export
  and the panel count follow it, because both read `filteredParticipants`.
- **Sort icon:** Total Enrolled now always opens sorted (newest first), so the icon only turns accent when
  you've picked something else. Before, it was always pink.

**Coverage**
- Unit `workshop-dashboard.export.spec.ts`, 22/22. The 7 new cases cover:
  - with no range, everyone stays, including people without a date;
  - whole days on both ends, with an undated person left out;
  - either end alone;
  - ends the wrong way round, and Clear;
  - all three panels apply it, and others don't;
  - New Users Enrolled still applies it after the Referred rebuild;
  - opening a panel clears it.
- Hub WNE-08:
  - Total Enrolled keeps p0 on p0's day and drops today's people. From alone keeps today. Clear brings
    everyone back.
  - Reopening the panel starts empty.
  - Exist Users Enrolled on p0's day keeps p0 and drops the moved person.
  - New Users Enrolled keeps the new user today and drops them on p0's day.
  - Negative control: Total Started has no range.

## 2. /eiflixhomeconfig → Upcoming Workshops → View: the Responses dialog
**What**
- **Alignment.** The header used a 4px inset while the body and footer used Material's 24px, so "Responses"
  and the close button sat against the dialog's top-left corner. Header, body and footer now share the 24px
  side inset. UCC-03 measures that "Responses" and the table start at the same x.
- **The workshop title** is a full-width line under the header, centred and bold, wrapping instead of being cut
  off. Hook: `upc1-workshop-title`.
- **Export** (hook `upc1-export`) downloads a CSV of the rows listed: search applied, in the table's sort order,
  every page. Columns: Name, Country Code, Phone, Email, Customer Status, Subscription Start, Subscription End,
  Created. It is disabled when nothing is listed.
- Tidied:
  - the search box is 40px with a label;
  - emails stay on one line with the full address on hover;
  - the date reads "16 Nov 2026, 1:43 PM" on one line, and search matches it as shown;
  - the column widths suit the content.

**Why CSV, not Excel.** The workshop dashboard's exports are CSV, and the hub can already read CSV
(`readCsvRows`). It has no `xlsx` package. The file starts with a BOM so Excel reads names in any script.
Cells starting with `=` or `@` are defused against spreadsheet formulas. A leading `+` is left alone, because
phone codes start with it.

**Coverage.** Hub UCC-03, in the gated `eiflix-upcoming-confirmed.spec.ts`:
- the title is centred and bold, and the heading lines up with the table;
- Export has the exact columns, holds exactly the two responders, and follows the search;
- Export is disabled with no match.

UCC-01 and 02 still pass, `eiflix-home-config.spec.ts` passes 7/7, and `workshop-dashboard.spec.ts` 9/9.

## Pending
- Hub commits are local: WNE-08 and UCC-03. Push on "push", after a full workshops suite.
- The operator commits the angular files.

## 3. Follow-up: the Tag filter on Exist Users Enrolled and New Users Enrolled
**What.** The Tag filter from Total Enrolled (2026-11-12) now also appears on Exist Users Enrolled, in the same
filter menu, and on New Users Enrolled, in its own menu under Subscribers / Referred. It is one `<ng-template
#tagFilterSection>` rendered in both menus, so the literal hooks (`wd-side-tag-filter/-option/-clear`) exist once
in the template. Tag pills on the cards stay on Total Enrolled only, because only the filter was asked for.

**Why it is shaped this way**
- **It runs after the New Users subscriber and referred filters**, which rebuild the list. Before, it ran
  early, which was only safe while Total Enrolled was the one panel with tags.
- **The options come from the people in the panel you open.** Opening a panel clears the ticks and the old
  options (top of `onMetricClick`), so the previous panel's tags can't flash before the new ones load.
- **New Users Not Enrolled has no Tag filter.** Those people have no enrolled doc to read tags from.
- Both menus' filter icons turn accent while a tag is ticked.

**Coverage**
- Unit 25/25, with 3 new cases:
  - the filter applies on Exist Users and New Users Enrolled, but not on Not Enrolled;
  - New Users Enrolled still applies it after the Referred rebuild;
  - opening any of the three panels clears the ticks and the options and reads tag names.
- Hub WNE-09:
  - Exist Users offers only its own people's tags. Segment keeps the moved person and drops p0; Clear brings
    p0 back; reopening starts unfiltered.
  - New Users Enrolled offers Segment and Venue, A to Z. Segment keeps NU and drops a second new user who
    only has Venue; ticking Venue too brings them back.
- WNE-05's negative control moved from Exist Users to Total Started. The new-exist spec runs 9/9 and the
  dashboard spec 9/9.
