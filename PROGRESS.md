# PROGRESS

## Current state
- Branch `nanda-development`; last commits: dashboard filter test case, merges of `production` and `development`.
- **Uncommitted, built green (dev + prod):** the workshop-dashboard **Communication** dialog — `workshop-dashboard/communication/*`, the header button, three dashboard senders now taking an optional recipient list, two `styles.css` rules, 41-case spec. Journal: `specs/journals/2026-09-11-dashboard-communication-dialog.md`.
- Everything from this run of sessions (workshopconfig v2 hints/guide, EiFlix toggles, schedule/rail/rich-text fixes, enroll diagnostics, popup banner, Exist Users card) is committed but **unverified at runtime** — all behind login.
- `ng test` is broken repo-wide by five stale stubs (wrong class names in `assigncategorydialog`, `channeltemplates`, `preview-triple-atc` specs; `import 'console'` in two components). New specs were run with a temporarily scoped `tsconfig.spec.json`, restored afterwards.

## Last session changes
- **Communication dialog** (operator request). Answered the question first: the dashboard reads `participant metadata` **only for enrolled ids** (where-in batches of 30); only `new_user_data` is loaded whole. The dialog loads both whole, plus `workshop participant enrolled where workshopref == <workshopconfiguration ref>` and `journey`, merges them one row per person (metadata wins; `movedtoexist: true` = existing; country code spelled differently per collection), and offers audience / enrollment / status / journey / country / has-phone / has-email / search filters with sort, pagination and selection.
- **Same send buttons, same functions:** `sendEmailToSelectedParicipant`, `sendWatti`, `sendNotificationinBreakthrough` were refactored to accept an optional recipient list (default unchanged), so the dialog and the side panel run identical composer / chunking / archive code.
- **Bug pass after the operator tried it:** selection was pruned on every filter change (a second search un-ticked the first person) → selection is now independent of the view, with Show selected / Clear selection; search re-scanned and re-sorted everything per keystroke with per-CD getters on top → rows indexed once, 180 ms debounce, one pass per change, counts cached (30k people: 2–25 ms per change). Also fixed: MatSort/MatPaginator never attached (ViewChild inside `*ngIf`) and a nested `<label>` double-toggling the Has phone/email boxes. 41 tests passing; harness render clean.
- Earlier in the session (committed): Exist Users Enrolled card + filters, `wdash-*` testids, 23-case spec; the CI "no spec references / nothing exercises" findings need e2e specs in the hub repo `starlabs-e2e-tests` (not checked out).

## Pending
- Operator: commit the Communication dialog; runtime pass on it and on the earlier unverified screens (list in the journals).
- e2e specs for `wdash-*` ids in `starlabs-e2e-tests` once it is available locally.
- Open decisions: hide the 29 dead workshopconfig settings?; re-enable the Guide button (commented out); the three hero-mobile / two workshop-level mobile flags are mostly unread by the Flutter app; the D1 evergreen quirk; the five one-line fixes to unblock `ng test`.
