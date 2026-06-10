# StarLabs E2E & Test Map

> How every test suite is organized, how to run it, and what to expect.
> Visual version of this per-suite detail: open [`test-suites.html`](test-suites.html).
> For the broader landscape + the 9 mobile-journey storyboards, see [`test-map.html`](test-map.html).
> Companion docs: `specs/journals/2026-06-10-allcomponents-e2e-DEEPENING.md` (WHY) ·
> `specs/plans/2026-06-10-all-components-e2e-plan.md` (WHAT) · `e2e/recon-allcomp/*.md` (per-group recon).
>
> *(Supersedes the original "Phase 3 → D-002 emulator-fixtures" README; the emulator scaffold it described
> still exists — see [Legacy / emulator scaffold](#legacy--emulator-scaffold) — but the cloud suites below are
> now the primary path.)*

---

## The landscape

```
StarLabs tests
│
├─ 1. E2E — Playwright  (real Angular UI + real Firestore/CFs)
│  │   target: cloud test project  slabs-queue-e2e-exdcz   (NEVER production)
│  │   model:  app served on :4200  ·  Playwright drives Chromium  ·  admin-SDK seeds/asserts
│  │
│  ├─ queue/                ← the original suite (24 spec files)
│  │     playwright.queue.config.ts ............ cloud   (~188 cases green)
│  │     playwright.queue.emulator.config.ts ... hermetic Firebase-emulator (CI-gateable)
│  │     playwright.queue.evidence.config.ts ... + per-stage screenshots
│  │     playwright.invariants.config.ts ....... 1 hermetic self-test (no app, no seed)
│  │     playwright.mobile.config.ts ........... operator board + REAL Flutter participant on iOS sim
│  │
│  └─ 12 component groups   ← built by the all-components initiative
│        (each group:  seed-<group>.js  +  support/  +  *.spec.ts  +  playwright.<group>.config.ts)
│        appointments  events  modes  content  workshops  comms
│        support  profiles  evomap  authroles  journey  business
│
└─ 2. Unit — Karma/Jasmine   (`ng test`)
      403 spec files in src/ — ~398 are empty Angular-CLI stubs
      + dynamic-studio.atc-list.render.smoke.spec.ts (real render-contract smoke, no Firestore/ATC)
```

---

## Safety rules (non-negotiable — CLAUDE.md)

- **Production is never touched.** All test data targets the cloud **test** project `slabs-queue-e2e-exdcz`
  (or the emulator) — never `fir-sample-aae4a`. Test users live only there.
- **ATC is off-limits.** No suite reads/writes/seeds ATC collections; products are seeded `atcmodel:null`.
  The one ATC-named test (`queue/dynamic-studio/dynamic-studio.atc-list.render.smoke.spec.ts`) is a pure
  template render against a *synthetic* array — no Firestore, no `src/app/ATC/**` import.
- **Emulator config is segregated.** Emulator runtime lives in `firebase.emulator.json` / `firebase.test.json`,
  NOT `firebase.json` — the deploy workflow runs a bare `firebase deploy`, so a `firestore` block in
  `firebase.json` would push rules/indexes to prod. `seed-emulator.js` refuses to run unless
  `FIRESTORE_EMULATOR_HOST` is set and aborts on a production project id.
- **Watson / SalesCRM are separate prod apps** reached via `getApp(...)`; the test env wires no cross-project
  writer. (An uninitialized Watson read on the purchase screen is a known, tolerated benign console error.)

---

## How to run

### Prerequisites (one-time)

```bash
npm install --legacy-peer-deps     # repo deps (peer deps require the flag)
cd e2e && npm install              # the e2e runner lives here (Playwright 1.60 — NOT the repo-root 1.59)
```

### The app must be served on :4200 (a test-project dev build)

The configs auto-start `serve -s ../dist/atctranscription/browser -l 4200` if nothing is listening.
To (re)build the bundle yourself:

```bash
node_modules/.bin/ng build --configuration development   # development env → test project slabs-queue-e2e-exdcz
```

### Run it — bundled npm scripts (from `e2e/`)

```bash
npm run test:cloud          # queue suite vs the cloud test project (~188 cases)
npm run test:emu            # queue suite vs the local Firebase emulator (hermetic, CI-gateable)

npm run test:appointments   # any single component group:
npm run test:events         #   events · modes · content · workshops · comms · support
npm run test:profiles       #   profiles · evomap · authroles · journey · business
npm run test:groups         # ALL 12 component groups in sequence (~40 min)

npm run test:invariants     # hermetic oracle self-test (no app, no seed)
npm run test:mobile         # REAL Flutter participant walk on the iOS simulator
npm run seed:cloud          # (re)seed the cloud project manually
npm run report:cloud        # isolated run + per-stage screenshots + HTML report
```

Conferencing / video-tile tests are **root** scripts (run from the repo root): `npm run e2e:T1` … `npm run e2e:T10`
(T1-grid, T2-join-leave, T3-camera, T4-mic, T5-network, T6-background, T7-screenshare, T8-blur, T9-sustained, T10-rejoin).

Raw fallback (no npm script): `npx playwright test --config=playwright.<group>.config.ts --reporter=line`.

### Variations & knobs (env vars prefixed on any command)

| Knob | Applies to | Effect |
|---|---|---|
| `SKIP_SEED=1` | any suite | Reuse the existing seed (skip teardown+reseed) — fast iteration |
| `BASE_URL=http://…` | any suite | Point at a different served bundle (fresh build on another port — caveat #2) |
| `NODE_OPTIONS=--max-old-space-size=4096` | groups | Heap headroom (already baked into the `test:<group>` scripts) |
| `VARIATIONS="LYL - First Cycle,…"` | `test:mobile` | Run only the named journey variation(s) of the 9 |
| `ALL_PATHS=1` | `test:mobile` | Walk every forward path (72 paths / 50 users) instead of the 9 primary journeys |
| `FLUTTER_BIN=/opt/homebrew/bin/flutter` | `test:mobile` | Path to the Flutter binary that drives the real participant app |
| `EVIDENCE=1` · `TRACE=full` | `report:*` | Per-stage screenshots / full Playwright traces (baked into `report:*` / `report:*:full`) |
| `<GROUP>_RUNID=foo` | a group | Override the seed's testrunid namespace (`APPT_RUNID`, `EVT_RUNID`, `MODE_RUNID`, …) |

The 9 mobile journey variations: `LYL - First/Next Cycle` · `B!G - Next Cycle` · `Prodigies - First/Next Cycle` ·
`uP! - First/Next/3rd Cycle` · `uP! - Prep Hold` (storyboards in [`test-map.html`](test-map.html)).

### Playwright CLI — view reports, debug, capture

Every suite auto-records on failure: **screenshots** (`screenshot: 'only-on-failure'`), a **trace** on the first
retry (`trace: 'on-first-retry'`), and a self-contained **HTML report** at `playwright-report-<group>/`. Anything
after `--` is forwarded to Playwright, so it composes with any `npm run test:<group>` (commands from `e2e/`):

```bash
# view results (screenshots embedded on failed steps)
npx playwright show-report playwright-report-journey   # opens the web report on :9323
npx playwright show-trace test-results/<dir>/trace.zip # DOM/network/console time-travel

# watch it run / step through
npm run test:journey -- --headed     # real browser, visible
npm run test:journey -- --ui         # time-travel UI (watch + re-run + pick locators)
npm run test:journey -- --debug      # Playwright Inspector, pause & step

# force-capture artifacts even on green (or: npm run report:cloud:full)
npm run test:journey -- --trace=on --screenshot=on --video=on

# target / filter / flake-hunt
npm run test:journey -- journey/catalog.spec.ts:132   # one test by file:line
npm run test:journey -- -g "JP-04"                    # by title substring
npm run test:journey -- --last-failed                 # re-run only last run's failures
npm run test:journey -- --repeat-each=5               # run a case 5x to surface flake

npx playwright install chromium      # one-time browser install
```

Reports live per group (`playwright-report-{appointments,…,business}/`); queue → `playwright-report/` (+ `results.xml`
JUnit); mobile → `playwright-report-mobile/`. The `report:cloud` / `report:cloud:full` scripts wrap an isolated run
with `EVIDENCE=1` (per-stage screenshots) / `TRACE=full`.

---

## What to expect — per group (clean run)

| Group | Config | pass | fixme | skip | Covers |
|---|---|---:|---:|---:|---|
| **queue** | `playwright.queue.config.ts` | ~188 | 2 | meta | Queue Manager: staging, stage-log, assignment, dashboards |
| **appointments** | `playwright.appointments.config.ts` | 18 | 1 | 0 | Booking join-chain, slots, roster, team-hours, studio |
| **events** | `playwright.events.config.ts` | 15 | 0 | 0 | RSVP→request→approve, e-tickets, arena zones |
| **modes** | `playwright.modes.config.ts` | 23 +16 engine | 0 | 2 | Mode rollup/arc engine, wishlist, app-engagement |
| **content** | `playwright.content.config.ts` | 11 | 4 | 4 | Series/episodes, tier access, playlists, HLS |
| **workshops** | `playwright.workshops.config.ts` | 14 | 4 | 0 | Workshop authoring, scheduling, attendance |
| **comms** | `playwright.comms.config.ts` | 10 | 2 | 7 | Notifications, templates, broadcasts |
| **support** | `playwright.support.config.ts` | 12 | 3 | 3 | Tickets, support chat, blocked messages |
| **profiles** | `playwright.profiles.config.ts` | 22 | 1 | 0 | Profile data, analytics, `*_to_pmd` CF effects |
| **evomap** | `playwright.evomap.config.ts` | 13 | 1 | 0 | Evolution mapping authoring + render |
| **authroles** | `playwright.authroles.config.ts` | 18 | 1 | 2 | Login gate, data-driven authGuard, nav visibility |
| **journey** | `playwright.journey.config.ts` | 16 | 0 | 0 | Purchase/onboard, sales-lead, product-delivery* |
| **business** | `playwright.business.config.ts` | 20 | 1 | 0 | Expense planner, zones, HPC, quizzes, touchpoints |

\* the journey product-delivery cases (JP-PD/JP-EDIT) **validate two real production source fixes** end-to-end
(`delivery-sequence.component.ts` null-guard `16b578a`; `product-delivery.component.ts` fresh-per-emit view-model).

**Totals:** ~208 component-group cases (incl. the modes 16-case engine) + ~188 queue ≈ **~396 passing**, with **20 fixme** + **~18 CF-skip** documented in-file.

### Legend

- **pass** — real *anti-circular* assertions: the app **rendered** or **wrote** the asserted value; never a value the test itself wrote.
- **fixme** — authored but parked, each with an in-file reason. Almost all are one fragile class: **writes through multi-step Material dialogs/steppers** (no testids, async validators) + the appointments booking keystone (follow-up #1).
- **skip** — a Cloud Function not deployed to the test project: the UI write is asserted, the CF side-effect is skip-guarded.

---

## Caveats — read before trusting a run

1. **Shared cloud project → occasional timing flake.** Every suite hits one reused project that accumulates
   state. A capacity/auth-timing case (appointments booking, route-mount) can flake ~1/run on a busy day.
   **Re-run before treating a single failure as real.** Each suite reseeds its own world on start.
2. **`:4200` can serve a STALE bundle from a sibling worktree.** If you're testing *new/uncommitted app
   source*, the default `:4200` server may be another worktree's old build (so your fix looks ineffective).
   Build *this* repo, serve on a fresh port, and pass `BASE_URL=http://localhost:<port>`. A `serve -s` SPA
   fallback returns `index.html` with HTTP 200 for any path — check `content_type` is `application/javascript`
   to confirm a real chunk, not the fallback.
3. **Serial by design.** Each config runs one worker (shared seed state) — don't add `--workers`.

---

## Shared harness (to add a new group)

- `e2e/lib/seed-common.js` — `bootstrapGroup` / `seedDashboardRoutes` / `teardownGroup` on the proven
  `seed-test-project` primitives. **Every driven route needs a `dashboard` route-grant doc** or the authGuard
  redirects to root.
- `e2e/_shared/prod-firewall.ts` — `installProdFirewall(page)` blocks hardcoded prod CF URLs.
- Reuse the queue `support/{console-guard,firestore-admin}` + `stubs/*` + `actors.loginAs`.
- `assertNoFatal(guard, ctx, extraIgnorable[])` — the optional 3rd arg tolerates a tightly-anchored benign
  console class per screen (e.g. the userprofile `requires an index` quirk, the purchase-screen Watson read).
- Composite indexes live in `firestore.indexes.json`
  (deploy: `firebase deploy --only firestore:indexes --project slabs-queue-e2e-exdcz --config firebase.test.json`).

---

## Legacy / emulator scaffold

The original Phase-3 / **D-002 bridge** turned each subsystem's documented happy path into Firebase-emulator
seed fixtures + Playwright smokes. That scaffold still lives here and underpins the hermetic emulator configs:

- `fixtures/firestore-seed.json` — synthetic Tier-A seed (no PII), `seed-emulator.js` loads it (prod-safe guards).
- `playwright.config.ts` — the base, emulator-wired config (`baseURL` = the emulator app); without `BASE_URL`
  its specs skip rather than falsely pass, so they were safe to commit pre-stack.
- `playwright.queue.emulator.config.ts` / `*.evidence.config.ts` — the CI-gateable hermetic queue runs.

Run the emulator path:

```bash
firebase emulators:start --config firebase.emulator.json                       # terminal 1
FIRESTORE_EMULATOR_HOST=localhost:8080 node e2e/fixtures/seed-emulator.js        # terminal 2 — seed
BASE_URL=http://localhost:4200 npx playwright test -c e2e/playwright.config.ts
```
