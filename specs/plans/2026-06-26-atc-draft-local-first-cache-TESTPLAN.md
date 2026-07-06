# Test Plan & User Scenarios — ATC Draft Local-First Cache

**Companion to:** `specs/plans/2026-06-26-atc-draft-local-first-cache.md` (ADR-001)
**Status:** Pre-implementation — write the tests/scenarios now, run them after implementation.
**Date:** 2026-06-26

> **Execution model:** ATC is **manually verified by the operator** (CLAUDE.md: Claude never runs/serves/builds/tests ATC; ATC components are excluded from CI). Every case below is a **manual** step unless tagged `[UNIT]`. The only automatable slice is the pure reconciliation logic in `ATCDraftService` (plain TS, synthetic inputs, no real ATC collection touched).
>
> **How to observe state while testing:**
> - **Local cache:** DevTools → Application → IndexedDB → `atc_draft_cache` (store `drafts`) and `atc_media_cache` (store `pending`).
> - **Cached record fields to watch:** `working`, `base`, `baseRev`, `dirty`, `pendingDelete`, `conflict`.
> - **Server:** Firestore console → `firestore-atc` DB → `temporary_ATC` / `temporary_edit_ATC` → watch `rev`, `delete`, and the `conflicts/{rev}` subcollection.
> - **Console:** watch for `INTERNAL ASSERTION FAILED` / `Unexpected state` (must NOT appear).

---

## 1. Test approach (pyramid, applied)

| Layer | What | How |
|-------|------|-----|
| **Unit** `[UNIT]` | `ATCDraftService` reconciliation: rev-compare branch table, conflict detection (`remote.rev > baseRev && dirty`), `dirty` computation, merge-status mapping | Jasmine specs on the service with fake `{working, base, baseRev, dirty}` + fake remote `{rev}`. No Firestore, no ATC data. Safe under CI. |
| **Integration (manual)** | Service ↔ IndexedDB ↔ Firestore: a real autosave writes local then server; offline list/load; submit cleanup | Operator, real browser + emulator/`starlabs-test` — **never production** |
| **E2E (manual)** | The two ATC flows end to end (Prescribe, Edit), incl. crash/offline/two-device | Operator, scenarios in §3 |

**Coverage targets:** 100% of the ADR's five stress-test cases (A–E) exercised; both flows (Prescribe + Edit); both networks (online/offline); the b815 + perf regressions explicitly checked.

**Test data:** use `starlabs-test` / the emulator and disposable participant profiles. Do **not** seed or read the denylisted ATC collections.

---

## 2. Environment matrix (run the core suite against each meaningful combo)

| Dimension | Values |
|-----------|--------|
| Flow | Prescribe ATC · Edit ATC |
| Network | Online · Offline (DevTools → Network → Offline) · Flaky (drop mid-save) |
| Tabs | Single tab · **Two tabs same draft** (the old b815 trigger) |
| Devices | Single device · **Two devices, same draft** (conflict case) |
| Browser storage | Normal · **Private/Incognito or IndexedDB blocked** (degraded-but-not-crashed) |
| Lifecycle | Normal submit · Refresh mid-edit · **Tab killed mid-sync** · Reopen after crash |

Minimum viable pass = the **bold** combinations plus one full online happy path per flow.

---

## 3. User scenarios (persona-driven)

**Persona:** *Maya*, a specialist authoring an ATC for a participant during a sitting; sometimes on flaky venue Wi‑Fi, sometimes switching between a tablet and a laptop.

- **S1 — Happy path, online.** Maya picks a participant, writes adjustments + notes, records audio, adds images, submits. Expectation: autosave shows "saved", submit succeeds, draft disappears, no errors.
- **S2 — Wi‑Fi drops mid-sitting.** Maya is writing when the venue Wi‑Fi dies. She keeps typing for several minutes, adds a photo, then Wi‑Fi returns. Expectation: never blocked, status says "Saved on this device", and on reconnect everything syncs with no lost words or media.
- **S3 — Tab crash / accidental refresh.** Mid-sentence, Maya's browser reloads. She reopens the draft. Expectation: her latest words and un-uploaded media are all there.
- **S4 — Two tabs.** Maya has Prescribe open in one tab and Edit (a different ATC) in another and edits both. Expectation: no frozen "Saving…", no b815, both save.
- **S5 — Two devices, divergent edits (the headline case).** Maya edits the draft on her tablet, then loses signal. Meanwhile she opens the same draft on her laptop and changes it, which syncs. Tablet reconnects. Expectation: she is shown both versions and chooses which to keep; the other is **recoverable**, not gone.
- **S6 — Submit then reopen.** After submitting, Maya navigates back. Expectation: the submitted draft is gone from her draft list and from local cache; no ghost draft.
- **S7 — Storage-restricted browser.** Maya uses a locked-down/incognito browser where IndexedDB is blocked. Expectation: app still loads and online editing/submit still works (degraded: no offline durability), with an honest message — it does not white-screen.

