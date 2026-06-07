// big-misc.page.ts — one page object for the BIG "config / analytics / zoom" screens that don't
// each warrant a dedicated object: the level/model config tables, the two aggregate-level analytics
// uploads, the activity monitor + activity log dashboards, the participant BIG profile, the embedded
// zoom-meeting + watch-videos surfaces, and the create-arena-space stepper.
//
// Routes covered (all flat, all behind the SAME generic authGuard — recon big.md §0 / app.routes.ts):
//   bigactivity                 -> app-big-activity            (BigActivityComponent)            :243
//   biglevel                    -> app-big-level               (BigLevelComponent)               :238
//   modellevelconfig            -> app-atcmodel-level-config   (AtcmodelLevelConfigComponent)    :239
//   arena_space                 -> app-create-arena-space      (CreateArenaSpaceComponent)       :244
//   big_aggregate               -> app-big-aggregate           (BigAggregateComponent)           :242
//   bigaggregateeventlevel      -> app-big-aggregate-event-level (BigAggregateEventLevelComponent) :240
//   bigactivitymonitor          -> app-monitor-activity-log    (MonitorActivityLogComponent)     :241
//   bigactivitylog              -> app-big-activity-log        (BigActivityLogComponent)         :245
//   bigProfile                  -> app-big-profile             (BigProfileComponent)             :232
//   zoommeeting_bigparticipants -> app-zoom-meeting            (ZoomMeetingComponent)            :234
//   watchvideos                 -> app-watch-videos            (WatchVideosComponent) — a DIALOG opened by PAB,
//                                  not a route; open('watchvideos') only attaches to it if already mounted.
//
// WHY this shape (anti-circularity — the whole point of the rebuild):
//   * readMetric(label) returns a number the COMPONENT computed and rendered from its OWN Firestore
//     streams — the analytics "Total ATC Model Count" (`dataSource.filteredData.length`), the monitor's
//     "Participants" count (`filteredTokenData.length`), the activity-log Matched/NotFound tallies, a
//     config table's rendered row count, a profile activity-card count. NEVER a value the test wrote.
//     So a spec uses this as the "(b) assert a value the app/CF computed against a KNOWN-SEEDED number"
//     half of the rule. Streams are async (`collectionData`), so every read polls with `expect.poll`.
//   * createAndSave(formValues) drives REAL selectors + REAL fills/clicks (the aggregate forms' mat-
//     selects, then the real submit button) — the product action that makes the app/CF write. A spec
//     then polls the recomputed analytics count / the doc the CF wrote, never read==write.
//   * loadsWithoutFatal() proves the screen actually mounts (its real anchor renders) with no fatal
//     console error / pageerror (shared console-guard) — a smoke gate for the read-mostly screens that
//     have no single headline number to assert (zoom SDK mount, the stepper, the profile shell).
//
// SELECTORS (priority: data-testid -> id/formcontrolname -> role+name -> unique text). Every selector
//   below was verified at write time against the REAL served templates under
//   `src/app/big/**` (the worktree mirror, which has the test-hooks step's data-testid attributes
//   applied) and against `e2e/queue/recon/testids.md` §BIG. Where the test-hooks step added NO testid
//   (the config tables' data surface, the monitor/activity-log/profile counts, the arena stepper) the
//   most stable available anchor is used (a fixed class / formcontrolname / heading text / Material
//   `mat-row`) and the gap is recorded in IMPL_SCHEMA.risks.
//
// Auth/reuse: open() logs in as the seeded BIG admin via support/auth.ts `loginAsBigAdmin` (the real
//   login form — this object NEVER re-implements login), then navigates to the requested route and
//   waits for that route's anchor. Pass `{ skipLogin: true }` when the caller already authenticated
//   (e.g. a spec that opened watchvideos from the PAB and just wants to attach the object to the dialog).

import { Page, Locator, expect } from '@playwright/test';
import { loginAsBigAdmin, LoginOpts } from '../support/auth';
import { ConsoleGuard, assertNoFatal } from '../support/console-guard';

