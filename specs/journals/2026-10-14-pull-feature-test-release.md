# 2026-10-14 — feature-test → charan-release: everything except group chat

| Screen | How |
|---|---|
| Participants / segment-board (`/segmentboard`, new) | path-scoped checkout of the folder |
| Scheduling / specialist-appointment-studio (`/specialistappointmentstudio`, new) | path-scoped checkout |
| Scheduling / book-appointment, appointment-detail (`disableCancel`, studio-only) | path-scoped checkout |
| Participant Intelligence (rounds 1–5) | path-scoped checkout |
| participants-analytics create-segments / manage-participantlist dialogs (4555d3e9 search + A–Z) | path-scoped checkout of the two dialog folders |
| participants-analytics.component.ts | ONLY the `pifilter` exclusion line — feature-test's copy would drop Nanda's `profileid` in two WhatsApp payloads (2026-10-13 fix) |
| app.routes.ts | the two new routes only |
| specs/plans + specs/journals | feature-test's docs for the above (not the group-chat journal) |

Not taken: Events/Chat (group chat — operator excluded).

Notes: segment-board's id migration is a manual admin action (dry-run preview first); back up `segmentboardconfig` /
`segmentboardlist` before running it on production. Studio may need a composite index `availability: profileref ASC,
starttime ASC` on real projects (emulator doesn't enforce indexes).

e2e: hub `test/release-feature-test-oct14` — SGB-01..06, csd search hooks, SAS-01..09 (+ ADDR), PI-01..17 (+ ADDR).
All hooks aligned for the 7 folders. Local emulator runs were partial (a lane without Functions/rules) — the hub CI is
the authoritative run (operator: push and let CI run).

Revert (per screen): `git checkout 9408b7b5 -- <folder>`; new screens: `git rm -r <folder>` + drop the route line.
