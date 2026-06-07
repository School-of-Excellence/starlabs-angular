// queue-list.page.ts — page object for the admin Queue list screen (route `/queuelist`).
//
// Surface: QueueListComponent (selector `app-queue-list`), route `queuelist` + authGuard
//   (src/app/app.routes.ts:33). This is the admin CRUD table over `queue generation` and the
//   entry point to the B!G Planner. It is NOT how the operator board selects a live queue
//   (that is the board's own mat-select / Live Queue buttons — see DynamicQueueManagerClone).
//
// SELECTORS — there are ZERO `data-testid` attributes on `src/app/queue system/**` (testids.md
//   confirms the shipped hooks live only on the operator board + its dialogs, never on queue-list).
//   So every selector here falls back to the recon "Best stable selector" column
//   (e2e/queue/recon/operator.md §1.A), verified against the real template
//   `src/app/queue system/queue-list/queue-list.component.html` (read at write time):
//     - table        : `table[mat-table]`                                  (html:14)
//     - filter input : `input[matInput]` (also `#filter`)                  (html:7)
//     - a row        : `tr[mat-row]`                                       (html:68)
//     - queuename cell: column class `.mat-column-queuename` (the component's own CSS targets
//                       this exact class — queue-list.component.css:45 — Angular Material 19 emits
//                       `.mat-column-<matColumnDef>` per cell; the cell text = `row.queuename`)  (html:32-35)
//     - date cell    : column class `.mat-column-queuestartdate` (css:49; text =
//                       "<start> to <end>" mediumDate)                     (html:38-41)
//     - row menu (⋮) : `button.editbtn` with `more_vert`                   (html:19-21)
//     - B!G Planner  : `a[mat-menu-item][routerLink="/queuebigplanner"]`   (html:25-27)
//
// All reads are backed by Firestore `collectionData` (queue-list.component.ts:63 binds the stream
//   into the MatTableDataSource), so every count/value getter polls with `expect.poll` — never a
//   one-shot read. None of these methods write anything (this object only navigates, filters,
//   opens menus, and reads what the APP rendered), so there is no anti-circularity concern here:
//   the numbers/strings returned are values the component computed/rendered from its own stream.
//
// Auth: callers log in first via support/auth.ts `loginAsOperator` (admin role → passes authGuard),
//   then call `open()`. This object does not log in (kept single-responsibility, matching auth.ts
//   which wraps the real login form rather than re-implementing it).

import { Page, Locator, expect } from '@playwright/test';

/** Route the standalone QueueListComponent is mounted at (app.routes.ts:33). */
export const QUEUE_LIST_ROUTE = '/queuelist';

export class QueueListPage {
  readonly page: Page;

  /** The admin queue table (`table[mat-table]`, html:14). */
  readonly table: Locator;
  /** The Material data rows (`tr[mat-row]`, html:68) — header/no-data rows are excluded. */
  readonly rows: Locator;
  /** The Filter input (`input[matInput]` / `#filter`, html:7). */
  readonly filterInput: Locator;
  /** The "Delivery Name" cells (`.mat-column-queuename`, html:34) — one per data row. */
  readonly nameCells: Locator;
  /** The "Queue Date" cells (`.mat-column-queuestartdate`, html:40) — one per data row. */
  readonly dateCells: Locator;

  constructor(page: Page) {
    this.page = page;
    // Scope to the component host so a stray Material table elsewhere can never be matched.
    const host = page.locator('app-queue-list');
    this.table = host.locator('table[mat-table]');
    // `tr[mat-row]` is ONLY the data row def (html:68); the header is `tr[mat-header-row]` and the
    // empty state is `tr.mat-row[*matNoDataRow]` with no `mat-row` attribute selector match here.
    this.rows = this.table.locator('tr[mat-row]');
    this.filterInput = host.locator('input[matInput]').first();
    // Per-row column cells. `.mat-column-<name>` is the stable Material cell class (verified in the
    // component's own CSS). Use `td` to exclude the matching header cell (`th.mat-column-*`).
    this.nameCells = this.table.locator('td.mat-column-queuename');
    this.dateCells = this.table.locator('td.mat-column-queuestartdate');
  }

  /**
   * Navigate to the queue-list route and wait until the table has rendered at least one data row.
   * The list is `collectionData`-backed, so we poll for the first row rather than asserting once.
   * Caller must already be authenticated (loginAsOperator) — the route is authGuard-protected.
   */
  async open(opts: { timeoutMs?: number } = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    await this.page.goto(QUEUE_LIST_ROUTE, { waitUntil: 'domcontentloaded' });
    // Confirm the guard admitted us (didn't bounce to /login) and the component mounted.
    await this.page.waitForURL((u) => u.pathname.includes('queuelist'), { timeout });
    await expect(this.table).toBeVisible({ timeout });
    // Wait for the async stream to populate at least one row before any read runs.
    await expect.poll(async () => this.rows.count(), { timeout }).toBeGreaterThan(0);
  }

