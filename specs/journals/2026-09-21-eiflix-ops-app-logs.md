# EiFlix operations dashboard: EiFlix Mobile App Logs

**Date:** 2026-09-21 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, 7 unit cases green, hub WS-31 pushed, runtime unverified

Operator: after Device Breakdown, a section listing `loginlog` — today by default, with 7D / 30D — for
`app == 'EiFlix'`, showing profile (as a name), date, device OS and version, with sort, search, a
name filter (only the people present), a device-OS filter, and pagination.

- **Query**: one `getDocs` on `loginlog` with `where('date','>=', <range start>)` + `orderBy('date','desc')`
  — a single-field range, no composite index. Range start is local midnight `days-1` days back
  (Today = since 00:00; 7D = today + six days before). The `app === 'EiFlix'` test is applied
  client-side after the query, as asked, so the query stays index-free and a document without the
  field is simply not a row.
- **Name mapping**: `participant metadata` first, then `new_user_data`, else the raw id — the two
  directories the dashboard already holds (`pmMap` / `nudMap`), awaited before rows are built. The id
  is shown under the name so an unmapped row is still identifiable.
- **Table**: hand-rolled like the rest of this screen (grid rows, `eod-` tokens, Geist Mono headers)
  rather than MatTable, so it matches the page. Sort on every column (date default desc, others asc;
  version sorts numerically), search over name / id / OS / version / date label, name + OS
  `mat-select` filters whose options come from the loaded rows, Clear N, 10/25/50 page sizes with a
  from–to label. Filters and paging are pure over the loaded rows (`applyLogFilters`), unit-tested in
  `eiflixoperationsdashboard.logs.spec.ts` (7 cases).
- Hooks `eif-logs-*` (this screen's `eif-` prefix), all referenced by hub WS-31, which seeds six
  known `loginlog` documents and asserts range membership, the other-app exclusion, name mapping,
  both filters, search, sort and the pager.
- Read-only on Firestore.

Follow-up (same day, operator): the table shows the name only (no id beneath); the name filter carries a
search row (`ngx-mat-select-search`, the pattern create-watson-profile uses) that narrows its options —
not the table; and the count line adds "N of M unique people" (distinct profileids shown / in range).
9 unit cases; hub WS-31 updated.
