// big-assignment-board.page.ts — page object for the Participant Assignment Board (PAB / BIG-01),
// route `particiant_assignment_board` (typo is the REAL path — big.md §0; app.routes.ts:233).
//
// Component: ParticipantAssignmentBoardComponent (selector `app-participant-assignment-board`),
//   src/app/big/participant-assignment-board/participant-assignment-board.component.{ts,html}.
// Recon: e2e/queue/recon/big.md (BIG-01 selector table + §3a perform-action routing) and
//   e2e/queue/recon/testids.md ("BIG surface" → participant-assignment-board.component.html).
//   Auth helper reused: e2e/queue/support/auth.ts (loginAsBigParticipant / loginAsBigAdmin).
//
// SELECTORS — testid-first, then class/role+text, NEVER invented (verified against the WORKTREE
//   template, which is the test-hooked source; the testids below are present on the real elements):
//     pab-marathon-btn      `button.marathon`        *ngFor; companion [data-marathon-id]   (html:33)
//     pab-marathon-pending  `span.pending`           marathonMap[docid].pending badge        (html:35)
//     pab-status-btn        `button.filter-btn`      *ngFor over the 5 statuses; [data-status](html:47)
//     pab-status-count      `span.status-count`      rendered ONLY when bucket length > 0    (html:53)
//     pab-card              `.activity-card`         *ngFor; companion [data-assignment-id]  (html:86)
//     pab-type-badge        `.type-badge`            activity.assignmenttype                  (html:88)
//     pab-status-badge      `.status-indicator`      Ongoing/Upcoming/<status>                (html:98)
//     pab-perform-action    `button.action-btn`      the LIVE button, inside *ngIf shouldShowButton
//                                                     — the two COMMENTED-OUT action-btns (html:211-233)
//                                                     do NOT carry this testid, so it uniquely scopes
//                                                     the real perform-action control               (html:236)
//   The status set is the literal `['myactivities','review','rework','missed','completed']` the
//   template iterates (html:46) — also the `selectedStatus` values the board filters by (ts:326).
//
// ANTI-CIRCULARITY (the whole point of the rebuild): the READING methods below return numbers the
//   APP computed and rendered — `statusBadgeCounts` reads the `pab-status-count` spans the component
//   bound from `mapParticipantAssignments[...][status].length` (html:51-55), and `cardCount` reads how
//   many `pab-card` elements the component's `dataSource.data` *ngFor produced (html:86). Neither is a
//   value the test wrote; both are derived by the product from its live `big participants assignments`
//   / `big assignment` streams. Because those are `collectionData` streams (async), every read polls
//   with `expect.poll` per SHARED CONVENTIONS. The ACTION method (`performAction`) drives a REAL click
//   on the real `pab-perform-action` button; it does NOT assert read==X — the resulting status
//   transition (written by the screen the button navigates to, big.md §3a) is asserted by the SPEC
//   against a KNOWN-SEEDED precondition, not here.
//
// IMPORTANT board mechanics this object respects (from big.md / the template):
//   • The status-filter row and the activity cards render ONLY after a marathon is selected
//     (`*ngIf="selectedMarathon['marathonref'] && mapParticipantAssignments[...]"`, html:43). So
//     `selectMarathon(...)` (or `open(..., {marathonId})`) must run before counts/cards exist.
//   • A `pab-status-count` badge is absent when that bucket is empty (length===0 hides the span,
//     html:51) — `statusBadgeCounts` therefore reports 0 for a status whose badge is not in the DOM.
//   • PAB hides the perform-action button entirely for `Manual Assignment` cards
//     (`shouldShowButton` returns false, ts:693) and for not-yet-started cards — so `performAction`
//     resolves a VISIBLE `pab-perform-action`; if none renders for the target card it throws (the
//     product intentionally offers no action there — big.md BIG-01 note).
//   • Most perform-action types `window.open(_blank)` to a per-type screen; `performAction` here only
//     guarantees the real click landed (button was enabled+clicked). Following a popup / asserting the
//     navigation target is the spec's job (it owns the popup/page context).

import { expect, Locator, Page } from '@playwright/test';
import { loginAsBigParticipant, loginAsBigAdmin, LANDING_ROUTES, LoginOpts } from '../support/auth';

/** Route the standalone ParticipantAssignmentBoardComponent is mounted at (big.md BIG-01; typo is real). */
export const PAB_ROUTE = '/particiant_assignment_board';

/** Host component selector — scopes every locator so a stray Material element elsewhere never matches. */
const HOST = 'app-participant-assignment-board';