---

## 4. Test cases

### A. Persistence-cache removal & b815 regression

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| A1 | Both | Build with `main.ts` cache removed | Inspect `main.ts`; load app | No `persistentLocalCache` / `persistentMultipleTabManager` anywhere; Firestore inits with memory/default settings | Decision 1 |
| A2 | Both | Two tabs (Prescribe + Edit), same browser | Edit heavily in both for 2–3 min | **No** `INTERNAL ASSERTION FAILED (b815)` in either console; no frozen "Saving…" | Context, S4 |
| A3 | Both | — | Grep bundle / source | `FirestoreRecoveryService` fully removed; no REST-PATCH encoder, no `window` assertion listener remain | Decision 3 |

### B. App-wide perf regression (the open production issue)

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| B1 | App-wide | Cache removed | Navigate non-ATC screens that read Firestore | Read latency back to pre-persistence baseline (no per-snapshot IndexedDB writes / cross-tab locks) | Context, Consequences |
| B2 | App-wide | — | Open a screen with Storage media (the symptom screen) | Media loads **without** a hot reload | Context, Verify §2 |
| B3 | Non-ATC | Screens that previously relied on default-DB offline cache | Use them offline | Re-checked: confirm none silently depended on the now-removed default-DB cache | Consequences |

### C. Local-first autosave durability (crash / refresh)

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| C1 | Prescribe | Draft open, online | Type a change | `atc_draft_cache` row updates **before** the Firestore write; `dirty` true→false after sync; server `rev` increments | Data flow, gap 3 |
| C2 | Prescribe | Mid-edit | Hard-refresh the tab | Reopen draft → latest text present; `flushDirty` pushes anything unsynced | Stress B, S3 |
| C3 | Prescribe | Mid-edit, **offline** | Kill the tab entirely, reopen offline | Latest text + un-uploaded media present from local cache | Stress B, S2/S3 |
| C4 | Prescribe | Rapid typing | Type continuously for 10s | Local write every change; Firestore writes **coalesced/debounced**, serialized (no out-of-order `rev`), quota not hammered | gap 3 |
| C5 `[UNIT]` | — | — | Feed service `working≠base` | `dirty===true`; after `sync` success `base===working`, `dirty===false`, `baseRev` advanced | Schema, Decision |

### D. Offline read (list + load) — the easy-to-miss gap

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| D1 | Prescribe | Drafts exist locally, go **offline** | Open the participant's draft list (`getATCoptions`) | List is served from `ATCDraftService.listDrafts()` (local), **not** a failed Firestore read | gap 4, Part 2a |
| D2 | Prescribe | Offline | Select a draft | `load()` returns `local.working` (no `getDoc`); renders fully | Part 2a "Offline selection" |
| D3 | Edit | Offline | Open an in-progress edit draft | Loads from local cache; no error from missing persistence | gap 4 |

### E. Sync & rev counter

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| E1 | Prescribe | New draft | First autosave | Doc created with `rev=1`; `serverUpdatedAt` set (server time); local `baseRev=1` | Schema |
| E2 | Prescribe | Existing draft, only this device | Several autosaves | Each: `remote.rev===baseRev` → write `rev+1`; **no dialog ever** | Part 2a row 1 |
| E3 | Prescribe | Draft changed on another device, **this device not dirty** | Reopen here | `remote.rev>baseRev && !dirty` → take remote **silently** | Part 2a row 2 |
| E4 `[UNIT]` | — | — | Branch table inputs | All three rows of the Part 2a table resolve to the correct action | Part 2a |

