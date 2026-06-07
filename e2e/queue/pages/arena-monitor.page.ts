// arena-monitor.page.ts — page object for the Arena Studio Activity monitor
// (route `/arenastudioactivity`, component `src/app/queue system/arenastudioactivity/`).
//
// Surface recon: e2e/queue/recon/studio.md §SS-15 and the testid map e2e/queue/recon/testids.md
// (section "arenastudioactivity.component.html"). Auth helpers: e2e/queue/support/auth.ts.
//
// ANTI-CIRCULARITY (the whole point of this suite — see SHARED CONVENTIONS):
//   Every reading method here returns a value the APP computed, asserted via expect.poll because
//   the board is driven by `collectionData`/`collectionSnapshots` (async Firestore streams):
//     - cardCount()           -> how many `live assignment` rows the app rendered after applying its
//                                OWN filter `status in ['live','recording']` for the selected queue
//                                (arenastudioactivity.component.ts:91-99). A spec asserts this against a
//                                KNOWN seeded number of live assignments — never a value the test wrote.
//     - participantTokenPairs -> the Client + EIS *names* the app resolved from raw profile ids via
//                                `mapProfile` (component renders `mapProfile[participantid]` /
//                                `mapProfile[eis]`, html:65-95). The mapping is APP output; a spec
//                                asserts the rendered names match the seeded specialists/participant.
//   closeStudio(i) is the only ACTION: it drives the real "Close Studio" button. Its effect
//   (live-assignment -> status:'completed', component ts:137-139; pairing -> status:null, ts:142-144)
//   is observable as the card LEAVING the ['live','recording'] render set — a spec re-polls
//   cardCount() to assert the CF/app output dropped, never reads back the write.
//
// SELECTOR PRIORITY (per SHARED CONVENTIONS): data-testid first (the test-hooks step added the
// `arena-*` ids documented in testids.md), then id/formcontrolname, then role+name, then unique text.
// See RISKS at the bottom of this file for the testids that the recon documents as shipped but which
// are absent from the current production template (added only by the test-hooks step in this worktree).

import { Page, Locator, expect } from '@playwright/test';
import { loginAsSpecialist, LoginOpts } from '../support/auth';

/** A single rendered participant card, with the names the APP computed from raw ids via `mapProfile`. */
export interface ArenaPair {
  /** Client name the app resolved (`mapProfile[item.participantid]`, html:74). '' if not yet mapped. */
  client: string;
  /** EIS specialist names the app resolved (`mapProfile[eis]` per `.eis-chip`, html:65-67). */
  eis: string[];
  /** Stable per-instance id the app stamped on the card (`data-participant-id = item.participantid`). */
  participantId: string;
}

export interface OpenOpts extends LoginOpts {
  /**
   * If true (default), perform the login as a seeded specialist before navigating. Pass false when the
   * caller already authenticated the page (e.g. logged in as the operator/developer for closeStudio).
   */
  login?: boolean;
  /** Which seeded specialist to log in as when `login` is true (0-based). Default 0. */
  specialistIndex?: number;
  /**
   * Queue NAME to select in the "Select Queue" picker. The board renders NO cards until a queue is
   * chosen (onQueueSelect wires the `live assignment` subscription, ts:90-99), so most specs pass this.
   * Omit to land on the monitor without selecting (e.g. to assert the empty/initial state).
   *
   * ⚠️ Multiple queues can share a name on the shared emulator (every variation spec seeds a queue
   * named "TEST 30-stage L3rqCr" under its own testrunid). Selecting by name alone picks the FIRST
   * match — which is often a DIFFERENT run's queue (whose live-assignments don't match this run's
   * seed), yielding zero cards. Prefer `queueId` (the exact `queue generation` docid) which targets
   * the option by its bound value (`mat-option [value]="list.docid"`).
   */
  queueName?: string;
  /**
   * Exact queue docid to select (the `queue generation` doc id, e.g. `<run>_<QUEUE_ID>`). When given,
   * the picker option is matched by its bound value (`ng-reflect-value` in dev mode) — UNAMBIGUOUS even
   * when several queues share a visible name. Takes precedence over `queueName`.
   */
  queueId?: string;
}

export class ArenaMonitorPage {
  readonly page: Page;
  readonly route = '/arenastudioactivity';

  constructor(page: Page) {
    this.page = page;
  }

  // ----- locators (testid-first; see RISKS for fallbacks if a hook is missing) -----

  /** Page title — confirms the monitor mounted. No testid in recon; the `h4.title` text is unique. */
  private title(): Locator {
    return this.page.locator('h4.title', { hasText: 'Arena Live Studio' });
  }

  /** Queue picker `mat-select` (testids.md: `arena-queue-select`). */
  private queueSelect(): Locator {
    return this.page.getByTestId('arena-queue-select');
  }