/** data-testid values shipped on the real PAB template (recon testids.md, verified in the worktree). */
const TID = {
  marathonBtn: 'pab-marathon-btn',
  marathonPending: 'pab-marathon-pending',
  statusBtn: 'pab-status-btn',
  statusCount: 'pab-status-count',
  card: 'pab-card',
  typeBadge: 'pab-type-badge',
  statusBadge: 'pab-status-badge',
  performAction: 'pab-perform-action',
} as const;

/**
 * The five status buckets the board exposes, in template order (html:46 / ts:326). `myactivities`
 * is the default selection applied after a marathon is picked (ts:233).
 */
export const PAB_STATUSES = ['myactivities', 'review', 'rework', 'missed', 'completed'] as const;
export type PabStatus = (typeof PAB_STATUSES)[number];

/** Map of status → the count the board rendered in that filter's `status-count` badge (0 when absent). */
export type StatusBadgeCounts = Record<PabStatus, number>;

/** Default poll budget for stream-driven reads (mirrors the queue config expect timeout: 20s). */
const POLL: { timeout: number; intervals: number[] } = { timeout: 20_000, intervals: [250, 500, 1000] };

/**
 * Selector for the card the spec wants to act on. Exactly one field should be set:
 *   • `assignmentId` — the card's `data-assignment-id` (= `activity.docid`), the precise hook; OR
 *   • `type`         — the visible `pab-type-badge` text (e.g. "Form", "Video", "Zoom Call"); OR
 *   • `index`        — 0-based position among the currently rendered `pab-card`s.
 * A bare string is treated as `assignmentId`. Used by `performAction`.
 */
export type CardSelector = string | { assignmentId?: string; type?: string; index?: number };

export class BigAssignmentBoardPage {
  readonly page: Page;
  /** Host root (`app-participant-assignment-board`) — all locators below are scoped to it. */
  readonly host: Locator;
  /** All currently-rendered activity cards (`[data-testid="pab-card"]`, one per `dataSource.data`). */
  readonly cards: Locator;
  /** All status-filter buttons (`[data-testid="pab-status-btn"]`, one per PAB_STATUS). */
  readonly statusButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.host = page.locator(HOST);
    this.cards = this.host.locator(`[data-testid="${TID.card}"]`);
    this.statusButtons = this.host.locator(`[data-testid="${TID.statusBtn}"]`);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Open the Participant Assignment Board and wait until the component has mounted (loading bar gone,
   * the marathon row present). The caller must ALREADY be authenticated — pass `as:'participant'`
   * (default) to log in as a seeded participant via auth.ts `loginAsBigParticipant`, or `as:'admin'`
   * to log in as a BIG admin (developer/admin sees the participant picker). When `auth:false`, no
   * login is performed (the spec established the session itself).
   *
   * If `marathonId` is given, the matching marathon is selected so the status filters + cards render
   * (they are gated behind a selected marathon — html:43). baseURL comes from the Playwright config;
   * no project id is hardcoded (SHARED CONVENTIONS).
   *
   * @returns the email logged in as (or '' when `auth:false`).
   */
  async open(
    opts: {
      as?: 'participant' | 'admin';
      auth?: boolean;
      participantIndex?: number;
      adminIndex?: number;
      marathonId?: string;
      timeoutMs?: number;
    } & LoginOpts = {},
  ): Promise<string> {
    const timeout = opts.timeoutMs ?? 30_000;
    let email = '';

    if (opts.auth !== false) {
      // Land directly on the PAB route (override the role's default landing) so the guard admit + the
      // PAB mount are confirmed in one step. The board guard is the generic authGuard (big.md §4).
      const loginOpts: LoginOpts = { ...opts, landingRoute: PAB_ROUTE, timeoutMs: timeout };
      email =
        opts.as === 'admin'
          ? await loginAsBigAdmin(this.page, opts.adminIndex ?? 0, loginOpts)
          : await loginAsBigParticipant(this.page, opts.participantIndex ?? 0, loginOpts);
    } else {
      await this.page.goto(PAB_ROUTE, { waitUntil: 'domcontentloaded' });
      await this.page.waitForURL((u) => u.pathname.includes('particiant_assignment_board'), { timeout });
    }

    // Component mounted: the host is attached and the indeterminate loading bar (html:2) is gone.
    await expect(this.host).toBeAttached({ timeout });
    await expect
      .poll(async () => this.host.locator('mat-progress-bar[mode="indeterminate"]').count(), {
        timeout,
        message: 'PAB loading bar never cleared — board did not finish its initial data load',
      })
      .toBe(0);

    if (opts.marathonId) await this.selectMarathon(opts.marathonId);
    return email;
  }

