# 2026-11-12 — Pull Joshua's delivery-dashboard fixes (item 5 of joshua-development)

**Operator ask:** "get from joshua-development" → "pull 5 only". joshua-development has 115 own commits on a
09-09 fork point; only the two delivery-dashboard commits were taken. Everything else (JC Health 4 tabs,
Ev. Prep board, JE dashboard, Participant Intelligence prototype, globals, qa/ and benchmark/) was left out.

## What was taken
| Commit | What | How |
|---|---|---|
| `00b0fce8` (09-28) | DAYS WAITING real + one row per participant | `git apply --3way`; 6 conflicts resolved by hand (below) |
| `eb67431f` (11-11) | `statusdate` overwrite destroyed delivery history | applied cleanly |

## Changes in `delivery-dashboard-clone`
| Change | Why |
|---|---|
| `onboardedtime` read from `participantjourneyproduct` (`journeyProductMap`, loaded roster-scoped in chunks of 30, cached) before `participant metadata` | the field does not exist on metadata, so DAYS WAITING was 0 for every row and the urgent/high highlighting never fired |
| `daysSinceTs` returns `null` (not 0) without a timestamp; badge + export show `—` and a neutral `days-unknown` style | "no date on record" must not read as "onboarded today" |
| Awaiting Initiation and Ready to Start deduped per participant (`dedupeByParticipant`, keeps the earliest onboarding) | a participant with N products produced N identical rows; those tabs are person-level |
| Re-initiate writes `'statusdate.initiated'` (dot path) instead of `statusdate: { initiated }` | updateDoc replaced the whole map, wiping started/ongoing/completed → participants fell out of Stuck Cases |

## Then changed (operator, option 2): DAYS WAITING = product first, ongoing journey as fallback
Joshua's version read **every** `participantjourneyproduct` doc for the **whole roster** (a collection this screen
never read before — the only reference was the never-called `loadJourneyProductData()`), and kept the earliest
`onboardedtime` across **all** of a participant's journeys, so a next-cycle participant counted from their first
journey's onboarding. Now:
- **Awaiting / Ready DAYS WAITING** = `participantsproduct.productonboardingscheduled` (the product onboarding call,
  already loaded — `productonboarding: true` + `productonboardedby` are set with it by schedule-dialog when that call
  is booked). Fallback only when none: `participantjourneyproduct.onboardedtime` of the participant's **ongoing**
  journey (`journeystatus == 'ongoing'`) **that matches the row's journey** (`journeyOnboardedTime()`; no journey id
  on the row → used only if there is exactly one ongoing journey). `participant metadata` dropped (field never existed).
- **Fetch** = only profiles holding a not-yet-initiated product with no product onboarding booked, and only their
  ongoing journey docs: `where('profileid','in',chunk30)` + `where('journeystatus','==','ongoing')` — served by the
  existing composite index (profileid, journeystatus). Cached per profile for the session.
- Note: the Awaiting tab's ONBOARDED column shows the same date, so it now shows the product call when booked.
- Unit spec: fixtures use ongoing journey docs; +2 cases (product call beats journey call; another journey's doc is
  ignored) → **12/12 SUCCESS**.

## Then: Stuck rule taken from mahalakshmi-development `delivery-dashboard-new` (operator: "for stuck, take mahalakshmi code")
| | Before | Now (her rule) |
|---|---|---|
| Candidates | status `initiated` or `ongoing` | status **`ongoing`** AND `participantsproduct.mode` = **priority mode** (case-insensitive) |
| Appointments read | `appointments` `participantproductid in` + `attended == true` + `orderBy(endtime)` | `appointments` `participantproductid in` (all), split like her buckets: cancelled ignored · attended → latest end · scheduled with start > now → future booking |
| Days | DAYS = since last attended appt; rows with NO attended appt were dropped | since last attended appt, **else since `statusdate.ongoing`** |
| Kept when | DAYS ≥ 15 | DAYS **> 15** AND **no future appointment booked** |
| Order | input order | longest stuck first |
DAYS STUCK (`waitingperiod`, last status activity) and escalation are unchanged. Unit specs in the folder: 122/122.
**Hub impact (must fix before push):** `journey/delivery-dashboard-stuck.spec.ts` (DDC-STK-01/02, DDC-FLT) seeds PPs with no
`mode`, so nothing is stuck under this rule; and NOAPPT / UNATT (ongoing 20 d, no attended appt) would now BE stuck once
priority. Seed + expectations need updating (add priority mode; add a future-booking and a non-priority negative control).

## Conflict resolutions (ours = charan-release, which gained Mahalakshmi's All tab, card funnel and engine since the fork)
- **Ready to Start** on charan-release is built from the card funnel (`getCardFunnel().awaiting`), not his
  "payment cleared" list. Kept ours and applied both of his fixes to it: dedupe + `journeyProductMap` onboardedtime.
- **Tab labels / row-info**: kept ours (All tab, zero-safe "Showing x to y").
- **Badge**: his null-aware badge replaces the old one.
- **Hooks**: his `pm-*` data-testids (pm-tab-*, pm-row, pm-days-waiting, pm-row-info) were **dropped** — this
  component's prefix is `ddc` (one prefix per component) and no hub spec references them, so the readiness gate
  would block on them. His qa/ checks that used them were not pulled.

## His unit spec
`delivery-dashboard-days-waiting.spec.ts` → renamed **`.unit.spec.ts`** so it runs in the existing unit lane
(`tsconfig.unit.json`) instead of needing his `tsconfig.spec.scoped.json`. Harness adapted to charan-release:
stubs `_memo`, `visibleCardIds`, `getCardFunnel` (Ready source) and `originalData.allParticipants`; the
Ready-dedupe case now feeds funnel rows. Result **10/10 SUCCESS**. Note: "never both awaiting and ready" now
passes trivially (its Ready list is empty) — on charan-release Awaiting (all non-initiated eligible) and Ready
(funnel) can legitimately overlap, so disjointness is no longer an invariant of this screen.

## Checks
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0. Readiness gate vs hub main → MATCHED, suite: journey.

## Revert guide
Per-screen: `git checkout bbcbba1d -- "src/app/Journey Onboarding/delivery-dashboard-clone/"` and delete
`delivery-dashboard-days-waiting.unit.spec.ts` (bbcbba1d = charan-release before this pull).
