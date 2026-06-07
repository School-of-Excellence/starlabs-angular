// big-cohorts.page.ts — page object for the B!G Cohorts screen (route /bigcohorts).
//
// Component: BigCohortClone2Component (selector `app-big-cohort-clone-2`),
//   src/app/big/big-cohort-clone-2/big-cohort-clone-2.component.{ts,html}.
// Recon: e2e/queue/recon/big.md (BIG-07 selector table + §3e write shapes + §4b "no in-component
//   role gate") and e2e/queue/recon/testids.md ("BIG surface"). Auth helper:
//   e2e/queue/support/auth.ts (loginAsBigAdmin lands on /big-dashboard; this object only navigates
//   the already-authenticated page to /bigcohorts).
//
// ⚠ SELECTOR REALITY — there are ZERO `data-testid` attributes on this screen. big.md §2 PROPOSED
//   `cohorts-create` / `cohort-{docid}` hooks, but testids.md (the authoritative shipped map) does
//   NOT list any cohort hooks — the test-hooks step did not add them here (verified: `grep
//   data-testid big-cohort-clone-2.component.html` → none). So every selector below falls back to the
//   stable class/text anchors cited in big.md BIG-07, in the required priority order
//   (data-testid → id/formcontrolname → role+name → unique class/text). See RISKS at the bottom of
//   this file. If/when the hooks ship, swap the SEL constants — the method contracts stay identical.
//
// ANTI-CIRCULARITY (the whole point of the rebuild): every reader returns a value the APP computed
// from its OWN Firestore read, never a value the test wrote, and never a number re-derived in the
// test:
//   • cohortSize(name) reads the participant count the component RENDERS on the cohort card's
//     "Participants" segment button — `{{cohorts['participantidlist']?.length || 0}}` (html:310-311).
//     That array comes from the `big cohorts` doc the component itself loaded (ts:341) and is mutated
//     in-memory after a move (ts:1216-1221), so the rendered number is always the app's own count.
//   • auditLogRows opens the Progression report (the "Progression" button → `openProgressionReport()`
//     → `loadProgressionData()`, ts:2354-2370) which does a FRESH `getDocs` of the `big cohorts log`
//     collection and renders one timeline row per log entry (html:916-943). We count the rendered
//     "moved" rows — i.e. a value the app produced from reading the CF/app-written audit collection,
//     not anything the test wrote. This is the silent-data-gap reader for the cohort-move invariant
//     (big.md §3e "good silent gap invariant"): seed N, move 1 via UI, poll auditLogRows == prev+1.
//   • moveParticipant(sel, toCohort) drives the REAL row "Move" menu (a real click on the live ⇄
//     button, a real fill of the menu's cohort search, a real click on the target cohort item),
//     committing the component's `moveParticipantToCohort` write (big.md §3e, ts:1194). It asserts
//     nothing itself — the spec asserts the app-computed effect (cohortSize / auditLogRows).
//
// Reuse: this object owns ONLY B!G-Cohorts selectors/clicks. Firestore-side anti-circular checks
// (comparing a count to a KNOWN-SEEDED number) belong in the spec via
// e2e/queue/support/firestore-admin.ts / e2e/lib/assertions.ts — not here.

import { Page, Locator, expect } from '@playwright/test';
import { loginAsBigAdmin } from '../support/auth';

/** Route segment (query-stripped guard key is `/bigcohorts`, big.md §4a). baseURL comes from the
 *  Playwright config — no project id hardcoded (SHARED CONVENTIONS). */
const ROUTE = '/bigcohorts';

/** Options for {@link BigCohortsPage.open}. */
export interface CohortsOpenOpts {
  /** Skip the real login (caller already authenticated) and only navigate + wait for the brand. */
  skipLogin?: boolean;
  /** Override the actor email to log in as (defaults to the seeded BIG admin). Pass the seed's
   *  mentor email when the spec seeds its own BIG world so the data-driven authGuard admits us. */
  email?: string;
  /** Max time to wait for the route + brand to mount. Default 30000ms. */
  timeoutMs?: number;
}