/** The BIG-misc routes this object can drive (path segment, query-stripped — matches app.routes.ts). */
export type BigMiscRoute =
  | 'bigactivity'
  | 'biglevel'
  | 'modellevelconfig'
  | 'arena_space'
  | 'big_aggregate'
  | 'bigaggregateeventlevel'
  | 'bigactivitymonitor'
  | 'bigactivitylog'
  | 'bigProfile'
  | 'zoommeeting_bigparticipants'
  | 'watchvideos';

/** Options for {@link BigMiscPage.open}. */
export interface OpenOpts extends LoginOpts {
  /** Skip login (caller already authenticated) and only navigate + wait for the route anchor. */
  skipLogin?: boolean;
  /** Which seeded BIG admin to log in as (0-based; seeder creates big0..big3). Default 0. */
  adminIndex?: number;
  /** Extra query params to append to the route (e.g. `{ profileid }` for bigProfile / zoom). */
  query?: Record<string, string>;
  /** Max time to wait for the route + anchor to mount. Default 30000ms. */
  timeoutMs?: number;
}

/**
 * Values for {@link BigMiscPage.createAndSave}. Only the aggregate-level upload screens
 * (big_aggregate, bigaggregateeventlevel) have a real create form; the keys map to their
 * `formControlName`s. Each is a *visible label substring* of the option to pick in that
 * mat-select (the app renders `{{client.name}}` / `{{option}}` / `{{option.level}}` as text).
 */
export interface BigCreateValues {
  /** Participant select (`formControlName="participant"`) — option text = participant name. */
  participant?: string;
  /** ATC model select (`formControlName="atcmodel"`) — option text = the model string itself. */
  atcmodel?: string;
  /** Level select (`formControlName="level"`) — option text = the level label. */
  level?: string;
}

/** Per-route static config: host tag, the anchor that proves it mounted, and (where present) the
 *  form/submit/add hooks. Centralised so open/loadsWithoutFatal/createAndSave stay data-driven. */
interface RouteConfig {
  /** Component host tag — every locator is scoped here so a stray element elsewhere never matches. */
  host: string;
  /** A selector (relative to host, unless `hostAnchor` is false) whose visibility means "mounted". */
  anchor: string;
  /** When true the anchor is matched *inside* the host; when false it is a page-level selector
   *  (used for the dialog/SDK surfaces whose anchor is not under a routed host). Default true. */
  anchorUnderHost?: boolean;
  /** The submit/save button selector (relative to host) for createAndSave, if the screen saves. */
  submit?: string;
  /** Whether this route exposes an aggregate-style create form (participant/atcmodel/level selects). */
  hasAggregateForm?: boolean;
}