### F. Conflict — detect → pick → archive (CORE new behavior)

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| F1 | Prescribe | **Two devices.** A edits, goes offline (A `dirty`, `baseRev=1`). B edits same draft online → server `rev=2` | A reconnects / reopens the draft | Conflict detected (`rev2 > baseRev1 && dirty`) → **picker dialog** shows A's vs B's version with edit-time hints | Stress A, S5 |
| F2 | Prescribe | From F1, picker open | Pick "this device" (A) | A's version written as `rev=3`, becomes new `base`; **B's version archived to `temporary_ATC/{id}/conflicts/2`**; dialog closes; draft renders A's | Conflict handling |
| F3 | Prescribe | From F1, picker open | Pick "other device" (B) | B's version kept (`rev=3`); **A's version archived to `conflicts/2`** — A's work recoverable, not lost | Conflict handling, S5 |
| F4 | Prescribe | After F2/F3 | Inspect `conflicts/{rev}` | Loser document present and complete (all fields) | "no loss" guarantee |
| F5 | Prescribe | Picker shown | Note the edit-time labels | Times shown as **hint only**; choosing does not auto-resolve by date | Decision 4 |
| F6 `[UNIT]` | — | — | `remote.rev>baseRev && dirty` vs `&& !dirty` | First → `'conflict'`; second → silent take | SyncOutcome |
| F7 | Edit | Same as F1 but `temporary_edit_ATC` keyed by `atcid`, two devices | Reconnect | Same picker + archive behavior in the Edit flow | Cross-flow |

### G. Submit cleanup — idempotent & crash-safe

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| G1 | Prescribe | Draft ready | Submit (online) | Firestore draft `delete:true` **and** `atc_draft_cache` row removed **and** `atc_media_cache` cleared for that draft | Stress E, Verify §5 |
| G2 | Prescribe | — | Kill tab **between** soft-delete and local delete; reopen | Self-heals: sees `delete:true` → purges local; or sees `pendingDelete` → re-attempts soft-delete. No ghost draft, no double-submit | Stress E, gap 5 |
| G3 | Prescribe | Submitted draft | Reopen participant's draft list | Submitted draft absent from the list | S6 |

### H. Media path (unchanged — must still pass)

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| H1 | Prescribe | Add audio + note + ATC images, online | Autosave then submit | Blobs in `atc_media_cache` during draft; uploaded to Storage on submit; URLs land in the draft doc arrays | Decision 5 |
| H2 | Prescribe | Add media **offline** | Refresh / reopen offline | Media re-attached from cache (`reattachPendingMedia`), index-aligned with existing URLs | media flow |
| H3 | Prescribe | Offline media, then online | Reconnect | Pending media uploads; URLs patched into draft; local blobs cleared | media flow |
| H4 | Both | Conflict resolved (F2/F3) | Check media arrays | Picked version's media intact; no orphaned/duplicated uploads | media + conflict interaction |

### I. Migration from old outbox

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| I1 | Both | Pre-existing entries in old `atc_draft_outbox` (from current build) | Deploy new build, open ATC | Old entries read once and re-homed/flushed; `atc_draft_outbox` ends empty | Verify §6, Consequences |
| I2 | Both | A draft saved offline on the OLD build | Upgrade, reconnect | That draft is not lost in the transition | Consequences |

### J. Degraded storage / negative cases

| ID | Flow | Preconditions | Steps | Expected | ADR |
|----|------|---------------|-------|----------|-----|
| J1 | Both | IndexedDB blocked (incognito/locked-down) | Load app, edit online, submit | App loads (no white-screen); online edit + submit work; honest "offline durability unavailable" message; no crash | S7 |
| J2 | Both | Storage quota exhausted | Keep adding media/drafts | `saveLocal` fails non-fatally (warn, keep in-memory); app keeps working | media-cache precedent |
| J3 | Both | Both devices offline, both edit, both reconnect | Bring A online, then B | First clean sync; second hits conflict picker (server `rev`, not clocks, orders them) | Stress C |
| J4 | Both | Refresh **during** a sync transaction | Reload mid-write | No half-written doc (transaction atomic); `flushDirty` reconciles after reload | Stress D |

---

## 5. Exit criteria (ship gate)

- [ ] All **bold** matrix combos pass A–G.
- [ ] b815 not reproducible in the two-tab test (A2); perf + media regressions cleared (B1, B2).
- [ ] Conflict suite F1–F7: **no data loss** in any branch (loser always in `conflicts/{rev}`).
- [ ] Submit crash-safety G2 self-heals.
- [ ] Migration I1/I2: no draft lost on upgrade; old outbox drained.
- [ ] Degraded-storage J1 does not white-screen.
- [ ] `[UNIT]` specs (C5, E4, F6) green in CI (they touch no ATC data).

## 6. Notes / open questions for implementation

- Decide the **debounce window** for the Firestore leg (C4) — long enough to coalesce typing, short enough that "saved" feels responsive.
- Confirm the **picker dialog** copy and that edit-time labels read as hints, not as the deciding factor (F5).
- Confirm `conflicts/{rev}` has a **read path** (even if just Firestore console) so an archived loser can actually be recovered — otherwise "recoverable" is theoretical.
- Re-verify B3 list: enumerate non-ATC screens that read the default DB offline before shipping.
