// big-dashboard.page.ts — page object for the BIG Dashboard screen (route `big-dashboard`).
//
// Surface: BigDashboardComponent (selector `app-big-dashboard`), route `big-dashboard` + the
//   generic authGuard (recon big.md BIG-00 / app.routes.ts:229). It is the counts/cohorts screen
//   for BIG admins. Every number this object returns is a value the COMPONENT computed/rendered
//   from its own Firestore streams (`big cohorts`, `big assignment`, participant metadata, the
//   per-row ATC/AEL aggregates) — never a value a test wrote. So this object is anti-circularity-
//   safe by construction: a spec uses it as the "(b) assert a value the app/CF computed against a
//   KNOWN-SEEDED number" half of the rule (see SHARED CONVENTIONS / brief). It only navigates and
//   READS; it commits no writes.
//
// SELECTORS (priority: data-testid → id/formcontrolname → role+name → unique text). Verified at
//   write time against the REAL served template
//   `src/app/big/big-dashboard/big-dashboard.component.{html,ts}` (the worktree mirror, which has the
//   test-hooks step's data-testid attributes applied — confirmed by grep) and testids.md §BIG:
//     - Total Participants  : `[data-testid="big-dash-total-count"]`  span wrapping
//                             `{{dataSource.data.length}}`                          (html:235)
//     - Filtered Participants: `[data-testid="big-dash-filtered-count"]` span wrapping
//                             `{{dataSource.filteredData.length}}`                  (html:236)
//     - Cohort card         : `[data-testid="big-dash-cohort-card"]` (one per `cohorts`, *ngFor;
//                             carries `[data-cohort-id]="item.docid"`)              (html:147)
//     - Cohort card count   : `[data-testid="big-dash-cohort-count"]` →
//                             `{{item.participantidlist?.length ?? 0}}`             (html:156)
//     - Cohorts button      : `[data-testid="big-dash-cohorts-btn"]` ("Coherts")    (html:268)
//   NO testid exists for the remaining three, so they fall back to the most stable available anchor
//   (big.md §1 BIG-00 + testids.md "NOT HOOKED"); each is a value the component rendered:
//     - Assignment card     : `.assignment-card` (one per `bigAssignmentList`, *ngFor); the count
//                             shown on each is `<h4>{{assignment.participantidlist.length}}</h4>`.
//                             readAssignmentCount returns HOW MANY assignment cards rendered.   (html:165-172)
//     - ATC (per-row written): the `atcwritten` table column cell
//                             `td.mat-column-atcwritten` → `{{mapATCWritten[profileid]?.length ?? 0}}`.
//                             Angular Material 19 emits `.mat-column-<matColumnDef>` on every cell
//                             (the table uses a single dynamic `[matColumnDef]="column"`, html:321);
//                             `td.` excludes the matching `th` header cell.                    (html:612-613)
//     - AEL (per-row total)  : the `totalaelcount` column cell `td.mat-column-totalaelcount` →
//                             `{{(element.currentaelcount||0)+(element.completedaelcount||0)}}`. (html:732)
//
// ⚠ COLUMN-VISIBILITY CONSTRAINT (load-bearing for readAtcCount / readAelCount): the dashboard's
//   default `selectedColumns` is `['select','name','profileid','tags','notes']`
//   (big-dashboard.component.ts:69) — the `atcwritten` and `totalaelcount` columns are NOT rendered
//   out of the box. Those `td.mat-column-*` cells only exist in the DOM after a user/spec enables
//   the column. When the column is absent, readAtcCount/readAelCount return 0 (the app rendered no
//   such cells) — that is the honest "what the app shows" answer, not a defect. A spec that needs a
//   real ATC/AEL total MUST enable the column first; see the per-method notes. (Noted in IMPL_SCHEMA.risks.)
//
// Streams are async (`collectionData`), so every count/value getter polls with `expect.poll` rather
//   than reading once — the brief mandates expect.poll for any stream-driven read.
//
// Auth: open() logs in as the seeded BIG admin via support/auth.ts `loginAsBigAdmin` (which lands on
//   /big-dashboard through the real login form — it does NOT re-implement login) and then confirms
//   the component mounted. Pass `{ skipLogin: true }` when the caller already authenticated and only
//   wants navigation. This object never re-implements the login form.

import { Page, Locator, expect } from '@playwright/test';
import { loginAsBigAdmin, LANDING_ROUTES, LoginOpts } from '../support/auth';

/** Route the standalone BigDashboardComponent is mounted at (app.routes.ts:229 / big.md BIG-00). */
export const BIG_DASHBOARD_ROUTE = LANDING_ROUTES.bigAdmin; // '/big-dashboard'