/** Static route map — see file header for citations. */
const ROUTES: Record<BigMiscRoute, RouteConfig> = {
  // ---- config tables (no headline metric; data surface is a mat-table) ----
  bigactivity: { host: 'app-big-activity', anchor: 'h5.heading' }, // "Big Activity"; add btn has NO testid
  biglevel: { host: 'app-big-level', anchor: 'h5.heading' }, // "B!G Level"; add = [data-testid=biglevel-add]
  modellevelconfig: { host: 'app-atcmodel-level-config', anchor: 'h5.heading' }, // add = [data-testid=modelconfig-add]
  // ---- aggregate-level analytics uploads (real create form + Total-count metric) ----
  big_aggregate: {
    host: 'app-big-aggregate',
    anchor: '[data-testid="aggregate-submit"]',
    submit: '[data-testid="aggregate-submit"]',
    hasAggregateForm: true,
  },
  bigaggregateeventlevel: {
    host: 'app-big-aggregate-event-level',
    anchor: '[data-testid="ael-submit"]',
    submit: '[data-testid="ael-submit"]',
    hasAggregateForm: true,
  },
  // ---- monitor / activity-log dashboards (read + export only) ----
  bigactivitymonitor: { host: 'app-monitor-activity-log', anchor: 'h4' }, // "Big Activity Monitor Dashboard"
  bigactivitylog: { host: 'app-big-activity-log', anchor: 'h5.heading' }, // "Activity Log"
  // ---- create-arena-space stepper (multi-step wizard; smoke target, no headline metric) ----
  // The arena_space route loads CreateArenaSpaceComponent (NOT ArenaSpaceComponent — big.md §0). Its
  // first mounted anchor is the horizontal stepper; saving is a multi-step flow, so no inline save here.
  arena_space: { host: 'app-create-arena-space', anchor: 'mat-horizontal-stepper' },
  // ---- participant profile (read only) ----
  bigProfile: { host: 'app-big-profile', anchor: '.profile-card' },
  // ---- zoom SDK mount ----
  // Mount anchor is the always-rendered component heading `<h1>Zoom ClientView Component</h1>`
  // (zoom-meeting.component.html:45), NOT the `#zmmtg-root` SDK div: that div
  // ([data-testid="zoom-join"], html:48) is EMPTY and zero-size until the Zoom Web SDK styles/fills
  // it inside startmeeting(), which only runs when the `big assignment` has zoomdata. On the
  // missing-zoomdata / stubbed-SDK path it therefore never satisfies toBeVisible(), so it cannot be
  // the mount signal. The `zoom-join` testid is still the handle for SDK-state checks; mount uses the
  // heading. Scoped under the host so it can't match a stray h1 elsewhere.
  zoommeeting_bigparticipants: {
    host: 'app-zoom-meeting',
    anchor: 'h1',
  },
  // ---- watch-videos: a DIALOG (no route); anchor is the dialog shell, submit is the testid ----
  watchvideos: {
    host: 'app-watch-videos',
    anchor: '.vd-shell',
    submit: '[data-testid="watchvideos-complete"]',
  },
};