  // ---------------------------------------------------------------------------
  // Marathon selection (precondition for status filters + cards)
  // ---------------------------------------------------------------------------

  /** Locator for one marathon button by its `data-marathon-id` (= the marathon's `docid`). */
  marathonButton(marathonId: string): Locator {
    return this.host.locator(`[data-testid="${TID.marathonBtn}"][data-marathon-id="${marathonId}"]`);
  }

  /**
   * Select a marathon (REAL click on `button.marathon`, firing `fetchMarathonData`). The board then
   * renders the status-filter row and (after its default `applyStatusFilter('myactivities')`, ts:233)
   * the activity cards. Resolves once the clicked marathon shows the active state (`.selected`) and the
   * status-filter buttons have rendered — so subsequent count/card reads have a populated DOM.
   *
   * The marathon list is stream-driven, so we poll for the button to exist before clicking.
   */
  async selectMarathon(marathonId: string): Promise<void> {
    const btn = this.marathonButton(marathonId);
    await expect
      .poll(async () => btn.count(), {
        ...POLL,
        message: `PAB marathon button data-marathon-id="${marathonId}" never rendered (is the marathon seeded for this participant?)`,
      })
      .toBeGreaterThan(0);
    await btn.click();
    // The component marks the active marathon with `.selected` (html:33) and reveals the filter row.
    await expect(btn).toHaveClass(/selected/, { timeout: POLL.timeout });
    await expect
      .poll(async () => this.statusButtons.count(), {
        ...POLL,
        message: 'PAB status-filter buttons did not appear after selecting the marathon',
      })
      .toBeGreaterThan(0);
  }

  // ---------------------------------------------------------------------------
  // Reads (APP-computed, stream-driven → expect.poll)
  // ---------------------------------------------------------------------------

  /**
   * The per-status counts the BOARD computed and rendered in its `status-count` badges
   * (`mapParticipantAssignments[marathon][status].length`, html:51-55). Returns a number for every
   * PAB_STATUS: when a status' bucket is empty the component HIDES its badge (html:51), so an absent
   * `pab-status-count` span for that button means 0 — never "not loaded".
   *
   * Polls because the buckets are fed by the async `big participants assignments` / `big assignment`
   * streams. Requires a marathon to be selected first (counts only exist then — html:43); the poll's
   * failure message flags that. Anti-circular: these are values the product derived, not test writes.
   *
   * @returns a record keyed by every PAB_STATUS.
   */
  async statusBadgeCounts(): Promise<StatusBadgeCounts> {
    // Wait until the filter row exists at all (marathon selected) before reading per-button badges.
    await expect
      .poll(async () => this.statusButtons.count(), {
        ...POLL,
        message:
          'statusBadgeCounts: no pab-status-btn rendered — select a marathon first (the filter row is gated by selectedMarathon, html:43).',
      })
      .toBeGreaterThan(0);

    const out = {} as StatusBadgeCounts;
    for (const status of PAB_STATUSES) {
      out[status] = await this.statusBadgeCount(status);
    }
    return out;
  }

  /**
   * The count the board rendered for ONE status' badge. Scopes the `pab-status-count` span to that
   * status' button via the companion `data-status` attribute (html:47). Returns 0 when the badge is
   * absent (empty bucket). Polled (stream-driven); the returned value is APP-computed.
   */
  async statusBadgeCount(status: PabStatus): Promise<number> {
    const button = this.host.locator(`[data-testid="${TID.statusBtn}"][data-status="${status}"]`);
    const badge = button.locator(`[data-testid="${TID.statusCount}"]`);
    let last = 0;
    await expect
      .poll(
        async () => {
          // The button must exist (marathon selected). If its badge span is absent, the bucket is 0.
          if ((await button.count()) === 0) return false;
          if ((await badge.count()) === 0) {
            last = 0;
            return true;
          }
          const parsed = await this.parseIntOrNull(badge.first());
          if (parsed === null) return false;
          last = parsed;
          return true;
        },
        {
          ...POLL,
          message: `statusBadgeCount("${status}"): the status button / badge never settled — is a marathon selected and the assignments stream loaded?`,
        },
      )
      .toBe(true);
    return last;
  }

