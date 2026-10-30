# 2026-10-24 — EI Solution Review log (View Prescribed + Edit ATC)

> **Superseded access rule (2026-10-29):** `canWrite` (author / adjustment implementation agent / mentor-admin-developer)
> was removed. Whoever can open the ATC may add / delete / undelete reviews (View: the list query already scopes
> non-super users to their authored ATCs; Edit: only the retired-version guard stays). See `2026-10-29-atc-forms.md` §4–5.

Plan: `specs/plans/2026-10-24-review-log.md` (operator: "implement"; open points 1–4 taken as recommended).

## Storage — why the ATC doc
Compared four homes with the operator:
- **ATC doc array** — chosen.
- **Notes doc array** — rejected.
- **Subcollection** — rejected.
- **Separate collection** — rejected.

What tipped it to the ATC doc:
- **No subcollection** (operator).
- **Every ATC has notes**, so the notes doc was viable. It was set aside because the operator prefers the review data on the ATC itself, with Edit kept safe by a live subscription.

The scenarios behind each choice (versioning, privacy, list load, concurrency, counts) are in the chat on 2026-10-24.

**Accepted risk:** the participant can read their ATC doc, so `reviewlog` is readable. Web participant screens render only chosen fields; the Flutter app is unchecked.

## What landed
**Shared `ATC/shared/atc-review-log.service.ts`.** One rule set for View and Edit:
- EI-only check;
- `canWrite`: author, OR any adjustment's `implementationagent`, OR the mentor / admin / developer role;
- `isRetired`: `isdelete`, `status: upgraded` or `upgradedto`;
- `add` / `softDelete`: transactions that re-read the ATC and refuse a retired one;
- entries are `{ id, note, createdby, createdon, isdelete, deletedby, deletedon }`.

**View Prescribed:**
- Review log card (before Ask), with composer, newest-first list, inline delete confirm and "Show deleted (N)";
- "N reviews" tag on the title line, and a "Reviews" figure in the summary strip;
- review rows cached per SNAPSHOT with a WeakMap, so a new snapshot after an add or delete refreshes the list, while the cache keeps the freeze lesson.

**Edit ATC:**
- **Live doc subscription.** Its own save is ignored: the subscription skips events while `uploading`, because Edit's save retires the version on purpose.
- **Review log card** (live; add and soft-delete write straight to the ATC, not the draft) and the "N reviews carry over" line.
- **Retired elsewhere:** a banner (upgraded → Open latest version, as a full page load; deleted → message), with Review and update and the review actions disabled.
- **New version built on the live ATC** (`latestAtcData`), so fields Edit doesn't set (review log, status, validator, product…) keep changes made while open. This closes the "review added while Edit is open is lost" gap.

## Tests (atc, emulator)
**Seed phase 5:** participant `trl` and 8 EI ATCs dated 410+ days back (rEI with an active and a deleted review; rEIS eis-authored; rImpl with eis as change agent; rNot not involved; rLive / rCarry / rUp / rDel).

**Cases:**
- **VATT-01:** no log on WiSH or plain ATCs.
- **VATT-03:** list, show deleted, empty error, add (newest, trimmed, counts, DB), delete with Cancel then confirm, survives a reload.
- **VATT-04:** the author path.
- **EATT-06:**
  - a review added in View appears live in Edit;
  - delete with Cancel then confirm;
  - add from Edit writes straight to the ATC (no new version);
  - eis as change agent can add; eis not involved is read-only.
- **EATT-07:** a review added during an edit is on the saved version.
- **EATT-08:**
  - upgraded elsewhere: banner, button disabled, Open latest goes to the new version;
  - deleted elsewhere: banner.

**First run:** 12/12 new cases. The gate then wanted the Edit cancel/confirm hooks driven, which were added to EATT-06.

**Final:** full atc 98/98; readiness (`--base origin/development`) 8380 selectors, all present; production build exit 0.

## Pending
- **Edit subscription UX** (operator: "we will come back to the subscription"): what the user should do with an orphaned edit draft after an upgrade, and whether to warn on other in-place changes.
- **Flutter check:** confirm the app never shows `reviewlog`.

## 2026-10-25 — Undelete (operator; reverses "no restore" from 10-11)
- **Undelete** button on deleted reviews (visible with "Show deleted"), in View Prescribed and Edit ATC.
- Same people as add/delete; no confirmation ("Review restored." snackbar); **no audit trail** — `isdelete: false`
  and `deletedby` / `deletedon` cleared to null, so the entry looks as before the delete. Service `restore()` is the
  same retired-checked transaction as add/delete; disabled on a retired version in Edit.
- e2e: VATT-03 (undelete after reload: back in the log, "2 reviews", "Show deleted (1)", fields null) and EATT-06
  (undelete in Edit: back, "1 reviews carry over.", fields null). Full atc 98/98; readiness 8382 selectors.

## 2026-10-25 — branch suites run 40211706962
- 14 / 15 suites green (the ubuntu-24.04 pin worked — every Playwright suite installed its browser). `atc` failed
  BEFORE any test: "Install Cloud Functions deps" — the Cloud Functions repo's `onnxruntime-node` postinstall downloads
  its CUDA binaries from api.nuget.org and that download timed out (ETIMEDOUT) on that runner only.
- Re-ran the failed job (`gh run rerun --failed`, operator-approved).
- Fix (operator-approved): `ONNXRUNTIME_NODE_INSTALL: skip` on the CF install step in the hub's `web-e2e.yml` and
  `cf-e2e.yml`. Verified in onnxruntime v1.30.0 `js/node/script/install.js` + `install-utils.js`: the flag (env
  `ONNXRUNTIME_NODE_INSTALL` or npm config) makes the script exit early, skipping only the non-bundled files (the CUDA
  EP); the CPU runtime ships in the npm package. The e2e never uses a GPU.

## 2026-10-26 — branch suites run 40215649769: PATC-09 flake (test timing, not the app)
- Run 40211706962 attempt 2 (the re-run) went fully green. The NEXT run, 40215649769, had 14/15 green and atc 97/98:
  PATC-09 (untouched by this work) failed on both tries: the directive read "Alpha directive atc" + "PATC-09 directive
  atc". Cause: UpdateDialogComponent pre-fills its textarea through ngModel, which writes the value a moment after the
  textarea appears; on the slower CI runner Playwright's `fill` landed in that gap, so the late pre-fill put the old
  text in front of the typed text. The dialog is unchanged on this branch (last touched at "first commit" + test-hooks).
- Fix (hub, test side): `fillEditorDialog(page, text)` in atc/support/atc.ts — fill, wait 300 ms, check the textarea
  holds exactly the text, refill if not (toPass). Used at all 7 `dbu-textarea` fills (PATC-09, TRE-01/02, EATC-09 ×2,
  EATT-02, PTPL-01). Locally: the 5 affected files 45/45.
- The onnxruntime skip worked: the atc job got past "Install Cloud Functions deps" this time.
- 2026-10-26: re-run (attempt 2) of 40215649769 with the PATC-09 fix → **all 15 suites green; atc 98/98, 0 failed**.
  Local full atc on a fresh emulator, same code as pushed (app 6f510c73, hub 4db2c27): 98/98.
