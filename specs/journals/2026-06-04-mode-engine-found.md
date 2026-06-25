# 2026-06-04 — The participant-mode engine, found (TD-016 closed)

**Concept group #2 (Product Modes) is now end-to-end mapped.** This journal records *why* the engine was invisible for two sessions, *where* it actually lives, and *how* the whole mode lifecycle works — so a future session never re-runs the hunt.

## The setup (what we knew going in)
From the 2026-06-03 investigation (`2026-06-03-product-modes-investigation.md`) we had the *shape* of participant mode (B) but not its *writer*:
- `participant mode checklist` (27,496 docs) and `participant metadata.participantmode` were **read-only on disk** — the Angular app only ever *reads* them. An exhaustive grep across the app, `firebasefunctions/` (30 fns), `watson-cloud-functions/` (empty), and sibling repos found **zero** code that *writes* them.
- The product "day-knobs" (`integrationdays` / `performancedays` / `extendedperformancedays` / `delaydays`, `modeflow`, `diagnosticswithin4days`) were **authored** in Product Designer but **never consumed** anywhere on disk.
- Conclusion at the time: the writer is a Cloud Function deployed to `fir-sample-aae4a` from a repo **not checked out locally**. We logged TD-016 and were ready to ping the developer.

The operator had described the trigger model precisely: *"a combination of triggers — from taking the product to specific days or months after a specific trigger, to purely time-based."* That description is the fingerprint we matched against once the code appeared.

## What changed
The operator **added the missing repo** to the working tree: `starlabs-cloud-function/` — a **separate git repo nested inside the angular folder**. Critical detail: the latest code is on the **`development`** branch, not `main` (`git fetch origin && git checkout development`, HEAD `d264bac`). The engine is `functions/components/participantmode.js` (566 lines). The day-knobs ARE consumed here — they only looked "authored-but-unused" because this file was off-disk.

> **Lesson for future sessions:** "not in any local repo" meant "not in any repo *we had checked out*." The StarLabs **backend is its own repo** (`starlabs-cloud-function/`, `functions/components/*.js`), distinct from the legacy `firebasefunctions/`. When on-disk readers exist but no writer does, suspect a Cloud Functions repo before assuming corruption or a dead field.

## The engine — three functions in `participantmode.js`
The operator's "combination of triggers" maps exactly onto three Firebase Functions v2 entrypoints:

1. **`calculateParticipantMode`** — `onDocumentWritten('/participantsproduct/{id}')` (`:7`). The **event-driven** core. Fires on every delivery write and branches:
   - **Seed** (`:29`): new product → `mode = "Journey Planning Mode"` (normal) or `"Journey Priority Planning Mode"` (priority). *This is the seeding we couldn't find on disk.*
   - **Completion day-arc** (`:80–159`): `timedifference = floor((now − completionDate)/86400s)` days since `statusdate.completed`; `<integrationdays`→Integration, `<integ+perf`→Performance, `<integ+perf+extperf`→Extended Performance, else After Extended Performance — each sets `nextmodedate = completionDate + cumulative days`. **← the day-knobs, finally consumed.**
   - **Pre-event ramp** from `participanttentativedate` (`:292`): ≥30→Early Prep (−30), ≥15→Prep (−15), else Priority.
   - **Cancelled/Shifted** (`:162`) → null.
   - **Rollup + checklist** (`:188–289`): sorts the participant's product modes by `modes.sequence`, writes `participant metadata.productmode=[sorted]`, computes the headline by `customerstatus` (active→`sort[0]`, non-active→Exploration Mode, null/discontinued→null) → writes **`profile_data.participantmode`**, and **creates the `participant mode checklist` doc** (+ `evolution log`) snapshotting the `product mode config` widgets. **This confirms the lowest-`sequence` rollup rule we had only *inferred* from 5/6 data points.**

2. **`productNextModeUpdate`** — `onSchedule("05 00 * * *", Asia/Kolkata)` (`:358`). The **purely time-based** advance: a **daily 00:05 IST cron** that queries `participantsproduct where nextmodedate ∈ [today]` and advances each to its `nextmode`, recomputing `nextmodedate` from the day-knobs or from event dates (`event_collection` / `queue generation` start/end).

3. **`onEventApprovalProductMode`** — `onDocumentWritten("event participation request/{docid}")` (`:498`). The **event-trigger** path: Early Prep / Prep / Integration by days-to-event, resolving the product via `deliverables → participantproductid`.

A `/Atestdate/date` doc acts as a **test-clock override** (`:12–17`) — directly useful for CI: we can drive the day-arc deterministically without waiting real days.

## The surprise — `participant metadata` is a CQRS projection
The one residual was: the engine writes the headline to `profile_data.participantmode`, but our **data** showed it on `participant metadata.participantmode` too. Who copies it?