  /**
   * How many activity cards the board is CURRENTLY rendering (`dataSource.data.length` reflected as the
   * `[data-testid="pab-card"]` *ngFor count, html:86) — i.e. cards for the active status filter after
   * any keyword filter. This is the value the product produced from its stream + filter, not a test
   * write. Polled (stream-driven) until the count settles.
   *
   * Returns 0 when the board shows its "No activities found" empty state (html:78) — a legitimate
   * APP-computed result, so callers expecting ≥1 should assert that separately.
   */
  async cardCount(): Promise<number> {
    let last = 0;
    // Resolve once two consecutive samples agree, so an in-flight stream re-render doesn't return a
    // transient value. (A true 0 is valid — the empty state — so we don't require >0 here.)
    let prev = -1;
    await expect
      .poll(
        async () => {
          const n = await this.cards.count();
          const stable = n === prev;
          prev = n;
          last = n;
          return stable;
        },
        {
          ...POLL,
          message: 'cardCount: the pab-card count never stabilised (stream still re-rendering?).',
        },
      )
      .toBe(true);
    return last;
  }

  // ---------------------------------------------------------------------------
  // Actions (drive the REAL UI)
  // ---------------------------------------------------------------------------

  /**
   * Drive the REAL perform-action button (`pab-perform-action`, html:236) on the card identified by
   * `sel`, after applying status filter `action` if it differs from the current selection.
   *
   * The PARAMS map to the board's two real interactions:
   *   • `sel`    — WHICH card (assignmentId | type badge text | index). See `CardSelector`.
   *   • `action` — the status bucket to view first, one of PAB_STATUSES (the board's
   *                `applyStatusFilter`, html:49). The card's button label/behaviour is status-driven
   *                (`getButtonText`/`isButtonDisabled`, ts:712/727): e.g. under `myactivities` it reads
   *                "Open Activity", under `review` "View Submitted Activity", under `rework` "Rework
   *                Activity". Pass the bucket the target card lives in. If omitted, the current filter
   *                is used (the board defaults to `myactivities`, ts:233).
   *
   * Behaviour: selects the status filter (real click) if needed, locates the card, then clicks its
   * VISIBLE+ENABLED `pab-perform-action`. If the card has no action button (PAB hides it for Manual
   * Assignment and not-yet-started cards — `shouldShowButton`/`isButtonDisabled`, ts:693/727), this
   * throws via the visibility wait — the product intentionally offers no action there (big.md BIG-01).
   *
   * Anti-circular: this only performs the real click; the resulting status write happens on the screen
   * the button navigates to (big.md §3a) and is asserted by the SPEC against a seeded precondition. The
   * navigation is usually a `window.open(_blank)` popup — capture it with `page.context().waitForEvent('page')`
   * in the spec BEFORE calling this if the target page must be driven.
   *
   * @returns the button label the APP rendered at click time (`getButtonText`, e.g. "Open Activity").
   */
  async performAction(sel: CardSelector, action?: PabStatus): Promise<string> {
    if (action) await this.applyStatusFilter(action);

    const card = await this.resolveCard(sel);
    const button = card.locator(`[data-testid="${TID.performAction}"]`);

    // The action button renders only inside *ngIf="shouldShowButton" (html:234); wait for the live,
    // enabled control. A timeout here is the product telling us this card offers no action (PAB hides
    // it for Manual Assignment / not-started cards — ts:693/727). Surface that as a clear message via
    // a presence poll before the strict visibility/enabled assertions.
    await expect
      .poll(async () => button.count(), {
        ...POLL,
        message: `performAction: no pab-perform-action rendered on card ${describeCard(sel)} (status="${action ?? 'current'}"). PAB hides it for Manual Assignment / not-started cards (ts:693/727).`,
      })
      .toBeGreaterThan(0);
    await expect(button).toBeVisible({ timeout: POLL.timeout });
    await expect(button).toBeEnabled({ timeout: POLL.timeout });

    const label = (await button.innerText()).trim();
    await button.click();
    return label;
  }

  /**
   * Apply a status filter (REAL click on the `pab-status-btn` for `status`, firing `applyStatusFilter`,
   * html:49). Resolves once that button shows the active state (`.active`, html:48) so the card set has
   * switched to that bucket before any follow-up read/action. Idempotent: skips the click if already
   * active.
   */
  async applyStatusFilter(status: PabStatus): Promise<void> {
    const button = this.host.locator(`[data-testid="${TID.statusBtn}"][data-status="${status}"]`);
    await expect
      .poll(async () => button.count(), {
        ...POLL,
        message: `applyStatusFilter("${status}"): the status button never rendered — select a marathon first.`,
      })
      .toBeGreaterThan(0);
    const classes = (await button.getAttribute('class')) ?? '';
    if (!/\bactive\b/.test(classes)) {
      await button.click();
      await expect(button).toHaveClass(/active/, { timeout: POLL.timeout });
    }
  }

