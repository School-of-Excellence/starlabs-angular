# 2026-11-12 — Workshop dashboard: New / Exist, and Tags in the Total Enrolled export

## What
1. **The side panel filter is All / New / Exist** (was All / New / Old). It is the one filter menu shared by
   every side panel except New Users, Not Enrolled and Sale Achieved, which have their own.
2. **New means a still-new user everywhere on the dashboard**: a `new_user_data` doc without
   `movedtoexist: true` (`isNewUserProfile`). Everyone else is Exist, including people marked `movedtoexist`
   (they live in `participant metadata`). This applies to the filter and the three "New" tags: progress
   table, participant detail, and side panel cards. The New Users cards, Exist Users Enrolled and the
   new-user filters already used this rule.
3. **The Total Enrolled export adds a Tags column after Enrollment Date.** Each enrolled doc's `tags`
   (newusertags doc ids) is exported as the tags' `name`s, joined with ", ".

Files: `workshop-dashboard.component.{ts,html}`. New hooks: `wd-side-filter-all`, `wd-side-filter-new`,
`wd-side-filter-exist`. No data written. Reads only `workshop participant enrolled.tags` and
`newusertags.name`.

## Why it is shaped this way
- **`workshoponly` no longer decides New.** That was a participant-metadata flag, and moved-to-exist people
  can carry it, so they showed as New. The operator's rule is that new users come from new_user_data and
  existing users from participant metadata. Using `isNewUserProfile` makes the filter and the tags agree
  with the New Users / Exist Users cards, which already used it.
- **Tag names are read at export time, not on dashboard load.** Only the ids of the people being exported
  are read, in `documentId() in` batches of 30, and cached for the session. A dashboard that is never
  exported pays nothing. A failed read still downloads the file, just with empty Tags.
- **Unknown tag ids are left out**, not shown as ids. A deleted tag would otherwise print a meaningless id.
- `exportParticipants()` is now async, because of the tag read. The template's `(click)` doesn't care, and
  the unit specs await it.

## Coverage
- Unit `workshop-dashboard.export.spec.ts`, 6/6. It covers:
  - the Tags column order and the joined names;
  - unknown ids skipped, and only the exported people's ids looked up;
  - no Tags or Enrollment Date on other panels;
  - New = still-new only, while Exist includes moved people and people with `workshoponly`.
- Hub `workshops/workshop-dashboard-new-exist.spec.ts`, gated on `wd-side-filter-*` (3/3). WS-44 and WS-77
  moved in from `workshop-dashboard.spec.ts`; that file still runs 9/9.
  - WNE-01: New keeps only NU; Exist holds the moved person and p0, even with p0 stamped `workshoponly`;
    All brings everyone back.
  - WNE-02: the New tag is on NU only. It is highlighted text, not an image. The moved person and p0 have
    no tag, and neither does p0's progress-table row.
  - WNE-03: Enrollment Date and Tags are the last two columns. NU exports "WS Segment …, WS Venue …"; a
    deleted tag id exports as nothing. The Exist Users export has neither column.
- Hub commit `c273592` (local).

## Pending
- Commit all of today's dashboard changes together. The hub's gated files key on hooks that land with them.
- Hub push on "push", after a full workshops suite run.

## Follow-up (same day): tags on the Total Enrolled cards
**What.** In the Total Enrolled side panel, each card now shows the person's enrolled-doc tags (as names) right
after the New tag, as small green pills. Hook: `wd-side-enrolled-tag`. Other panels show no tags.

**Why it is shaped this way**
- **Read when the Total Enrolled panel opens**, not on dashboard load: `loadEnrolledTagNames()` reads names for
  every enrolled person's tag ids through the same cached `loadTagNames()` the export uses. Re-opening the panel
  costs no reads.
- **One rule for cards and export.** `firstEnrolledDocs()` (first enrolled doc per person, as
  `buildParticipantEntry`) and `tagNamesOf()` (stored order, unknown ids dropped) are shared, so a card and its
  CSV row can't disagree.
- **Deleted tag docs are cached as blank** once a read succeeds, so they aren't asked for again every time the
  panel opens. A failed read caches nothing.
- The card row only wraps when it has tags (`.participant-details:has(.enrolled-tag)`), so every other panel's
  layout is unchanged.

**Coverage.** Unit `workshop-dashboard.export.spec.ts` 7/7 (new: tag map per person, stored order, first doc
only, dead ids dropped). Hub WNE-04 in `workshop-dashboard-new-exist.spec.ts`: NU shows both names in order
next to the New tag; the moved person carrying a dead id plus a real one shows only the real name; p0 shows
none; Exist Users Enrolled lists the moved person with no pills.

## Follow-up (same day): Tag filter in the Total Enrolled filter menu
**What.** The Total Enrolled filter menu (the one with All / New / Exist) now has a **Tags** section beneath the
radios: one checkbox per tag name carried by people in the panel, A→Z, plus Clear. Hooks: `wd-side-tag-filter`,
`wd-side-tag-option`, `wd-side-tag-clear`. The filter icon turns accent while a tag is ticked.

**Why it is shaped this way**
- **Any ticked tag matches (OR)**, like the existing Tier filter. It combines with New / Exist (AND), so "Exist +
  Gold" works.
- **Options come from the people in the panel**, built when their tag names load, so every option keeps at least
  one person. Dead tag ids offer nothing.
- **Ticking keeps the menu open** (`stopPropagation` on the section), so several tags can be ticked in one go.
  Picking a radio still closes it, as before.
- **Reset every time Total Enrolled opens.** Ticks are ignored on every other panel.
- The CSV export follows the filter, because it exports `filteredParticipants`.
- Test harness note: the unit specs build the component with `Object.create`, so the field initialisers don't
  run. `selectedTagFilters = []` was added to the export and exist-users harnesses.

**Coverage.**
- Unit, dashboard folder: 197 pass. The 1 failure is the pre-existing empty "should create" CLI stub, which has no
  ActivatedRoute provider.
- New unit cases: OR matching, combining with Exist, Clear, options limited to the panel and sorted, ignored on
  other panels.
- Hub `workshop-dashboard-new-exist.spec.ts`: 5/5, WNE-01..05.
  - WNE-05 ticks Venue (NU only), then Segment (NU + moved; p0 never), then picks Exist (moved only).
  - Clear + All brings everyone back.
  - Negative: the Exist Users panel's filter menu has no Tags section.
  - `workshop-dashboard.spec.ts` still 9/9.
- Readiness: 1422 selectors, all present.
- Hub commits `ab66434` (WNE-04) and `8cd7399` (WNE-05), both local.
