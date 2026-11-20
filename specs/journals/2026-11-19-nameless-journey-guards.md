# 2026-11-19 — Journey screens survive a journey doc with no `journey` name

**Found by:** the local lane, journey suite run after events on one emulator — events' seed doc `evt_journey_1` had only
`name`. JP-02 (Add-journey dialog) and coach-dashboards (sales dashboard journey names) failed on console TypeErrors.
CI runs each suite on its own emulator, so CI never saw it; but any legacy / partial journey doc does the same in prod.

| Screen | Was | Now |
|---|---|---|
| `/addjourney` → Add journey dialog (`journey-entry`) | `items.journey.replace(...)` threw on every keystroke | nameless docs skipped in the duplicate check |
| `sales-dashboard`, `sales-dashboard-clone` journey names | `a.name.localeCompare` threw → whole journey-name load aborted | nameless entries sort last |

Hub (`fix/evt-journey-seed-shape`): events seed `evt_journey_1` gets the real `journey` field; journey seed step 10 adds a
nameless journey (own tag `<run>_jnl`) so every journey screen runs against one; JP-02b proves the dialog survives it
and still flags a real duplicate.

## Revert guide
`git revert <this commit>` — three one-line guards, no other screen depends on them.