  // ---------------------------------------------------------------------------
  // Card helpers
  // ---------------------------------------------------------------------------

  /** Locator for one card by its `data-assignment-id` (= `activity.docid`). */
  cardById(assignmentId: string): Locator {
    return this.host.locator(`[data-testid="${TID.card}"][data-assignment-id="${assignmentId}"]`);
  }

  /**
   * The visible type-badge text of a card (`activity.assignmenttype`, e.g. "Form" / "Video" /
   * "Zoom Call" / "Manual Assignment" — html:96). Useful for asserting which card you resolved.
   */
  async cardType(sel: CardSelector): Promise<string> {
    const card = await this.resolveCard(sel);
    return (await card.locator(`[data-testid="${TID.typeBadge}"]`).first().innerText()).trim();
  }

  /**
   * The visible status-indicator text of a card (Ongoing / Upcoming / <status>, html:106). This is the
   * APP-computed render of the card's state for the active filter.
   */
  async cardStatusBadge(sel: CardSelector): Promise<string> {
    const card = await this.resolveCard(sel);
    return (await card.locator(`[data-testid="${TID.statusBadge}"]`).first().innerText()).trim();
  }

  /**
   * Resolve a `CardSelector` to a single card locator, polling until it is present (cards are
   * stream-driven). `assignmentId` scopes by the companion attr; `type` filters by the type-badge
   * text; `index` takes the nth rendered card; a bare string is treated as `assignmentId`.
   */
  private async resolveCard(sel: CardSelector): Promise<Locator> {
    const spec = typeof sel === 'string' ? { assignmentId: sel } : sel;

    if (spec.assignmentId !== undefined) {
      const card = this.cardById(spec.assignmentId);
      await expect
        .poll(async () => card.count(), {
          ...POLL,
          message: `resolveCard: no pab-card with data-assignment-id="${spec.assignmentId}" rendered (wrong status filter, or not seeded for this participant?).`,
        })
        .toBeGreaterThan(0);
      return card.first();
    }

    if (spec.type !== undefined) {
      const want = spec.type.trim().toLowerCase();
      const card = this.cards.filter({
        has: this.page.locator(`[data-testid="${TID.typeBadge}"]`, { hasText: spec.type }),
      });
      await expect
        .poll(async () => card.count(), {
          ...POLL,
          message: `resolveCard: no pab-card with type-badge "${spec.type}" rendered under the current status filter.`,
        })
        .toBeGreaterThan(0);
      // Disambiguate to the FIRST exact-type match (hasText is substring; guard against e.g.
      // "ATC" matching "Triple ATC").
      const count = await card.count();
      for (let i = 0; i < count; i++) {
        const t = (await card.nth(i).locator(`[data-testid="${TID.typeBadge}"]`).first().innerText())
          .trim()
          .toLowerCase();
        if (t === want) return card.nth(i);
      }
      return card.first();
    }

    const idx = spec.index ?? 0;
    await expect
      .poll(async () => this.cards.count(), {
        ...POLL,
        message: `resolveCard: fewer than ${idx + 1} pab-card(s) rendered (requested index ${idx}).`,
      })
      .toBeGreaterThan(idx);
    return this.cards.nth(idx);
  }

  /** Parse a locator's trimmed text as an integer; null if absent/non-numeric. */
  private async parseIntOrNull(loc: Locator): Promise<number | null> {
    const txt = (await loc.textContent())?.trim() ?? '';
    if (txt === '') return null;
    const n = Number.parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }
}

/** Convenience factory mirroring the suite's lightweight style (cf. web-invitation.page.ts). */
export function bigAssignmentBoardPage(page: Page): BigAssignmentBoardPage {
  return new BigAssignmentBoardPage(page);
}

/** Human-readable description of a CardSelector for error messages. */
function describeCard(sel: CardSelector): string {
  if (typeof sel === 'string') return `assignmentId=${sel}`;
  if (sel.assignmentId !== undefined) return `assignmentId=${sel.assignmentId}`;
  if (sel.type !== undefined) return `type=${sel.type}`;
  return `index=${sel.index ?? 0}`;
}

// Re-export LANDING_ROUTES purely so specs importing from this page object can reference the PAB
// landing without a second import line (the value itself comes from auth.ts).
export { LANDING_ROUTES };
