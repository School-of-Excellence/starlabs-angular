# PROGRESS

## Current state
- **starlabs-angular `signedURL-media`**: HEAD `96022d8a`. Uncommitted: the `/participantvideoask` productref
  change (2 component files), its plan and journal, plus the operator's own earlier
  `product-delivery.component.ts` + `2026-11-24-product-delivery-mapped-only-fetch.md` (not from this session).
  Prod build exit 0. Not pushed, not deployed.
- **starlabs-e2e-tests `main`**: uncommitted PA-48..PA-50 (`profiles/participant-videoask*.spec.ts`,
  `profiles/seed-profiles.js`) alongside the operator's own uncommitted `journey/` edits.
- Carried over, NOT re-verified this session: `functions/package.json` may still point `main` at
  `index.emulator.js` (revert before any functions deploy); `starlabs-test` Storage still publicly listable;
  `getMediaUrls` blocked on the `serviceAccountTokenCreator` grant. See `specs/journals/2026-11-04-storage-signed-urls.md`.

## Last session changes (2026-11-24) — journal `specs/journals/2026-11-24-participant-videoask-productref.md`
- `/participantvideoask` gained a **Product** filter in the OR event group (`productref in …`). Its options are only
  products whose `productToDeliverySequence` has an `arenavideoask` activity: that is a full read plus an
  in-memory walk, because the nested arrays can't be queried.
- The Event cell now lists **every** ref on a row (arenaevent, queueref, workshopref, productref). A ref outside the
  loaded sets shows its raw id.
- Dropped during design: loading only related documents (operator: filters need the full lists) and the DFU-only rule.
- e2e: profiles suite PA-47..PA-50 + addressable spec **5/5 on the emulator**. The first run failed PA-49 because the
  spec expected a non-videoask product name. The app correctly showed the raw id, so the spec was fixed.
- `git commit` was refused by the session permission mode. Nothing from this session is committed.
- `graphify` python module is missing on this machine, so the graph was not rebuilt.

## Pending
1. Commit (app first: `src/app/participant-videoask/**` + plan + journal; then the e2e repo's three `profiles/` files).
   Push only on request.
2. Run the hub readiness gate / `hook-diff.py`. The `screen-e2e-coverage` skill is not present under `.claude/skills`
   on this machine.
3. PA-47's header comment says the suite seeds none of the screen's collections, which is now stale. Optional tidy-up.
4. Carried-over items (signed-URL rollout, Storage rules, slider migration, ATC local run) are unchanged; see the
   2026-11-04 and 2026-11-16/17 journals.