export class BigMiscPage {
  readonly page: Page;
  /** The route currently opened (set by open / attach); drives readMetric + createAndSave dispatch. */
  private route: BigMiscRoute | null = null;
  /** Host locator for the current route (set in open / attach). */
  private host: Locator | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  // --------------------------------------------------------------------------------------------
  // open(route) — log in (unless skipLogin) as the BIG admin, navigate, wait for the route anchor.
  // --------------------------------------------------------------------------------------------
  /**
   * Open one of the BIG-misc screens and wait until its real anchor has mounted (the data-driven
   * authGuard admitted us, so a wrong-role bounce / blank surface fails fast as a timeout).
   *
   * The route is RELATIVE so it resolves against the playwright config/env baseURL — never a hardcoded
   * project id. `query` lets a spec pass `?profileid=<seeded>` for bigProfile / zoom (those screens read
   * a participant from the query params; without it they render their empty shell, which is still a
   * valid loadsWithoutFatal target).
   *
   * @param route which BIG-misc surface to open.
   * @param opts  login / nav options. NOTE: 'watchvideos' is a DIALOG, not a route — calling open() for
   *   it does NOT navigate; it logs in (unless skipLogin) and then attaches to an already-open dialog
   *   (use {@link attachWatchVideos} from a spec that opened it via the PAB Video action instead).
   */
  async open(route: BigMiscRoute, opts: OpenOpts = {}): Promise<void> {
    const cfg = ROUTES[route];
    const timeout = opts.timeoutMs ?? 30_000;

    if (!opts.skipLogin) {
      // loginAsBigAdmin logs in via the REAL form and lands on /big-dashboard (auth.ts), so the guard
      // has already admitted this actor before we push to the target route.
      await loginAsBigAdmin(this.page, opts.adminIndex ?? 0, { timeoutMs: timeout, email: opts.email });
    }

    if (route === 'watchvideos') {
      // Dialog, not a route: just attach to whatever WatchVideos dialog is currently open.
      await this.attachWatchVideos(timeout);
      return;
    }

    // Build & navigate to the relative route (+ optional query).
    const qs = opts.query
      ? '?' + Object.entries(opts.query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
    await this.page.goto(`/${route}${qs}`, { waitUntil: 'domcontentloaded' });

    // Confirm the URL is on the requested route (guard did not bounce us to /login or hold the page).
    await this.page.waitForURL((u) => u.pathname.includes(route), { timeout });

    this.route = route;
    this.host = this.page.locator(cfg.host);
    await this.waitForAnchor(cfg, timeout);
  }

  /**
   * Attach this object to an already-open WatchVideos dialog (opened by the PAB Video perform-action).
   * No navigation — the dialog renders over whatever route opened it. Sets the current route to
   * 'watchvideos' so readMetric/createAndSave dispatch to the dialog surface.
   */
  async attachWatchVideos(timeoutMs = 30_000): Promise<void> {
    const cfg = ROUTES.watchvideos;
    this.route = 'watchvideos';
    this.host = this.page.locator(cfg.host);
    await this.waitForAnchor(cfg, timeoutMs);
  }

  // --------------------------------------------------------------------------------------------
  // readMetric(label) — a number the COMPONENT computed and rendered (anti-circularity safe).
  // --------------------------------------------------------------------------------------------
  /**
   * Read a labelled metric the CURRENTLY-OPEN screen rendered, polled until it parses to a finite
   * integer (the async stream has emitted a real number, not "" / "NaN"). Every value here is one the
   * APP computed from its own Firestore streams — never a value the test wrote.
   *
   * Recognised `label`s per route (case-insensitive; aliases in parens):
   *   big_aggregate / bigaggregateeventlevel:
   *     "total" | "total atc model count" | "count"  -> the Total-ATC-Model-Count value the app rendered
   *                                                     (`dataSource.filteredData.length`, the analytics
   *                                                     count behind `data-testid=aggregate-total-count` /
   *                                                     `ael-total-count`).
   *     "rows"                                        -> number of result `tr[mat-row]` the table rendered.
   *   bigactivitymonitor:
   *     "participants" | "total"                      -> `filteredTokenData.length` (the <h4> count span).
   *   bigactivitylog:
   *     "matched" | "matched count"                   -> `studioActivityMatchedCount` (studio logtype only).
   *     "notfound" | "not found" | "not found count"  -> `studioActivityNotFoundCount` (studio logtype only).
   *   modellevelconfig / biglevel / bigactivity:
   *     "rows" | "count" | "total"                    -> number of `tr[mat-row]` data rows rendered.
   *   bigProfile:
   *     "activities" | "total activities"             -> SUM of every rendered `.activity-count`
   *                                                     (`card.value["count"]` per Total-Activities card).
   *     "levels"                                      -> number of `.level-badge` current-level chips.
   *   watchvideos:
   *     "watched" | "completed"                       -> `playedVideos.size` (footer "<strong>N</strong>").
   *     "videos" | "total"                            -> `videos.length` (footer "of N videos watched").
   *
   * Routes with no numeric surface (zoommeeting_bigparticipants, arena_space) have no metric — call
   * loadsWithoutFatal() for those instead; readMetric throws for an unknown route/label so a typo is loud.
   */
  async readMetric(label: string): Promise<number> {
    const route = this.requireRoute();
    const host = this.host!;
    const key = label.trim().toLowerCase();

    switch (route) {
      case 'big_aggregate':
      case 'bigaggregateeventlevel': {
        const testid = route === 'big_aggregate' ? 'aggregate-total-count' : 'ael-total-count';
        if (['total', 'total atc model count', 'count', ''].includes(key)) {
          return this.pollNumber(host.locator(`[data-testid="${testid}"]`), `${route} total count`);
        }
        if (key === 'rows') return this.pollRowCount(host);
        break;
      }
      case 'bigactivitymonitor': {
        if (['participants', 'total', 'count', ''].includes(key)) {
          // The count span sits inside the <h4> heading: "...Dashboard - <span>{{N}}</span> Participants".
          return this.pollNumber(host.locator('h4 span').first(), 'monitor participants');
        }
        break;
      }
      case 'bigactivitylog': {
        // The Matched / Not-Found tallies render in <b> only for the 'studio' logtype (default).
        if (['matched', 'matched count'].includes(key)) {
          return this.pollNumber(this.activityLogTally(host, 'Matched'), 'activity-log matched');
        }
        if (['notfound', 'not found', 'not found count', 'not-found'].includes(key)) {
          return this.pollNumber(this.activityLogTally(host, 'Not Found'), 'activity-log not-found');
        }
        break;
      }
      case 'modellevelconfig':
      case 'biglevel':
      case 'bigactivity': {
        if (['rows', 'count', 'total', ''].includes(key)) return this.pollRowCount(host);
        break;
      }
      case 'bigProfile': {
        if (['activities', 'total activities', 'total', ''].includes(key)) {
          // SUM the per-card `.activity-count` numbers (one card per `queueActivitylog` key).
          return this.pollSum(host.locator('.activity-count'), 'profile activities');
        }
        if (key === 'levels') return this.pollCount(host.locator('.level-badge'), 'profile levels');
        break;
      }
      case 'watchvideos': {
        // Footer text: "<strong>{{playedVideos.size}}</strong> of {{videos.length}} videos watched".
        if (['watched', 'completed', 'played', ''].includes(key)) {
          return this.pollNumber(host.locator('.vd-footer-text strong').first(), 'videos watched');
        }
        if (['videos', 'total'].includes(key)) {
          // No dedicated element wraps videos.length; parse the "of N videos" from the footer text.
          return this.pollNumberFromText(host.locator('.vd-footer-text'), /of\s+(\d+)\s+videos/i, 'videos total');
        }
        break;
      }
      default:
        break;
    }
    throw new Error(`readMetric: no metric "${label}" on route "${route}" (this screen exposes no such number)`);
  }

  // --------------------------------------------------------------------------------------------
  // createAndSave(formValues) — REAL fills/clicks then the REAL submit (the product write action).
  // --------------------------------------------------------------------------------------------
  /**
   * Fill the current screen's create form with `formValues` and click its real submit, then wait for the
   * submit to settle (re-disable / detach). This drives REAL selectors + REAL interactions — the action
   * the app/CF reacts to; a spec then polls the RECOMPUTED analytics count or the doc the CF wrote
   * (never read==write).
   *
   * Supported on:
   *   * big_aggregate / bigaggregateeventlevel — fills the participant / atcmodel / level mat-selects
   *     (each by `formControlName`, picking the option whose visible text contains the given value),
   *     then clicks `data-testid=aggregate-submit` / `ael-submit`. The submit is `[disabled]` until the
   *     form is valid (and clears when no crossmatch/config error), so it resolves only on a real commit.
   *   * watchvideos — ignores `formValues`, clicks `data-testid=watchvideos-complete` ("Complete
   *     assignment", `[disabled]` until all videos watched) to drive the dialog's complete action.
   *
   * Throws for routes with no create form (the config tables save via a dialog opened by their Add
   * button — see {@link openAddDialog}; the read/zoom/profile/arena screens have no save here).
   *
   * @param formValues participant/atcmodel/level option-text substrings to select (aggregate forms).
   */
  async createAndSave(formValues: BigCreateValues = {}): Promise<void> {
    const route = this.requireRoute();
    const cfg = ROUTES[route];
    const host = this.host!;

    if (cfg.hasAggregateForm) {
      if (formValues.participant !== undefined) {
        await this.selectByFormControl(host, 'participant', formValues.participant);
      }
      if (formValues.atcmodel !== undefined) {
        await this.selectByFormControl(host, 'atcmodel', formValues.atcmodel);
      }
      if (formValues.level !== undefined) {
        await this.selectByFormControl(host, 'level', formValues.level);
      }
      const submit = host.locator(cfg.submit!);
      // Submit is disabled until the form is valid AND there is no crossmatch/configuration error; wait
      // for it to enable so a half-filled / invalid-combo form surfaces as a clear timeout, not a no-op.
      await expect(submit, `${route} submit never enabled (form invalid or crossmatch/config error)`)
        .toBeEnabled({ timeout: 20_000 });
      await submit.click();
      // The button shows "Updating...." while `loading`; wait for it to leave the loading state.
      await expect(submit).not.toHaveText(/Updating/i, { timeout: 30_000 }).catch(() => undefined);
      return;
    }

    if (route === 'watchvideos') {
      const submit = host.locator(cfg.submit!);
      await expect(submit, 'watchvideos complete never enabled (not all videos watched)')
        .toBeEnabled({ timeout: 20_000 });
      await submit.click();
      // The dialog closes on complete; wait for the shell to detach so the spec doesn't race PAB's write.
      await expect(host.locator('.vd-shell')).toBeHidden({ timeout: 30_000 }).catch(() => undefined);
      return;
    }

    throw new Error(
      `createAndSave: route "${route}" has no inline create form ` +
        `(config tables save via openAddDialog(); read/zoom/profile/arena screens do not save here)`,
    );
  }

  // --------------------------------------------------------------------------------------------
  // loadsWithoutFatal() — the screen mounted (anchor visible) AND no fatal console error/pageerror.
  // --------------------------------------------------------------------------------------------
  /**
   * Smoke gate: assert the current route's real anchor is visible (it actually mounted, not a guard
   * bounce or blank surface) and, when a {@link ConsoleGuard} is supplied, that no FATAL console error /
   * pageerror was recorded (benign stubbed-external noise is allow-listed in console-guard.ts). This is
   * the assertion for the read-mostly screens with no single headline number (zoom SDK mount, the arena
   * stepper, the participant profile shell).
   *
   * Pass the same guard the spec attached in `beforeEach` (attachConsoleGuard). When omitted, it only
   * checks the anchor (a spec may run its own afterEach assertNoFatal instead).
   *
   * @param guard optional console guard to assert clean; @returns true on success (throws otherwise).
   */
  async loadsWithoutFatal(guard?: ConsoleGuard, timeoutMs = 30_000): Promise<boolean> {
    const route = this.requireRoute();
    const cfg = ROUTES[route];
    await this.waitForAnchor(cfg, timeoutMs);
    if (guard) assertNoFatal(guard, `${route} loaded without fatal console errors / pageerrors`);
    return true;
  }

  // --------------------------------------------------------------------------------------------
  // ACTION helper — open the Add/edit dialog on the config-table screens (real click).
  // --------------------------------------------------------------------------------------------
  /**
   * Click the "Add New …" button on a config-table screen to open its create/edit dialog. The actual
   * field writes happen inside that dialog (a separate component, e.g. UpdateAtcmodelLevelConfig) — this
   * only drives the REAL button so a spec can then assert the dialog opened. modellevelconfig / biglevel
   * carry a testid; bigactivity's add button has NONE, so it falls back to `button.addbtn` (its fixed
   * class) — recorded in risks.
   */
  async openAddDialog(): Promise<void> {
    const route = this.requireRoute();
    const host = this.host!;
    let btn: Locator;
    if (route === 'modellevelconfig') btn = host.locator('[data-testid="modelconfig-add"]');
    else if (route === 'biglevel') btn = host.locator('[data-testid="biglevel-add"]');
    else if (route === 'bigactivity') btn = host.locator('button.addbtn'); // no testid; stable class
    else throw new Error(`openAddDialog: route "${route}" has no Add button`);
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await expect(btn).toBeEnabled();
    await btn.click();
  }

  // --------------------------------------------------------------------------------------------
  // internals
  // --------------------------------------------------------------------------------------------

  /** Guard: a route must have been opened/attached before reading or acting. */
  private requireRoute(): BigMiscRoute {
    if (!this.route || !this.host) {
      throw new Error('BigMiscPage: call open(route) (or attachWatchVideos) before reading/acting.');
    }
    return this.route;
  }

  /** Wait for a route config's anchor (under-host by default, else page-level) to become visible. */
  private async waitForAnchor(cfg: RouteConfig, timeout: number): Promise<void> {
    const anchor =
      cfg.anchorUnderHost === false
        ? this.page.locator(cfg.anchor)
        : (this.host ?? this.page.locator(cfg.host)).locator(cfg.anchor);
    await expect(anchor, `${cfg.host} did not mount (anchor "${cfg.anchor}" not visible)`).toBeVisible({
      timeout,
    });
  }

  /**
   * Pick an option in a `mat-select[formControlName=<name>]` by visible text substring. mat-select
   * renders its options in a cdk overlay panel (NOT under the host), so after opening we match the
   * option globally by its visible text. Mirrors the established overlay-option pattern in studio.page.ts.
   */
  private async selectByFormControl(host: Locator, controlName: string, optionText: string): Promise<void> {
    const select = host.locator(`mat-select[formControlName="${controlName}"]`);
    await expect(select, `mat-select[formControlName=${controlName}] not present`).toBeVisible({ timeout: 20_000 });
    await select.click();
    // Options live in the page-level overlay; the active panel's options are role=option / mat-option.
    const option = this.page
      .locator('.mat-mdc-select-panel mat-option, .cdk-overlay-pane mat-option')
      .filter({ hasText: optionText })
      .first();
    await expect(option, `option "${optionText}" not found in ${controlName} select`).toBeVisible({ timeout: 20_000 });
    await option.click();
    // Close the overlay if it lingered (single-select usually auto-closes; guard against a stray panel).
    if (await this.page.locator('.cdk-overlay-backdrop').isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
    }
  }

  /** The activity-log Matched / Not-Found tally `<b>` — scoped by the preceding label text. */
  private activityLogTally(host: Locator, label: 'Matched' | 'Not Found'): Locator {
    // Markup: `<span>Matched Count - <b>{{n}}</b></span>` / `<span>Not Found Count - <b>{{n}}</b></span>`.
    return host
      .locator('span', { hasText: new RegExp(`${label}\\s+Count`, 'i') })
      .locator('b')
      .first();
  }

  /**
   * Poll a locator's text until it parses to a finite integer, then return it. Throws (via the poll
   * timeout) if the app keeps rendering a non-number — surfacing a real defect as a clear timeout
   * instead of a bogus value.
   */
  private async pollNumber(loc: Locator, label: string): Promise<number> {
    let value = NaN;
    await expect
      .poll(
        async () => {
          if ((await loc.count()) === 0) return null;
          const raw = (await loc.first().innerText()).trim();
          if (raw.length === 0) return null;
          const n = Number(raw.replace(/[^\d.-]/g, ''));
          if (!Number.isFinite(n)) return null;
          value = n;
          return n;
        },
        { message: `${label}: never rendered a finite number` },
      )
      .not.toBeNull();
    return value;
  }

  /** Poll a locator's text and extract the first capture group of `re` as a finite integer. */
  private async pollNumberFromText(loc: Locator, re: RegExp, label: string): Promise<number> {
    let value = NaN;
    await expect
      .poll(
        async () => {
          if ((await loc.count()) === 0) return null;
          const m = (await loc.first().innerText()).match(re);
          if (!m) return null;
          const n = Number(m[1]);
          if (!Number.isFinite(n)) return null;
          value = n;
          return n;
        },
        { message: `${label}: text "${re}" never matched a number` },
      )
      .not.toBeNull();
    return value;
  }

  /** Poll a locator-set's count until the async stream settles; returns how many the app rendered. */
  private async pollCount(loc: Locator, label: string): Promise<number> {
    let n = 0;
    await expect
      .poll(async () => (n = await loc.count()), { message: `${label}: set never settled` })
      .toBeGreaterThanOrEqual(0);
    return n;
  }

  /** Poll the SUM of finite numbers across a locator-set (e.g. profile activity-card counts). */
  private async pollSum(loc: Locator, label: string): Promise<number> {
    let total = 0;
    await expect
      .poll(
        async () => {
          const texts = await loc.allInnerTexts();
          let sum = 0;
          for (const t of texts) {
            const n = Number(t.trim().replace(/[^\d.-]/g, ''));
            if (Number.isFinite(n)) sum += n;
          }
          total = sum;
          return texts.length; // re-run until the rendered set is stable
        },
        { message: `${label}: cells never settled` },
      )
      .toBeGreaterThanOrEqual(0);
    return total;
  }

  /**
   * Poll the number of DATA rows a Material table rendered. Angular Material 19 emits `tr.mat-mdc-row`
   * for each `*matRowDef` data row (the header is `tr.mat-mdc-header-row`, excluded). Scoped to the host
   * so a stray table elsewhere can't match. This is the "metric" for the config tables, which have no
   * headline count label — it is the count the COMPONENT rendered from its stream.
   *
   * ⚠ The table's data stream is async (`collectionData`/`collectionSnapshots` behind a
   * `guard.getRoles()` promise) — on first paint there are 0 rows. A bare `pollCount` would resolve
   * IMMEDIATELY at 0 (its `>= 0` predicate is trivially true), returning a premature 0 and failing a
   * `rows >= seededCount` assertion even though rows are about to render (the real cause of BIG-09a).
   *
   * ⚠⚠ RACE (the actual BIG-09a failure): a `MatTableDataSource` whose `data` is the INITIAL `[]`
   * renders the `*matNoDataRow` cell WHILE the stream is still loading — so "0 data rows AND the
   * no-data marker present" is ALSO the transient pre-first-emit state, not only the settled-empty
   * state. Returning on the first sighting of the no-data marker therefore yields a premature 0 the
   * instant before the stream emits its rows (biglevel lost this race; modellevelconfig won it — same
   * page object, same seed). The DOM snapshot proved the table held the 2 seeded rows at failure time.
   *
   * FIX: treat the no-data marker as a trustworthy "settled empty" ONLY when it stays present across
   * consecutive polls with still-zero data rows (the stream emitted `[]` and STAYED empty), debouncing
   * the transient initial empty. ≥1 data row is always an immediate settle. This waits out the
   * load-then-emit race without weakening the count (a genuinely-empty table still settles after the
   * marker persists). If neither settles within the budget we return the last observed count WITHOUT
   * throwing, leaving the verdict to the caller's assert.
   */
  private async pollRowCount(host: Locator): Promise<number> {
    // `tr[mat-row]` matches the attribute the template author wrote; `.mat-mdc-row` is Material's emitted
    // class. Use both via a comma-OR so this is robust to either being the queryable handle.
    const dataRows = host.locator('tr[mat-row], tr.mat-mdc-row');
    // The `*matNoDataRow` empty marker shipped on every BIG config table: `td.mat-cell.emptytext`.
    const noData = host.locator('td.emptytext, tr td.mat-cell.emptytext');
    // Number of CONSECUTIVE polls the no-data marker must persist (with zero data rows) before we
    // trust it as a settled-empty verdict — debounces the transient pre-first-emit `[]` render.
    const NODATA_STABLE_POLLS = 3;
    let last = 0;
    let noDataStreak = 0;
    await expect
      .poll(
        async () => {
          last = await dataRows.count();
          if (last > 0) return true; // rows rendered — settled immediately
          // No rows yet. The no-data marker alone is NOT trustworthy on first sight (it shows during
          // the initial `[]` before the stream emits). Require it to PERSIST across consecutive polls.
          if ((await noData.count()) > 0) {
            noDataStreak += 1;
            return noDataStreak >= NODATA_STABLE_POLLS;
          }
          // Marker gone (stream still loading / re-rendering) → reset the streak and keep waiting.
          noDataStreak = 0;
          return false;
        },
        { message: 'table rows: the data stream never settled (no rows and no stable "No data" marker)', timeout: 20_000 },
      )
      .toBe(true)
      .catch(() => undefined); // a genuinely-empty table with no no-data row → return last (0) below
    return last;
  }
}