const SEL = {
  // --- Page shell --------------------------------------------------------------------------------
  // No data-testid exists; the brand chip "B!G Cohorts" is the stable mount signal (html:12-15).
  brand: '.brand',                                   // contains text "B!G Cohorts" (html:12)
  loader: '.loader-wrap',                            // *ngIf="loading" spinner wrapper (html:2)
  // --- Cohort cards ------------------------------------------------------------------------------
  card: 'article.card',                              // one per cohort (#cohortCard template, html:241)
  cardTitle: '.card-title',                          // {{cohorts['name']}} (html:251)
  // The "Participants" segment button carries the count `({{participantidlist?.length || 0}})`
  // (html:307-312). The `.seg` group holds an Activities button and a Participants button; the
  // Participants one is identified by its text. We scope the count read to that button.
  segButtons: '.seg button',                         // Activities + Participants seg toggles (html:303-312)
  // --- Participant rows + per-row Move menu (html:435-475) ----------------------------------------
  participantRow: '.card-body .row',                 // *ngFor over getFilteredParticipants (html:435)
  rowName: '.row-name',                              // {{mapProfile[participant] || participant}} (html:443)
  rowMoveBtn: 'button.row-move',                     // per-row ⇄ "Move to another cohort" (html:449)
  // The open mat-menu (overlay) for a single-row move (html:455 #moveMenu). Material renders menu
  // panels in an overlay container appended to <body>, not inside the card — so menu locators are
  // page-level, scoped by the menu's own class `.move-participant-menu`.
  moveMenuPanel: '.move-participant-menu',           // mat-menu class (html:455 / 332)
  moveMenuSearch: '.move-participant-menu .move-menu-search input', // cohort search inside the menu (html:461)
  moveMenuItem: '.move-participant-menu .move-menu-list button[mat-menu-item]', // target-cohort rows (html:465)
  moveMenuItemName: 'span',                          // {{targetCohort.name}} (html:468)
  moveMenuEmpty: '.move-participant-menu .move-menu-empty',          // "No cohorts found" (html:471)
  // --- Progression report (audit history of `big cohorts log`) ------------------------------------
  progressionBtn: 'button.btn-success',              // "Progression" (html:39) — opens the report
  progressionDialog: '.prog-dialog',                 // dialog shell (html:896)
  progressionClose: '.prog-dialog .prog-close',      // dialog "×" close button → closeProgressionDialog() (html:901)
  progressionScrim: '.dialog-scrim',                 // full-viewport scrim wrapping the dialog (html:896)
  progressionLoader: '.prog-dialog .loader-wrap',    // *ngIf="progressionLoading" (html:907)
  // Each timeline log row carries a left border + the status text; a "moved" row also renders the
  // `from → to` line (html:924-941). The per-row block is the inner div with `border-left` style;
  // the most stable text-bearing anchor is the `<strong>` holding the titlecased status.
  progressionStatus: '.prog-dialog .prog-body strong', // status label per log row (html:928)
  // Footer summary: "{{progressionData.length}} total activities" (html:949) — the app's own count of
  // ALL `big cohorts log` rows it loaded. Used as the total-rows reader (see auditLogRows()).
  progressionFooter: '.prog-dialog .prog-foot',      // (html:946-950)
} as const;

/** Poll budget for async Firestore-backed reads (mirrors the queue config expect timeout). The cohort
 *  list loads via `getDocs` (one-shot but still async, ts:341) and the move mutates state
 *  asynchronously, so reads poll per SHARED CONVENTIONS. */
const POLL: { timeout: number; intervals: number[] } = { timeout: 20_000, intervals: [250, 500, 1000] };

