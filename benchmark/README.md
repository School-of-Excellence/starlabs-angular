# JCHD 20k benchmark harness

Validates the Journey Coach Health Dashboard load / refresh / filter / drawer
numbers at the stress target (**20,000 participants, 20 coaches, ~10k with dense
drawer data**) against a **local Firestore emulator**. Nothing here touches a real
backend — the emulator is in-memory and throwaway.

## What it measures
- **Current board load**: the whole-collection scans the dashboard does today.
- **New board load**: page-1 (cursor) + aggregation `count()` cards, run in parallel.
- **Refresh** (current = re-scan; new = served from cache).
- **Coach filter switch** (new, indexed query).
- **Dense drawer open**: 7–8 parallel scoped reads + eventref/note-author fan-out, averaged.
- Payload bytes per op, document/read counts, and modeled **$/load**.

Times are reported as `emulator_wall` plus a **modeled real load** =
`emulator_wall + payload / bandwidth` at 8 / 25 / 80 Mbps (the emulator runs over
localhost, so it has no real wire latency — we add it from measured bytes).

## Prerequisites
- Firebase CLI (installed: `firebase --version`).
- The repo's `node_modules` (the scripts resolve `firebase` v11 from there).

## Run
From the `starlabs-angular` directory, in **three terminals**:

```bash
# 1) start the emulator (project id must match the app's dev projectId)
firebase emulators:start --only firestore --project starlabs-test --config benchmark/firebase.json

# 2) seed — smoke first (~1k, ~30s), then full (20k)
SCALE=0.05 node benchmark/seed.mjs      # validate the harness
node benchmark/seed.mjs                  # full 20k/20 run

# 3) benchmark
node benchmark/bench.mjs
```

Restart the emulator (Ctrl-C, re-run) for a clean slate before re-seeding.

## Live-render check (the front-end half)
To see the real 20k-row render / change-detection behavior, point the running
dashboard at the seeded emulator (opt-in, OFF by default — see `app.config.ts`):

1. Seed the emulator (above) and leave it running.
2. Start the app: `npx ng serve --port 4201`.
3. In the browser console: `localStorage.setItem('USE_FS_EMULATOR','1')` then reload
   (or append `?fsemu=1`). A `[BENCH]` warning confirms the redirect.
4. Open `/journey-coach-health`. The board now renders synthetic 20k data.
   - **Caveat — auth/guard:** auth still uses the real backend; if `authGuard`
     does a Firestore role lookup it will miss in the emulator. If the route
     blocks, add your logged-in uid to `users_roles` in the emulator (Emulator UI
     at `http://127.0.0.1:4400`) with `{ journeycoach: true }`.
   - **Caveat — forms:** the drawer's Forms section reads the named `firestore-forms`
     DB; emulator multi-DB binding is best-effort and may show empty. The other
     drawer sections are emulator-backed.
5. Turn it off: `localStorage.removeItem('USE_FS_EMULATOR')` and reload.

## Files
| File | Purpose |
|---|---|
| `config.mjs` | Volumes (scale with `SCALE`), emulator target, bench knobs |
| `lib.mjs` | Emulator-bound Firestore, generators, timing/byte helpers |
| `seed.mjs` | Writes the dataset (board collections full scale; drawer data dense for exemplars) |
| `bench.mjs` | Runs both query strategies, prints the report |
| `firebase.json` | Emulator config |
| `firestore.rules` | Wide-open **emulator-only** test rules (never deploy) |
| `firestore.indexes.json` | Composite indexes the new board path needs in **production** (Phase-2 deliverable) |

## Known limitations
- The emulator does **not** enforce composite indexes, so new-path latency assumes
  the indexes in `firestore.indexes.json` exist in prod.
- If this emulator build lacks aggregation `count()`, `bench.mjs` says so and the
  new-path counts are modeled rather than measured (upgrade `firebase-tools`).
- Localhost has no real network latency; that component is modeled from bytes.
