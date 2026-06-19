# PROMPT / JOURNAL — Verify the SAME queue flow on the participant MOBILE app (PWA, Playwright device emulation)

> Hand this whole file to a fresh Claude Code session (or an engineer). It is self-contained.
> Branch: **`cicd`** (has the e2e suite + flow-visualizer + docs) or `test/queue-e2e`. Worktree:
> **`/Users/antano/solarcode/ah/starlabs-angular-queue-e2e`**.
> Companion (read first): `specs/journals/2026-06-08-complete-all-tests-cloud-evidence.md` (the desktop
> suite, the cloud setup, the A/B/C report modes, the safety + serial constraints).

---

## 0. Goal (acceptance criteria)

Prove the **participant journeys work on MOBILE** — the Angular **PWA** rendered in **Playwright device
contexts (Pixel + iPhone)** — exercising the **same queue flow** the desktop suite covers, against the
disposable cloud project **`slabs-queue-e2e-exdcz`**, with **screenshot evidence in the mobile viewport**.
"Done" =
1. Two new Playwright projects exist — `participant-pixel` (Pixel 7) and `participant-iphone` (iPhone 14/15) —
   in `e2e/playwright.queue.config.ts` (cloud) and `e2e/playwright.queue.emulator.config.ts` (emulator).
2. A mobile spec drives the **REAL participant PWA** on those devices (NOT the Admin-SDK stand-in) through:
   login → `/queue-web` participant view → **form submit (self-move/auto-advance)** → **slot booking** →
   `web-studio-invitation` accept → `participantAEL` — each asserting **real app/CF output or a known
   seeded value** (same anti-circularity discipline as the desktop suite).
3. `cd e2e && npm run report:cloud` (or scoped: `--project participant-pixel --project participant-iphone`)
   is **green on the mobile projects**, and `e2e/playwright-report/index.html` shows a **per-test screenshot
   in the mobile viewport** (that IS the mobile proof).

**Discipline (unchanged):** never weaken/loosen an assertion; never edit `src/**` to make a test pass; a
real product bug → `test.fixme(reason)` + a finding. Drive the REAL UI; assert real output.

---

## 1. Why mobile, and what exists today

- The participant "mobile app" is the Angular **PWA** — there is **no Capacitor/Ionic/native** app — so
  **Playwright device emulation** (Pixel/iPhone browser contexts) is the correct, sufficient harness
  (decided in `specs/TEST-ENVIRONMENT-PROMPT.md`).
- **Today the suite is DESKTOP-ONLY.** The only Playwright project is `operator-desktop`
  (`devices['Desktop Chrome']`) in both configs. Participant actions in the current 22-file suite are driven
  by the **Admin-SDK STAND-IN** `e2e/lib/participant-sim.js` (the sanctioned operator/participant proxy for
  preconditions) — **not the real participant UI**. **This task replaces the stand-in with the real mobile
  PWA for the participant-facing steps.**

## 2. The participant surfaces to drive on mobile (real PWA)

All `canActivate:[authGuard]`; log in as a seeded **participant** (`participantN+run1@example.com`, pw
`Test!1234`) via `e2e/queue/support/auth.ts`:
- **`/queue-web`** — `QueueWebVersion1Component` (`src/app/queue system/QueueWebVerison1/`): the participant's
  live queue view (position/stage). The seeder already seeds the `/queue-web` chain (`participantsproduct` +
  deliverables) for 3 participants — see `seed-test-project.js`.
- **`/formbasedsubmission?type=form&id=<formId>&...`** — `FormBasedSubmissionComponent`: the participant
  fills + submits a delivery form; **submit triggers the self-move/auto-advance** transition (the one the
  desktop variation walks assert via the sim). Assert the token advanced (poll Firestore).
- **`web-studio-invitation`** — the participant accepts a studio invitation (page object already exists:
  `e2e/queue/pages/web-invitation.page.ts`).
- **`/participantAEL/:id`** — the participant AEL widget.
- **Slot booking** — the participant books a slot (queue-planning slots). Find the participant slot UI in
  `/queue-web` or its child; the desktop side seeds `queue planning`.

## 3. Approach

