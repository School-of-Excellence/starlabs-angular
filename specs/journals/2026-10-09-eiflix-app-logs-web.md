# 2026-10-09 — EiFlix App Logs: web sign-ins, and the title

Screen: `/eiflixoperationsdashboard` → **EiFlix App Logs** (was "EiFlix Mobile App Logs")
Component: `eiflixoperationsdashboard.component.{ts,html}`
Coverage: local `eiflixoperationsdashboard.logs.spec.ts` (24 cases) + hub WS-51 — **both run and green**

## What changed

1. The section is **"EiFlix App Logs"** — "Mobile" dropped from the heading, the HTML comment and the
   table's aria-label.
2. The table now also carries **web** sign-ins: `loginlog` documents with `eiflixweb: true`, which
   previously fell out because they have no `app: 'EiFlix'` field.
3. Those rows read **Device OS `web`**.

## WHY each constraint landed

### Two markers, one table

The apps write `app: 'EiFlix'`. The web client writes the boolean `eiflixweb: true` and **no `app`
field at all** — which is why the old single condition dropped every web session silently. The filter
is now `app === 'EiFlix' || eiflixweb === true`.

### `=== true`, not truthy

The flag is written as a boolean. A truthy test would admit the **string** `'false'`, which is
truthy — i.e. a row that explicitly said it was not web. Strict equality is the point, and it is what
makes the seeded `eiflixweb: false` control meaningful.

### The flag WINS over `device_os`

A web session has no device OS of its own, but a row can still carry a stale one. `eiflixweb: true`
therefore takes precedence: the flag says where the session actually happened.

This is also what makes the hub case falsifiable — the seeded web row carries `device_os: 'android'`
**on purpose**, so "reads web" can only pass if the override works, not because the row already said
web.

### Nothing else needed changing

`logOsOptions` is built from the distinct `device_os` values of the loaded rows, so `'web'` appears in
the Device OS filter by itself. The user-type filter, search, sort and paging all operate on `LogRow`
and were untouched.

`EiflixMobile` at component lines 277/1613 is a **platform_name key for Device Breakdown**, unrelated
to this heading — deliberately left alone.

## Testing — and the local loop is now faithful

**Local unit — 24/24.** Both rules are private methods tested through the file's existing
`Object.create(prototype)` pattern: every combination of marker, the string-`'false'` trap, the
override, whitespace trimming, and null documents.

**Hub — WS-51, run locally against the emulator before pushing.** Own describe and seeder, because
WS-31 asserts exact tallies off `seedLoginLogs` ("2 of 2 unique people", four rows in 30D, "1–4 of 4")
and extra rows would have rewritten all of them. Ran WS-51 **and WS-31** — the case this change could
plausibly break — and both pass.

### The warning that mattered

The first local run passed, but the emulator boot had printed two lines I nearly skimmed past:

```
⚠️  CF repo is on 'main' (expected 'development'). Triggers may differ.
⬢  functions: Failed to load function definition ... Cannot find module 'firebase-admin'
```

The Cloud Function triggers were **not running**. The emulator boots anyway and only warns, so a
local run can differ from CI with nothing failing. These particular cases are immune (
`alignWorkshopMetadataNames()` writes the CF's terminal values directly, which is exactly why it
exists) — but the next case might not be.

Fixed by putting the CF checkout on `development` and running `npm install` in `functions/`; the
re-run boots clean and WS-51 still passes. Both steps, and the two warning lines to watch for, are
now in the hub's `SETUP.md` §4a — my earlier note there said only "clone and symlink", which would
have left the next person in the same silently-degraded state.

## Pending

- `eiflixweb` rows have no `current_version` semantics defined — the column shows whatever the web
  client writes, or blank. Not asked about; worth a decision if web starts reporting a build number.