export class BigCohortsPage {
  constructor(private readonly page: Page) {}

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Log in as the seeded BIG admin (via the REAL login form — `loginAsBigAdmin`, which lands on
   * /big-dashboard so the data-driven authGuard has already admitted us), then open /bigcohorts and
   * wait until the screen has mounted past its loading spinner (the "B!G Cohorts" brand chip renders
   * only inside the `*ngIf="!loading"` wrapper, html:7/12). bigcohorts has NO in-component role gate
   * (big.md §4b) — only the data-driven authGuard, which the seeded BIG-admin / mentor passes.
   *
   * Mirrors BigDashboardPage / BigMiscPage, which log in inside open(): this object USED to assume the
   * spec had already authenticated, but the BIG-08 spec calls open() directly, so an un-authenticated
   * goto('/bigcohorts') bounced to /login and the brand never rendered. Pass `{ skipLogin: true }` when
   * the caller already logged in, or `{ email }` to pick a specific seeded actor (e.g. the run's mentor).
   */
  async open(opts: CohortsOpenOpts = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    if (!opts.skipLogin) {
      await loginAsBigAdmin(this.page, 0, { timeoutMs: timeout, email: opts.email });
    }
    await this.page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    // Confirm the guard admitted us to the route (it did not bounce back to /login).
    await this.page.waitForURL((u) => u.pathname.includes('bigcohorts'), { timeout });
    // Loader disappears and the dashboard wrapper (with the brand chip) appears once cohorts resolve.
    await expect(this.page.locator(SEL.brand)).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------
  // Locators
  // ---------------------------------------------------------------------------

  /** The cohort card whose `.card-title` text exactly matches `name`. Exact match avoids a card named
   *  "Alpha" colliding with "Alpha 2". */
  cohortCard(name: string): Locator {
    return this.page
      .locator(SEL.card)
      .filter({ has: this.page.locator(SEL.cardTitle, { hasText: exactText(name) }) });
  }

  /** A participant row (inside a given cohort card) whose displayed name === `participantLabel`.
   *  `participantLabel` is what the app SHOWS: `mapProfile[id]` (a name) when resolved, else the raw
   *  participant id (html:443). The card must be in Participants view (the default `contentview`,
   *  set on load at ts:344) for rows to be in the DOM. */
  participantRow(cohortName: string, participantLabel: string): Locator {
    return this.cohortCard(cohortName)
      .locator(SEL.participantRow)
      .filter({ has: this.page.locator(SEL.rowName, { hasText: exactText(participantLabel) }) });
  }

  // ---------------------------------------------------------------------------
  // Reads (APP-computed) — polled because the cohort data load is async
  // ---------------------------------------------------------------------------

  /**
   * Return the participant count the component RENDERS for the cohort named `name` — i.e.
   * `participantidlist?.length` shown in the "Participants ({n})" segment button (html:310-311).
   *
   * APP-computed: the number comes from the `big cohorts` doc the component loaded and (after a move)
   * mutated in memory; the test never supplies it. Polls until the card and its Participants button
   * have rendered a parseable number (the cohort `getDocs` is async; SHARED CONVENTIONS require poll
   * for any Firestore-backed read).
   *
   * NOTE on the count semantics: the bracket shows the FULL list length when there is no participant
   * search active, but `({matching}/{total})` when `participantSearchQuery` is set (html:311). This
   * reader assumes NO participant search is active (the default after `open()`); it returns the total.
   * If a spec applies a participant search, read the matching count separately rather than via this
   * method.
   */
  async cohortSize(name: string): Promise<number> {
    const participantsBtn = this.participantsSegButton(name);
    let last: number | null = null;
    await expect
      .poll(
        async () => {
          if ((await participantsBtn.count()) === 0) return false;
          last = await this.parseCount(participantsBtn);
          return last !== null;
        },
        {
          ...POLL,
          message:
            `cohortSize: could not read the Participants count for cohort "${name}". ` +
            `Is the cohort rendered (exact title match) and is the card in Participants view? ` +
            `(no data-testid exists on this screen — selector is the .seg "Participants" button text, html:307-312)`,
        },
      )
      .toBe(true);
    return last ?? 0;
  }

  /**
   * Open the Progression report and return the number of audit-log entries the app rendered from the
   * `big cohorts log` collection.
   *
   * By default returns the TOTAL row count the app reports in the dialog footer
   * ("{progressionData.length} total activities", html:949) — the app's own count of every
   * `big cohorts log` doc it loaded (ts:2371). Pass `{ movedOnly: true }` to instead count only rows
   * whose rendered status is "moved" (the rows a cohort move writes, big.md §3e) by counting the
   * status `<strong>` labels (html:928) that read "Moved".
   *
   * APP/CF-OUTPUT, not test-written: `loadProgressionData()` re-reads the collection fresh each open
   * (ts:2369). This is the silent-data-gap reader — a spec seeds N log rows (or notes the pre-move
   * count), moves a participant via `moveParticipant`, then polls until this grows by 1.
   */
  async auditLogRows(opts: { movedOnly?: boolean } = {}): Promise<number> {
    await this.openProgressionReport();
    try {
      if (opts.movedOnly) {
        // Count rendered "Moved" status labels (one per moved log row, html:928).
        let count = 0;
        await expect
          .poll(
            async () => {
              count = await this.page.locator(SEL.progressionStatus, { hasText: exactText('Moved') }).count();
              // Resolve once the dialog has finished loading (so a true 0 is trustworthy, not "still loading").
              return (await this.page.locator(SEL.progressionLoader).count()) === 0;
            },
            {
              ...POLL,
              message:
                'auditLogRows(movedOnly): progression dialog never finished loading while counting "Moved" rows.',
            },
          )
          .toBe(true);
        return count;
      }
      // Total: read the footer count the app prints ("{n} total activities").
      return await this.readProgressionTotal();
    } finally {
      // ALWAYS dismiss the Progression dialog before returning. Its full-viewport `.dialog-scrim`
      // overlay (html:896) sits ABOVE the cohort cards and intercepts pointer events, so a following
      // interaction (e.g. a per-row Move button click in moveParticipant) would otherwise retry-until-
      // test-timeout against the scrim — the exact 120s "…dialog-scrim subtree intercepts pointer events"
      // failure BIG-08 hit when it read the audit baseline (auditLogRows) BEFORE moving a participant.
      await this.closeProgressionReport();
    }
  }

  // ---------------------------------------------------------------------------
  // Actions (real clicks/fills on the live UI)
  // ---------------------------------------------------------------------------

  /**
   * Move a single participant out of its current cohort into the cohort named `toCohort`, by driving
   * the REAL per-row Move menu (big.md §3e / html:449-475). Steps, all real interactions:
   *   1. resolve the participant row by what the app displays (`sel`, see below) inside `fromCohort`,
   *   2. real-click that row's ⇄ "Move" button → opens the `#moveMenu` mat-menu overlay,
   *   3. real-fill the menu's cohort search with `toCohort` (the menu filters live, html:461),
   *   4. real-click the target-cohort item whose name === `toCohort` (html:465-468).
   * The component then commits `moveParticipantToCohort(...)` (ts:1194): arrayRemove from source,
   * arrayUnion into target, and a `big cohorts log` row (`createMoveLog`, ts:1233).
   *
   * This method ASSERTS NOTHING about the result — the spec must assert the APP-computed effect
   * (`cohortSize(toCohort)` grew, `auditLogRows()` grew). It only waits for the move guard to release
   * (the menu item is `[disabled]=isMovingParticipant`, html:344/467) so a following read is stable.
   *
   * @param sel  the participant selector: `{ fromCohort, participant }` where `participant` is the
   *             label the app SHOWS in the row (`mapProfile[id]` name when known, else the raw id —
   *             html:443). `fromCohort` is the source cohort's title.
   * @param toCohort the destination cohort's title (exact match against the menu item name).
   */
  async moveParticipant(sel: { fromCohort: string; participant: string }, toCohort: string): Promise<void> {
    const row = this.participantRow(sel.fromCohort, sel.participant);
    await expect(row, `moveParticipant: participant row "${sel.participant}" not found in cohort "${sel.fromCohort}"`).toBeVisible({
      timeout: POLL.timeout,
    });

    // 1) open the per-row move menu (the ⇄ button only renders when participant-select mode is OFF,
    //    which is the default — html:449).
    const moveBtn = row.locator(SEL.rowMoveBtn);
    await expect(moveBtn).toBeVisible();
    await moveBtn.click();

    // 2) the mat-menu panel renders in the overlay container; wait for it.
    const panel = this.page.locator(SEL.moveMenuPanel);
    await expect(panel).toBeVisible();

    // 3) filter the menu to the target cohort (live `onMoveMenuSearch`, html:461). This narrows
    //    `moveMenuFilteredCohorts` so the right item is unambiguous.
    const search = this.page.locator(SEL.moveMenuSearch);
    await search.fill(toCohort);

    // 4) click the target-cohort item by exact name.
    const target = this.page
      .locator(SEL.moveMenuItem)
      .filter({ has: this.page.locator(SEL.moveMenuItemName, { hasText: exactText(toCohort) }) })
      .first();
    await expect(target, `moveParticipant: target cohort "${toCohort}" not present in the move menu`).toBeVisible({
      timeout: POLL.timeout,
    });
    await target.click();

    // The move commits asynchronously (updateDoc ×2 + setDoc log, ts:1200-1254). The menu closes on
    // selection; wait for it to detach so the card has re-rendered before any follow-up read.
    await expect(panel).toBeHidden({ timeout: POLL.timeout });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** The "Participants" seg button within a named cohort card (the one whose text contains the word
   *  "Participants"; the sibling button reads "Activities"). html:307-312. */
  private participantsSegButton(cohortName: string): Locator {
    return this.cohortCard(cohortName).locator(SEL.segButtons).filter({ hasText: 'Participants' });
  }

  /** Open the Progression report dialog and wait for it to finish its fresh `big cohorts log` load. */
  private async openProgressionReport(): Promise<void> {
    // Idempotent: only click the trigger if the dialog isn't already open.
    if ((await this.page.locator(SEL.progressionDialog).count()) === 0) {
      const btn = this.page.locator(SEL.progressionBtn);
      await expect(btn, 'openProgressionReport: "Progression" button not found (html:39)').toBeVisible();
      await btn.click();
    }
    await expect(this.page.locator(SEL.progressionDialog)).toBeVisible({ timeout: POLL.timeout });
    // Wait out the in-dialog loading spinner (`*ngIf="progressionLoading"`, html:907).
    await expect
      .poll(async () => (await this.page.locator(SEL.progressionLoader).count()) === 0, {
        ...POLL,
        message: 'openProgressionReport: progression data never finished loading.',
      })
      .toBe(true);
  }

  /**
   * Close the Progression report dialog (real click on its "×" `.prog-close` button →
   * `closeProgressionDialog()` sets `showProgressionDialog=false`, removing the whole `.dialog-scrim`
   * `*ngIf` subtree, html:896/901). Idempotent: a no-op when the dialog is already closed. Waits until
   * the scrim has fully detached so the page underneath is clickable again — without this the scrim
   * keeps intercepting pointer events and any following click (e.g. a row Move button) retries to the
   * test timeout (the BIG-08 failure). Falls back to a scrim/backdrop click, then Escape, if the close
   * button is momentarily not hittable.
   */
  async closeProgressionReport(): Promise<void> {
    if ((await this.page.locator(SEL.progressionDialog).count()) === 0) return; // already closed
    const closeBtn = this.page.locator(SEL.progressionClose);
    if ((await closeBtn.count()) > 0) {
      await closeBtn.first().click({ timeout: POLL.timeout }).catch(() => undefined);
    }
    // If the dialog is still up, dismiss by clicking the scrim backdrop, then by Escape.
    if ((await this.page.locator(SEL.progressionDialog).count()) > 0) {
      await this.page
        .locator(SEL.progressionScrim)
        .first()
        .click({ position: { x: 5, y: 5 }, timeout: POLL.timeout })
        .catch(() => undefined);
    }
    if ((await this.page.locator(SEL.progressionDialog).count()) > 0) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
    }
    // Confirm the scrim/dialog actually detached so the cards beneath are interactable again.
    await expect(this.page.locator(SEL.progressionDialog), 'progression dialog did not close (scrim still intercepting clicks)')
      .toHaveCount(0, { timeout: POLL.timeout });
  }

  /** Read the app's printed total-rows count from the progression footer ("{n} total activities",
   *  html:949). Polls until the footer renders a number. */
  private async readProgressionTotal(): Promise<number> {
    const foot = this.page.locator(SEL.progressionFooter);
    let last: number | null = null;
    await expect
      .poll(
        async () => {
          if ((await foot.count()) === 0) return false;
          // Footer text is "<n> participant(s) · <m> total activities" — pull the number before
          // "total activities".
          const txt = (await foot.textContent())?.trim() ?? '';
          const m = txt.match(/(\d+)\s+total activities/i);
          last = m ? Number.parseInt(m[1], 10) : null;
          return last !== null;
        },
        {
          ...POLL,
          message: 'auditLogRows: progression footer "{n} total activities" never rendered a number (html:949).',
        },
      )
      .toBe(true);
    return last ?? 0;
  }

  /**
   * Parse the participant count out of a "Participants ({n})" (or "Participants ({matching}/{total})")
   * seg-button label. Returns the FIRST integer in parentheses — for the no-search case that is the
   * total; for the search case (`{matching}/{total}`) it is the matching count. Returns null when no
   * parenthesised number is present yet.
   */
  private async parseCount(loc: Locator): Promise<number | null> {
    const txt = (await loc.textContent())?.trim() ?? '';
    // e.g. "people Participants (3)" or "people Participants (1/3)"
    const m = txt.match(/\((\d+)/);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }
}

/** Build a RegExp that matches the given literal as the FULL trimmed text of an element, so partial
 *  collisions (e.g. "Alpha" vs "Alpha 2") don't match. Playwright's `hasText: RegExp` matches against
 *  the element's text content; anchoring with optional surrounding whitespace makes it exact-ish while
 *  tolerating the icon/whitespace nodes Material injects. */
function exactText(literal: string): RegExp {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*${escaped}\\s*$`);
}