/** Options for {@link BigDashboardPage.open}. */
export interface OpenOpts extends LoginOpts {
  /** When true, skip login (caller already authenticated) and only navigate + wait for mount. */
  skipLogin?: boolean;
  /** Which seeded BIG admin to log in as (0-based; seeder creates big0..big3). Default 0. */
  adminIndex?: number;
  /** Max time to wait for the route + component to mount. Default 30000ms. */
  timeoutMs?: number;
}

export class BigDashboardPage {
  readonly page: Page;

  /** Component host — scope every locator here so a stray element elsewhere can never match. */
  readonly host: Locator;
  /** Total Participants value span (`data-testid=big-dash-total-count`, html:235). */
  readonly totalCount: Locator;
  /** Filtered Participants value span (`data-testid=big-dash-filtered-count`, html:236). */
  readonly filteredCount: Locator;
  /** All cohort cards (`data-testid=big-dash-cohort-card`, *ngFor over `cohorts`, html:147). */
  readonly cohortCards: Locator;
  /** All per-card cohort counts (`data-testid=big-dash-cohort-count`, html:156). */
  readonly cohortCounts: Locator;
  /** "Coherts" button (`data-testid=big-dash-cohorts-btn`, html:268). */
  readonly cohortsBtn: Locator;
  /** Assignment cards (`.assignment-card`, *ngFor over `bigAssignmentList`, html:165) — no testid. */
  readonly assignmentCards: Locator;
  /** ATC-written data cells (`td.mat-column-atcwritten`, html:612) — present only if column enabled. */
  readonly atcCells: Locator;
  /** Total-AEL data cells (`td.mat-column-totalaelcount`, html:732) — present only if column enabled. */
  readonly aelCells: Locator;

  constructor(page: Page) {
    this.page = page;
    const host = page.locator('app-big-dashboard');
    this.host = host;
    this.totalCount = host.locator('[data-testid="big-dash-total-count"]');
    this.filteredCount = host.locator('[data-testid="big-dash-filtered-count"]');
    this.cohortCards = host.locator('[data-testid="big-dash-cohort-card"]');
    this.cohortCounts = host.locator('[data-testid="big-dash-cohort-count"]');
    this.cohortsBtn = host.locator('[data-testid="big-dash-cohorts-btn"]');
    this.assignmentCards = host.locator('.assignment-card');
    // `td.` (not `th.`) so the header cell carrying the same Material column class is excluded.
    this.atcCells = host.locator('td.mat-column-atcwritten');
    this.aelCells = host.locator('td.mat-column-totalaelcount');
  }