Answer: **`participantmetadata.js`** (1,047 lines, same repo/branch) — the `participant metadata/{profileid}` doc is **not hand-written**; it's a **read-model rebuilt by ~11 `onWrite` triggers** (all named `*_to_pmd`). That's *why every on-disk reference was read-only* — all writes live in this off-disk Cloud Function. Two triggers carry `participantmode`:
- **`profiledata_to_participantmetadata`** — `onDocumentWritten('profile_data/{id}')` (`:12`): change-guarded **mirror** of `profile_data.participantmode` → `participant metadata.participantmode` (`:46`), plus a webhook to Watson's `updateParticipantProfile` (`:60–66`). **← the denorm path.**
- **`journey_to_pmd`** — `onDocumentWritten('participantjourneyproduct/{docid}')` (`:245`): recomputes **`customerstatus`** from the journey portfolio and overrides `participantmode` in the non-active cases (1 completed-only → "non active" + **Exploration Mode** `:362–364`; cancelled-only → discontinued/null; closed-lost/no-subscription → none/null) — the **same headline rule as the §7a rollup**, enforced from the customerstatus side.

So `participant metadata.participantmode` = `profile_data.participantmode` mirrored, with customerstatus overrides. A single `participantsproduct` write fans out to **both** `calculateParticipantMode` (mode) **and** `participantmetadata.js::productsdata_to_pmd` (`:471`, the projection). That two-writer design is also why the value can momentarily disagree across the two collections — the headline settles only after both triggers run.

## Why this matters for CI/testing (the original goal)
- Mode transitions are **time- and event-driven Cloud Functions**, not client logic — so e2e mode tests need the **emulator + the `/Atestdate/date` clock override**, and should assert on `profile_data.participantmode` / `participant metadata` *after* the trigger settles, not synchronously.
- `participant metadata` being a **projection** means fixtures must seed the **sources** (`profile_data`, `participantjourneyproduct`, `participantsproduct`, …) and let the triggers rebuild it — seeding `participant metadata` directly would be overwritten.
- The day-knobs are now a **known, testable** input surface (Integration/Performance/Extended day counts).

## State after this session
- `validated/02-product-modes.md`: §7 (engine) + new **§7d** (projection layer) — end-to-end. §10 open-questions #1 and #2 both RESOLVED. §11 evidence log extended.
- TD-016: **fully closed**. PROGRESS / ORIENTATION updated (status table row #2 = ✅ fully mapped). ORIENTATION now documents the `starlabs-cloud-function/` repo (use the `development` branch).
- **Next:** concept group **#3 Queue Manager** — and we now know to read `starlabs-cloud-function/functions/components/queuesystem.js` (+ `queue_atc_generation.js`, `big-*`) as the real backend, alongside the `CONFIGURATION.md §1` queue config model.

## Gotchas surfaced
- `starlabs-cloud-function/` is a **nested git repo** — `git` commands run against *it*, not the angular repo, once you `cd` in. The angular repo's `git status` won't show its internals.
- Latest backend code is on **`development`**, not `main`/`master`. Always `checkout development` first.
- `participantmetadata.js` also has an `atcdata_to_pmd` trigger (`:753`, on the separate `firestore-atc` database) — **do not exercise it**; ATC stays off-limits per `CLAUDE.md`. It's only noted here for completeness of the projection inventory.

## Addendum — precision audit of the transition tables (same day)
After mapping the engine I wrote the **transition tables** (validated/02 §7e: 4 mechanisms · entry · the completion arc · cron · rollup) and then **audited them against production** with a read-only probe (`mode_audit.js`) over **12 recent users with ≥5 consumed products** (38,967 `participantsproduct` rows scanned). Verdict and the two surprises:

- **Table B (completion arc) — 102/102 correct against knobs-in-effect.** 87 rows matched the *current* product knobs exactly. The other **15 "mismatches" were a false alarm of my own audit**: I recomputed "expected mode" from the product's *current* `integrationdays`. A drill (`mode_audit_drill.js`) reconstructed the *historical* pacing from the per-mode `statusdate` timestamps — the gaps were exactly **30 / 60 / 30 days** (Integration entered on completion day, Performance +30, Extended +60, After-Extended +30), i.e. the engine paced **to the day** under an `integrationdays` of **30**, which was later edited to **45**. → **The engine is right; the config moved.** This became **TD-017 (day-knobs are not versioned)** — a real caveat for any analytics or test that derives expected mode from current knobs. *Lesson for myself: when auditing a time-paced engine, never assume current config equals config-at-the-time — read the event's own timestamps.*
- **Table D (headline rollup) — 11/12 exact.** The one exception (Antano Solar) revealed **TD-018**: `profile_data.participantmode=Event Mode` (stale) vs `participant metadata.participantmode=Exploration Mode` (correct for `customerstatus=non active`). The headline has **two writers** — the §7a rollup (fires only on a per-product mode change) and `journey_to_pmd` (fires on customerstatus change) — so they diverge when customerstatus flips with no concurrent mode event.
- **Flag F3 confirmed live.** Antano also carries a genuinely **stuck** row (`Evolution Prep`: `mode=Event Mode`, `nextmode=Integration`, `nextmodedate` in the past) — the cron branch gap is not just theoretical. F1/F2/F3 are now **TD-019**.

Net: the §7e tables are **validated against real data**, with two genuine architectural caveats (TD-017/TD-018) and three code bugs (TD-019) documented rather than glossed. Artifacts (probes + raw outputs + JSON) in `2026-06-04-mode-engine-found-artifacts/`.