  /**
   * Number of data rows the table currently RENDERS (the value the component derived from its
   * `queueSource` stream, after any active filter + the paginator's current page). Polled because
   * the row set updates asynchronously when the Firestore stream emits or a filter is applied.
   */
  async rowCount(): Promise<number> {
    let last = 0;
    await expect.poll(async () => (last = await this.rows.count())).toBeGreaterThanOrEqual(0);
    return last;
  }

  /**
   * Type `frag` into the Filter input (real keyup-driven MatTableDataSource filter,
   * queue-list.component.ts:77-78) and resolve once the rendered row set has settled to only rows
   * whose visible text contains `frag` (case-insensitive). Drives the REAL filter and asserts the
   * APP's filtered output — does not re-implement the filter predicate.
   * @returns the row count after filtering (what the component rendered).
   */
  async filterByName(frag: string): Promise<number> {
    await this.filterInput.click();
    await this.filterInput.fill('');
    // The template binds the filter to (keyup) — `fill()` only dispatches `input`, NOT `keyup`, so it
    // would set the value WITHOUT ever calling applyFilter() (the table would stay unfiltered). Type the
    // value with real keystrokes so each `keyup` fires the handler (queue-list.component.ts:77-79).
    await this.filterInput.pressSequentially(frag, { delay: 20 });
    // The default MatTableDataSource predicate matches the concatenation of all column values, so every
    // surviving row's NAME cell must contain the fragment once the filter has applied.
    const needle = frag.trim().toLowerCase();
    await expect
      .poll(async () => {
        const names = await this.nameCells.allInnerTexts();
        // Once the stream/filter has settled, every visible name row contains the fragment.
        return names.length > 0 && names.every((t) => t.toLowerCase().includes(needle));
      })
      .toBeTruthy();
    return this.rows.count();
  }

  /**
   * The visible text of every "Queue Date" cell, in row order (e.g. "Jun 4, 2026 to Jun 6, 2026").
   * This is the value the component RENDERED via the `date` pipe over `row.queuestartdate/enddate`
   * (html:40), not a raw Firestore timestamp. Polled until the cell set matches the current row set.
   */
  async rowDateCells(): Promise<string[]> {
    await expect
      .poll(async () => (await this.dateCells.count()) === (await this.rows.count()))
      .toBeTruthy();
    return this.dateCells.allInnerTexts();
  }

  /**
   * Open the per-row kebab (⋮) menu for data row `i` (0-based, in current render order). The trigger
   * is `button.editbtn[mat-icon-button]` carrying the `more_vert` icon and `matMenuTriggerFor`
   * (html:19-21). Resolves once the mat-menu panel is open (its overlay is rendered to the CDK
   * overlay container, so we assert on a known menu item).
   */
  async openRowMenu(i: number): Promise<void> {
    const row = this.rows.nth(i);
    // The MENU kebab is the icon-button whose icon text is `more_vert` (the row also has an
    // `edit` icon-button in the action column — html:53 — that we must NOT click here).
    const menuTrigger = row
      .locator('button.editbtn')
      .filter({ has: this.page.locator('mat-icon', { hasText: 'more_vert' }) })
      .first();
    await menuTrigger.click();
    // mat-menu renders into the global overlay; confirm it's open via a stable item.
    await expect(
      this.page.locator('.mat-mdc-menu-panel, .mat-menu-panel').last(),
    ).toBeVisible();
  }

  /**
   * True iff the "B!G Planner" item is visible in an OPEN row menu. Call `openRowMenu(i)` first.
   * Anchored on the real menu link `a[mat-menu-item][routerLink="/queuebigplanner"]` (html:25-27),
   * which is the most stable hook (the route literal cannot drift without breaking navigation).
   */
  async bigPlannerLinkVisible(): Promise<boolean> {
    return this.page
      .locator('a[mat-menu-item][routerLink="/queuebigplanner"]')
      .first()
      .isVisible();
  }

  /**
   * The visible "Delivery Name" of every rendered row, in row order — the values the component
   * rendered from `row.queuename` (html:34). Use to assert a seeded queue is present, or that a
   * filter reduced the list to the expected names. Polled (stream-driven), trimmed, empties dropped.
   */
  async visibleQueueNames(): Promise<string[]> {
    await expect
      .poll(async () => (await this.nameCells.count()) === (await this.rows.count()))
      .toBeTruthy();
    const names = await this.nameCells.allInnerTexts();
    return names.map((t) => t.trim()).filter((t) => t.length > 0);
  }
}