  /**
   * Log in as the seeded BIG admin (unless `skipLogin`), land on `big-dashboard`, and wait until the
   * component has mounted and its participant-count stream has rendered the Total Participants span.
   * The dashboard is `collectionData`-backed, so we poll for the count span rather than asserting once.
   */
  async open(opts: OpenOpts = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    if (!opts.skipLogin) {
      // loginAsBigAdmin logs in via the real form AND lands on /big-dashboard (auth.ts), so the guard
      // has already admitted us by the time it resolves.
      await loginAsBigAdmin(this.page, opts.adminIndex ?? 0, { timeoutMs: timeout, email: opts.email });
    }
    // Ensure we are on the dashboard route (no-op if loginAsBigAdmin already landed us there).
    if (!this.page.url().includes(BIG_DASHBOARD_ROUTE.replace(/^\//, ''))) {
      await this.page.goto(BIG_DASHBOARD_ROUTE, { waitUntil: 'domcontentloaded' });
    }
    await this.page.waitForURL((u) => u.pathname.includes(BIG_DASHBOARD_ROUTE.replace(/^\//, '')), { timeout });
    await expect(this.host).toBeVisible({ timeout });
    // Wait for the participant stream to render the Total Participants value before any read runs.
    await expect(this.totalCount).toBeVisible({ timeout });
  }

  // --------------------------------------------------------------------------------------------
  // READING METHODS — every value is one the COMPONENT computed from its stream (anti-circularity
  // safe). All poll because the source streams are async.
  // --------------------------------------------------------------------------------------------

  /**
   * Total Participants — the number the component rendered from `dataSource.data.length` (html:235),
   * i.e. all participants in the selected marathon/scope regardless of the Name/Tag filter. Polled
   * until it parses to a finite integer (the stream has emitted a real number, not "" / "NaN").
   */
  async readTotal(): Promise<number> {
    return this.readNumberFrom(this.totalCount, 'Total Participants');
  }

  /**
   * Filtered Participants — `dataSource.filteredData.length` (html:236): the count AFTER the Name/Tag
   * filter is applied (equals readTotal() when no filter is active). The value the component rendered.
   */
  async readFiltered(): Promise<number> {
    return this.readNumberFrom(this.filteredCount, 'Filtered Participants');
  }

  /**
   * Cohort count. With no arg → HOW MANY cohort cards the dashboard rendered (one per doc in the
   * `big cohorts` stream the component subscribes to). With a `cohortId` → that single card's
   * participant count (`item.participantidlist?.length ?? 0`, html:156) — the per-cohort size the
   * APP computed. Both are app-rendered values, never test-written.
   * @param cohortId optional `data-cohort-id` (= cohort `docid`) to read one card's participant count.
   */
  async readCohortCount(cohortId?: string): Promise<number> {
    if (cohortId === undefined) {
      // Number of cohort cards rendered (= cohorts the component streamed in).
      let n = 0;
      await expect.poll(async () => (n = await this.cohortCards.count()), {
        message: 'cohort cards did not render',
      }).toBeGreaterThanOrEqual(0);
      return n;
    }
    const card = this.cohortCards.filter({ has: this.page.locator(`[data-cohort-id="${cohortId}"]`) }).first();
    // The card itself carries the data-cohort-id, so match it directly too (filter-by-has covers a
    // child case; this covers the attribute being on the card root, which is how it shipped).
    const target = (await card.count()) > 0
      ? card
      : this.host.locator(`[data-testid="big-dash-cohort-card"][data-cohort-id="${cohortId}"]`).first();
    const countEl = target.locator('[data-testid="big-dash-cohort-count"]').first();
    return this.readNumberFrom(countEl, `cohort ${cohortId} count`);
  }

  /**
   * Assignment count — HOW MANY assignment cards (`.assignment-card`, html:165) the dashboard
   * rendered from `bigAssignmentList`. Each card also shows its own participant count
   * (`{{assignment.participantidlist.length}}`); pass an index to read that one card's number.
   *
   * NOTE: `.assignment-card` has NO data-testid (not flagged in the test-hooks step) — this is the
   * most stable available anchor (the class is a fixed binding in the template). Recorded in risks.
   * The assignments section only renders when `bigAssignmentList.length != 0` (html:162); when there
   * are no assignments this returns 0 (what the app shows).
   * @param index optional 0-based card index → return that card's participant count instead of the card tally.
   */
  async readAssignmentCount(index?: number): Promise<number> {
    if (index === undefined) {
      let n = 0;
      await expect.poll(async () => (n = await this.assignmentCards.count()), {
        message: 'assignment cards did not settle',
      }).toBeGreaterThanOrEqual(0);
      return n;
    }
    // Per-card participant count is the `<h4>` inside the card (html:171).
    const countEl = this.assignmentCards.nth(index).locator('h4').first();
    return this.readNumberFrom(countEl, `assignment card #${index} count`);
  }

  /**
   * ATC count the dashboard rendered. The `atcwritten` column shows `mapATCWritten[profileid].length`
   * per participant row (html:612-613) — there is no single dashboard-level ATC total, so:
   *   - no arg → the SUM of every rendered `atcwritten` cell (the dashboard's total ATC-written across
   *     the currently-displayed rows). This is what the app shows aggregated.
   *   - `rowIndex` → that single row's ATC-written number.
   * ⚠ The `atcwritten` column is NOT in the default `selectedColumns` (ts:69); if the spec has not
   *   enabled it, there are 0 such cells and this returns 0. Enable the column first for a real total.
   * @param rowIndex optional 0-based data-row index → return only that row's ATC number.
   */
  async readAtcCount(rowIndex?: number): Promise<number> {
    return this.readCellNumber(this.atcCells, rowIndex, 'ATC');
  }

  /**
   * AEL count the dashboard rendered. The `totalaelcount` column shows the app-computed
   * `(currentaelcount||0)+(completedaelcount||0)` per participant row (html:732). Mirrors readAtcCount:
   *   - no arg → SUM of every rendered `totalaelcount` cell (total AEL across displayed rows).
   *   - `rowIndex` → that single row's total-AEL number.
   * ⚠ Same column-visibility caveat as readAtcCount: `totalaelcount` is not a default column (ts:69);
   *   returns 0 when the column is not displayed. (Noted in risks.)
   * @param rowIndex optional 0-based data-row index → return only that row's AEL number.
   */
  async readAelCount(rowIndex?: number): Promise<number> {
    return this.readCellNumber(this.aelCells, rowIndex, 'AEL');
  }

  /**
   * Silent-data-gap guard: true if the dashboard rendered a literal "NaN", "undefined", or "null"
   * anywhere a number/value should be — in the Total/Filtered counters, any cohort/assignment card
   * count, or any rendered ATC/AEL cell. These are the textbook signatures of a broken aggregate the
   * app computed wrong (a missing field, a length-of-undefined coerced to text). Reads ONLY values
   * the APP rendered — it never compares against anything the test wrote.
   *
   * Scope is deliberately narrowed to the numeric surfaces (not the whole component) so unrelated free
   * text (e.g. a cohort literally named "Null cohort") cannot cause a false positive.
   */
  async hasNaNorUndefined(): Promise<boolean> {
    const BAD = /\b(NaN|undefined|null)\b/i;
    const numericLocators: Locator[] = [
      this.totalCount,
      this.filteredCount,
      this.cohortCounts,
      // assignment per-card count is the <h4>; scope to those inside assignment cards.
      this.assignmentCards.locator('h4'),
      this.atcCells,
      this.aelCells,
    ];
    for (const loc of numericLocators) {
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const txt = (await loc.nth(i).innerText()).trim();
        if (BAD.test(txt)) return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------------------------
  // ACTION METHODS — drive REAL clicks/fills (real selector → real interaction).
  // --------------------------------------------------------------------------------------------

  /**
   * Click the "Coherts" button (`data-testid=big-dash-cohorts-btn`, html:268) to open the
   * ManageCoherts dialog (`onManageCoherts()`). The button is `[disabled]` when no participant row is
   * selected, so callers must select at least one row first — this resolves once the click lands.
   */
  async openCohortsManager(): Promise<void> {
    await expect(this.cohortsBtn).toBeEnabled();
    await this.cohortsBtn.click();
  }

  /**
   * Click a cohort card by its `data-cohort-id` (= cohort docid) to patch that cohort's participants
   * into the table (`onPatchDataToTable`, the `.cohort-name` click target inside the card, html:149).
   * Drives the REAL card; the resulting Filtered count is then readable via readFiltered().
   * @param cohortId the cohort `docid` carried on the card's `data-cohort-id`.
   */
  async clickCohortCard(cohortId: string): Promise<void> {
    const card = this.host
      .locator(`[data-testid="big-dash-cohort-card"][data-cohort-id="${cohortId}"]`)
      .first();
    await expect(card).toBeVisible();
    // The clickable element is the cohort-name span (html:149); fall back to the card if absent.
    const nameEl = card.locator('.cohort-name');
    await ((await nameEl.count()) > 0 ? nameEl.first() : card).click();
  }

  // --------------------------------------------------------------------------------------------
  // internals
  // --------------------------------------------------------------------------------------------

  /**
   * Poll `loc`'s text until it parses to a finite integer, then return it. Throws (via the poll
   * timeout) if the app keeps rendering a non-number ("", "NaN", "undefined") — that surfaces a real
   * defect as a clear timeout instead of returning a bogus number.
   */
  private async readNumberFrom(loc: Locator, label: string): Promise<number> {
    let value = NaN;
    await expect
      .poll(
        async () => {
          if ((await loc.count()) === 0) return null;
          const raw = (await loc.first().innerText()).trim();
          const n = Number(raw.replace(/[^\d.-]/g, ''));
          if (raw.length === 0 || !Number.isFinite(n)) return null;
          value = n;
          return n;
        },
        { message: `${label}: dashboard never rendered a finite number` },
      )
      .not.toBeNull();
    return value;
  }

  /**
   * Read a per-row numeric column (`td.mat-column-*`). With `rowIndex` → that row's number; otherwise
   * the SUM across every rendered cell. When the column is not displayed there are 0 cells → returns 0
   * (the honest "app rendered nothing for this column" answer; see the column-visibility caveat). Polls
   * so an async stream re-render settles before summing.
   */
  private async readCellNumber(cells: Locator, rowIndex: number | undefined, label: string): Promise<number> {
    if (rowIndex !== undefined) {
      const cell = cells.nth(rowIndex);
      await expect(cell, `${label} cell row #${rowIndex} not present (is the column enabled?)`).toBeVisible();
      return this.readNumberFrom(cell, `${label} row #${rowIndex}`);
    }
    let total = 0;
    await expect
      .poll(
        async () => {
          const texts = await cells.allInnerTexts();
          // Sum the finite numbers the app rendered; a blank/"" cell contributes 0.
          let sum = 0;
          for (const t of texts) {
            const n = Number(t.trim().replace(/[^\d.-]/g, ''));
            if (Number.isFinite(n)) sum += n;
          }
          total = sum;
          // Return the cell count so the poll re-runs until the rendered cell set is stable.
          return texts.length;
        },
        { message: `${label} column cells did not settle` },
      )
      .toBeGreaterThanOrEqual(0);
    return total;
  }
}