  /** All rendered participant cards (testids.md: `arena-participant-card`, one per live assignment). */
  private cards(): Locator {
    return this.page.getByTestId('arena-participant-card');
  }

  /** The i-th participant card (0-based, in render order). */
  private card(i: number): Locator {
    return this.cards().nth(i);
  }

  /** The "Available" zoom count badge (testids.md: `arena-zoom-available-count`). */
  private zoomAvailableBadge(): Locator {
    return this.page.getByTestId('arena-zoom-available-count');
  }

  /** Empty-state node (testids.md: `arena-empty-state`), shown when `!arenaparticipant.length`. */
  private emptyState(): Locator {
    return this.page.getByTestId('arena-empty-state');
  }

  // ----- actions -----

  /**
   * Log in (optional) as a seeded specialist, navigate to `/arenastudioactivity`, wait for the title,
   * and — if `queueName` is given — select that queue so the live-assignment cards stream in.
   *
   * The monitor's data subscriptions run for ANY authed user (only the Close Studio button is
   * dev-gated; arenastudioactivity.component.ts:59) — so a plain specialist can open it. To later use
   * closeStudio(i) the page must be authed as a `developer`; pass `login:false` and authenticate the
   * page as the developer/operator beforehand (see RISKS).
   */
  async open(opts: OpenOpts = {}): Promise<void> {
    const { login = true, specialistIndex = 0, queueName, queueId, landingRoute, timeoutMs, email } = opts;

    if (login) {
      // loginAsSpecialist lands on /dynamicstudio; we then push to the monitor route below.
      await loginAsSpecialist(this.page, specialistIndex, { landingRoute, timeoutMs, email });
    }

    if (!this.page.url().includes(this.route.replace(/^\//, ''))) {
      await this.page.goto(this.route, { waitUntil: 'domcontentloaded' });
    }
    await expect(this.title()).toBeVisible({ timeout: 30_000 });

    // Prefer the exact docid (unambiguous) over the visible name (can collide across runs).
    if (queueId !== undefined) {
      await this.selectQueueById(queueId);
    } else if (queueName !== undefined) {
      await this.selectQueue(queueName);
    }
  }

  /**
   * Open the queue picker and choose the queue whose visible name matches `queueName`. The options are
   * the top-5 queues by `queueenddate` (ts:63); selecting one fires `onQueueSelect` and wires the
   * live-assignment + token streams (ts:90-131).
   *
   * ⚠️ When several top-5 queues share `queueName` this picks the FIRST — which may be a different
   * run's queue. Use `selectQueueById` for the unambiguous selection the SS-15 assertions need.
   */
  async selectQueue(queueName: string): Promise<void> {
    await this.queueSelect().click();
    // mat-select renders its options in an overlay panel appended to the body.
    const option = this.page.locator('mat-option', { hasText: queueName }).first();
    await option.click();
    // The picker closes; nothing else to await synchronously — counts are polled by the readers.
    await expect(this.queueSelect()).toBeVisible();
  }

  /**
   * Open the queue picker and choose the option whose bound value (`[value]="list.docid"`, html:10)
   * equals `queueId`. In Angular dev mode the bound value is reflected to the `ng-reflect-value`
   * attribute, so we can target the EXACT `queue generation` doc — unambiguous even when several
   * top-5 queues share a visible name (the shared-emulator collision that made name selection pick a
   * foreign run's queue and render zero cards). Selecting fires `onQueueSelect(value)` → wires the
   * live-assignment + token streams for THIS queue (ts:90-131).
   */
  async selectQueueById(queueId: string): Promise<void> {
    await this.queueSelect().click();
    const option = this.page.locator(`mat-option[ng-reflect-value="${cssAttr(queueId)}"]`).first();
    await expect(option, `arena queue option for docid "${queueId}" should be in the top-5 picker`).toBeVisible({
      timeout: 15_000,
    });
    await option.click();
    await expect(this.queueSelect()).toBeVisible();
  }

  /**
   * Drive the real "Close Studio" button on the i-th card (0-based). The component guards the click
   * behind a native `confirm()` (ts:136); we auto-accept it. The button is only in the DOM when the
   * acting user has the `developer` role (html:110-114) — if it is absent this throws a clear timeout
   * (see RISKS: seed the acting user as `developer`, or this method cannot run).
   *
   * Effect (assert via a cardCount re-poll, NOT a read-back): live assignment -> status:'completed'
   * (ts:137-139) so the row leaves the ['live','recording'] filter and the card disappears; if the
   * row had a studioid, its `queue studio pairing` -> status:null (ts:142-144).
   */
  async closeStudio(i: number): Promise<void> {
    const before = await this.cards().count();
    // Accept the confirm("are you sure want to close the studio") dialog the component opens (ts:136).
    this.page.once('dialog', (d) => d.accept());

    await this.card(i).getByTestId('arena-close-studio-btn').click();

    // The card is removed from the stream once the CF/app flips status; confirm the render shrank.
    // (App/CF OUTPUT — the board re-rendered fewer cards — not a value this method wrote.)
    await expect
      .poll(async () => this.cards().count(), {
        timeout: 30_000,
        message: `card #${i} should leave the live render set after Close Studio`,
      })
      .toBeLessThan(before);
  }

  // ----- reads (APP-computed values; polled because the board streams from Firestore) -----

  /**
   * How many participant cards the APP rendered for the selected queue — i.e. the count of
   * `live assignment` docs whose `status in ['live','recording']` (the app's own filter, ts:91-99).
   * Polled because `collectionSnapshots` is async. Anti-circular: assert against a KNOWN seeded number
   * of live assignments, never against a value the test itself wrote.
   *
   * Resolves to 0 promptly when the empty-state node is present (no live assignments for the queue).
   */
  async cardCount(): Promise<number> {
    let count = 0;
    let prev = -1;
    let stableHits = 0;
    await expect
      .poll(
        async () => {
          // Empty-state and cards are mutually exclusive (html:40 vs html:134); treat empty-state as 0.
          if (await this.emptyState().count()) {
            count = 0;
            return 'settled';
          }
          const n = await this.cards().count();
          // `collectionSnapshots` can render the cards incrementally, so a bare first-non-zero read can
          // catch a HALF-rendered list and make an exact-count assertion flaky. Require the count to be
          // STABLE across two consecutive polls (and > 0) before settling — the app's filtered render has
          // finished streaming. (Still an APP-computed value; we just wait for the stream to quiesce.)
          if (n > 0 && n === prev) {
            stableHits += 1;
            if (stableHits >= 1) {
              count = n;
              return 'settled';
            }
          } else {
            stableHits = 0;
          }
          prev = n;
          return 'pending';
        },
        { timeout: 20_000, intervals: [250, 400, 600], message: 'arena card count to settle (cards rendered or empty-state shown)' }
      )
      .toBe('settled');
    return count;
  }

  /**
   * The Client + EIS names the APP computed (via `mapProfile`) for every rendered card, in order.
   * The card list is the app's filtered live-assignment render and the names are app-resolved from raw
   * ids (html:65-95) — both APP output. Anti-circular: assert these names match the SEEDED
   * specialists/participant of each live assignment; never read back a value the test wrote.
   *
   * Waits (via cardCount) for the stream to settle first so we don't read a half-rendered list.
   */
  async participantTokenPairs(): Promise<ArenaPair[]> {
    const total = await this.cardCount();
    const pairs: ArenaPair[] = [];
    for (let i = 0; i < total; i++) {
      const card = this.card(i);
      // Client name: the second `.info-block .value` is the Client block (html:72-75). Scope by the
      // sibling "Client" label to avoid matching the Stage/Zoom `.value` nodes.
      const clientBlock = card
        .locator('.info-block', { has: this.page.locator('.label', { hasText: /^Client$/ }) })
        .first();
      const client = (await clientBlock.locator('.value').first().innerText().catch(() => '')).trim();

      // EIS names: one `.eis-chip` per specialist in the pairing (html:65-67). innerText carries the
      // trailing comma the template adds between chips — strip it.
      const chipTexts = await card.locator('.eis-chip').allInnerTexts();
      const eis = chipTexts.map((t) => t.replace(/,\s*$/, '').trim()).filter((t) => t.length > 0);

      const participantId =
        (await card.getAttribute('data-participant-id').catch(() => null)) || '';

      pairs.push({ client, eis, participantId });
    }
    return pairs;
  }

  /**
   * The "<n> Available" zoom count the APP computed (`zoomNotInUseEmails.length`, ts:70). Polled
   * because the zoomaccount stream is async. Anti-circular: assert against a seeded count of
   * licensed zoom accounts with `inuse:false`. Returns the parsed integer from the badge text.
   */
  async zoomAvailableCount(): Promise<number> {
    let value = NaN;
    await expect
      .poll(
        async () => {
          const txt = (await this.zoomAvailableBadge().innerText().catch(() => '')).trim();
          const m = txt.match(/(\d+)/);
          if (!m) return NaN;
          value = Number(m[1]);
          return value;
        },
        { timeout: 20_000, message: 'arena "<n> Available" zoom badge to render a number' }
      )
      .not.toBeNaN();
    return value;
  }
}

/** Escape a value for use inside a CSS attribute selector (`[attr="..."]`). Firestore docids are
 *  token-safe, but escape defensively in case a value carries quotes/backslashes. */
function cssAttr(value: string): string {
  return String(value).replace(/(["\\])/g, '\\$1');
}