- **Projects:** add to BOTH configs' `projects: []`:
  `{ name: 'participant-pixel', use: { ...devices['Pixel 7'] } }` and
  `{ name: 'participant-iphone', use: { ...devices['iPhone 14'] } }`.
  Scope which specs each project runs (so `operator-desktop` keeps the 22 desktop files and the mobile
  projects run only the new participant-mobile specs): use a `testMatch`/`grep` or a new
  `e2e/queue/mobile/**` dir + per-project `testDir`/`grep`. Keep `workers:1` + `fullyParallel:false`.
- **Spec:** `e2e/queue/mobile/participant-journey.mobile.spec.ts` — drive the real participant PWA on the
  mobile context: login → `/queue-web` (assert their seeded stage/position) → submit a form
  (`/formbasedsubmission`) → **poll the real `queue_token.currentstage`** to confirm the self-move →
  accept a `web-studio-invitation` → book a slot. Reuse `web-invitation.page.ts`; add small mobile page
  objects for queue-web/forms/slots. Assert REAL app/CF output (a value the test did not write).
- **Stretch (the original "one orchestrated suite"):** one test with an `operator-desktop` browser context
  AND a `participant-pixel` context concurrently — operator drives a board move; the participant, on mobile,
  submits/self-advances; assert both sides. Start with participant-only mobile journeys first.

## 4. Constraints (identical to the cloud suite — read `CLAUDE.md` + the 2026-06-08 journal)

- **Cloud project `slabs-queue-e2e-exdcz` ONLY** (allowlist-guarded in `e2e/lib/test-project.js`; never
  prod `fir-sample-aae4a` / `starlabs-test` / Watson / SalesCRM). Fake `@example.com` users. **ATC excluded.**
- **SERIAL-ONLY:** `e2e/scripts/run-isolated.sh` holds a machine-wide lock + shares the `run1` seed; never
  run two passes at once. The seeder needs `NODE_OPTIONS=--max-old-space-size=4096` (already in the runner).
- **Evidence:** B is the default (`report:*` → screenshot EVERY test + on-first-retry trace + merged report).
  On mobile the screenshot is the Pixel/iPhone **viewport** — that is the mobile proof. `report:*:full` adds
  full traces; `test:*` is the lean no-report fast path.
- **Platform-limited tests:** the 5 cloud-only tests are guarded `test.skip(!!process.env.FIRESTORE_EMULATOR_HOST, …)`
  (run on cloud, skip on emulator). Any mobile case that depends on CF-event delivery for a spaced collection
  or the `firestore-forms` named DB must follow the same pattern.

## 5. Run

```bash
cd e2e
# cloud (proof; the participant PWA hits real Firestore + deployed CFs):
npm run report:cloud            # all projects; or scope:
TARGET=cloud EVIDENCE=1 npx playwright test --config=playwright.queue.config.ts \
  --project participant-pixel --project participant-iphone
npx playwright show-report      # the merged report — each mobile test has a viewport screenshot
```
The cloud env is already stood up (16 CFs deployed, 20 composite indexes, seeder + 50 fake participants).
If a CF isn't firing, see the cloud-evidence journal §CF-deploy (Eventarc retry; dummy ZOOM_* secrets).

## 6. Pointers

- Desktop suite + page objects: `e2e/queue/**`, `e2e/queue/pages/` (esp. `web-invitation.page.ts`).
- The stand-in to REPLACE with real mobile UI for participant steps: `e2e/lib/participant-sim.js`.
- `specs/TEST-ENVIRONMENT-PROMPT.md` — the mobile plan (Pixel/iPhone PWA, multi-actor).
- `specs/validated/03-queue-manager.md` — the flow (self-move on form submit, slot booking, studio/ATC).
- recon: `e2e/queue/recon/{studio,operator,schemas,testids,flow-config}.md`.
- The cloud-evidence journal (2026-06-08) — setup, A/B/C report modes, safety, the skip-on-emulator pattern.

## Acceptance checklist
- [ ] `participant-pixel` + `participant-iphone` projects in both configs; desktop files stay on `operator-desktop`.
- [ ] Participant journey driven on the REAL mobile PWA (queue-web → form self-move → slot → studio invite), asserting real app/CF output.
- [ ] Green on cloud; per-test **mobile-viewport** screenshots in the merged report.
- [ ] Same safety: cloud test project only, fake users, ATC excluded, serial runner, skip-on-emulator for platform-limited cases.
- [ ] (Stretch) one orchestrated test: `operator-desktop` + `participant-pixel` contexts concurrently.
