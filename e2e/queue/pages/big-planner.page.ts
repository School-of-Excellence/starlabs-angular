// big-planner.page.ts — page object for the B!G Planner screen (route /queuebigplanner?queueid=<docid>).
//
// Component: BigPlannerComponent (selector `app-big-planner`),
//   src/app/queue system/big-planner/big-planner.component.{ts,html}.
// Recon: e2e/queue/recon/operator.md §1.I + §4 (sources of each number), e2e/queue/recon/testids.md
//   ("BIG surface" → big-planner.component.html + the "NOT HOOKED" note). Selectors here are NOT
//   invented — every one is either a shipped `data-testid` (testids.md) or a stable class/attr cited
//   in operator.md. Priority used: data-testid → id/formcontrolname → role+name → unique text/class.
//
// ANTI-CIRCULARITY (the whole point of the rebuild): every reader below returns a value the APP
// computed, never a value the test wrote, and never a value re-derived in the test:
//   • DOM-bound numbers (profileStudioCount / profilePairCount) are read from the spans the component
//     renders (`bp-stat-studios` / `bp-stat-pair`), scoped by the participant row's data-profile-id.
//     These are driven by the live `queue studio pairing` Firestore stream (collectionData → async),
//     so reads use expect.poll (per SHARED CONVENTIONS).
//   • completedToken / stageTokenMap have NO template binding (operator.md §1.I, §4; testids.md
//     "NOT HOOKED") — there is intentionally no DOM hook. They are public fields the component
//     computes from the `queue_token` stream (ts:549, ts:552). We read them straight off the LIVE
//     Angular component instance via Angular's dev-mode debug global `window.ng.getComponent(el)`.
//     The served app runs in dev mode for e2e (environment.emulator.ts / development both set
//     production:false, and main.ts only calls enableProdMode when !isDevMode()), so `window.ng` is
//     present. This returns the number the PRODUCT produced; the test never recomputes it. If the app
//     were ever served as a production build, `window.ng` would be undefined — see RISKS.
//
// Reuse: this object owns ONLY B!G-Planner selectors/reads. Firestore-side anti-circular assertions
// (e.g. comparing completedToken to a KNOWN-SEEDED number) belong in the spec via
// e2e/queue/support/firestore-admin.ts / e2e/lib/assertions.ts — not here.

import { Page, Locator, expect } from '@playwright/test';

/** Route + selector constants (single source of truth for this surface). */
const ROUTE = '/queuebigplanner';

const SEL = {
  // Page shell.
  pageTitle: 'h1.main-title',                       // text "B!G Planner - <queuename>" (operator.md §1.I, html:8)
  viewOnlyToggle: '[data-testid="bp-viewonly-toggle"]', // "View Only" mat-slide-toggle (testids.md; html:10)
  eventSelect: '[data-testid="bp-event-select"]',   // "Select Event" mat-select (testids.md; html:17)
  // Participant sidenav (rendered only when !viewOnly).
  participantRow: '[data-testid="bp-participant-row"]', // mat-list-item, *ngFor; companion data-profile-id (testids.md; html:55)
  statStudios: '[data-testid="bp-stat-studios"]',   // .stat-value in chip-studio = profileStudioCount[id]?.length (html:93)
  statPair: '[data-testid="bp-stat-pair"]',         // .stat-value in chip-pair  = profilePairCount[id]?.length  (html:99)
  // Studio-pairing table.
  studioRow: '[data-testid="bp-studio-row"]',       // tr[mat-row], one per `queue studio pairing` (testids.md; html:429)
} as const;

/** Default poll budget for stream-driven reads (mirrors playwright.queue.config expect timeout: 20s). */
const POLL: { timeout: number; intervals: number[] } = { timeout: 20_000, intervals: [250, 500, 1000] };

/**
 * Map of `currentstage` → per-stage token buckets, exactly as the component computes `stageTokenMap`
 * (BigPlannerComponent ts:552-578). One entry per stage that currently holds ≥1 Active token.
 */
export interface StageTokenBucket {
  waiting: number;   // tokens with status == "ready"
  queued: number;    // tokens with status in {null, "queued", "invited"}
  instudio: number;  // tokens with status == "instudio"
  total: number;     // all tokens whose currentstage == this stage
  // (the component also stores a `tokenlist`; omitted here — counts are the assertable surface)
}
export type StageTokenMap = Record<string, StageTokenBucket>;

export class BigPlannerPage {
  constructor(private readonly page: Page) {}

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Open the B!G Planner for `queueid` and wait until the component has mounted and resolved the
   * queue (the title `B!G Planner - <queuename>` renders only after `selectedQueue` is set from the
   * queryParam — component ts:222/html:8). Auth (operator/admin) must already be established by the
   * spec via e2e/queue/support/auth.ts `loginAsOperator` BEFORE calling this; this method only
   * navigates the already-authenticated page.
   *
   * Reads baseURL from the Playwright config (page.goto resolves the relative path against it) — no
   * project id is hardcoded, per SHARED CONVENTIONS.
   */
  async open(queueid: string): Promise<void> {
    await this.page.goto(`${ROUTE}?queueid=${encodeURIComponent(queueid)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.locator(SEL.pageTitle)).toBeVisible({ timeout: 30_000 });
  }

  // ---------------------------------------------------------------------------
  // View-Only gate (action) — needed before the participant sidenav stats are in the DOM
  // ---------------------------------------------------------------------------

  /**
   * Ensure the "View Only" toggle is OFF, because the participant sidenav (where `bp-stat-studios` /
   * `bp-stat-pair` live) is gated by `*ngIf="!viewOnly"` and `viewOnly` defaults to true
   * (component ts:85; sidenav html:31). Idempotent: only clicks when currently checked. Drives the
   * REAL mat-slide-toggle button (a real click on the live control).
   */
  async setViewOnly(on: boolean): Promise<void> {
    const toggle = this.page.locator(SEL.viewOnlyToggle);
    await expect(toggle).toBeVisible();
    // mat-slide-toggle exposes its state on the inner button via aria-checked.
    const button = toggle.locator('button[role="switch"]');
    const current = (await button.getAttribute('aria-checked')) === 'true';
    if (current !== on) {
      await button.click();
      await expect(button).toHaveAttribute('aria-checked', String(on));
    }
  }

  /** Locator for one participant row by its profile id (data-profile-id == the invitation/profileid). */
  participantRow(profileId: string): Locator {
    return this.page.locator(`${SEL.participantRow}[data-profile-id="${profileId}"]`);
  }

  // ---------------------------------------------------------------------------
  // DOM-bound reads (APP-computed; rendered spans) — stream-driven → expect.poll
  // ---------------------------------------------------------------------------

  /**
   * Read the "studios" stat the component rendered for one participant: `profileStudioCount[id].length`
   * (operator.md §4; html:93). This is the count of `queue studio pairing` docs with `studioin` truthy
   * that include the participant (component ts:482, 494). Requires the participant sidenav to be open,
   * i.e. View Only OFF — callers must `setViewOnly(false)` first (the row + its stat spans are gated by
   * `*ngIf="!viewOnly"`, and `viewOnly` defaults to true).
   *
   * Polls because `profileStudioCount` is fed by an async `collectionData` stream; returns the number
   * the APP put in the span, never a value the test wrote.
   */
  async readProfileStudioCount(profileId: string): Promise<number> {
    return this.readStatValue(profileId, SEL.statStudios, 'profileStudioCount');
  }

  /**
   * Read the "pair" stat the component rendered for one participant: `profilePairCount[id].length`
   * (operator.md §4; html:99) — pairings where the participant shares a studio with >1 participant
   * (component ts:483, 496). Same View-Only / stream caveats as `readProfileStudioCount`.
   */
  async readProfilePairCount(profileId: string): Promise<number> {
    return this.readStatValue(profileId, SEL.statPair, 'profilePairCount');
  }

  /** Shared impl: scope the stat span to the participant row, poll until it parses to a finite number. */
  private async readStatValue(profileId: string, statSel: string, label: string): Promise<number> {
    const row = this.participantRow(profileId);
    const stat = row.locator(statSel);
    await expect.poll(
      async () => (await stat.count()) > 0 && (await this.parseIntOrNull(stat)) !== null,
      {
        ...POLL,
        message: `${label}: stat span for profile ${profileId} (${statSel}) did not render a number — is View Only OFF (sidenav open) and the queue studio pairing stream loaded?`,
      },
    ).toBe(true);
    const value = await this.parseIntOrNull(stat);
    return value ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Component-instance reads (APP-computed; NO DOM binding) — via Angular dev global
  // ---------------------------------------------------------------------------

  /**
   * Read `completedToken` — the count of Active `queue_token`s whose `currentstage` equals the queue's
   * LAST stage (component ts:549). There is NO template binding for this value (operator.md §1.I,
   * testids.md "NOT HOOKED"), so it is read directly off the live Angular component instance.
   *
   * Polls because the underlying `queue_token` stream is async; the returned number is computed by the
   * component (the test does not recompute it — anti-circular).
   */
  async readCompletedToken(): Promise<number> {
    let last: number | null = null;
    await expect.poll(
      async () => {
        last = await this.readInstanceField<number>('completedToken');
        return typeof last === 'number';
      },
      {
        ...POLL,
        message:
          'completedToken: could not read it off the live BigPlannerComponent instance. Needs the dev-mode `window.ng` global (production:false build) and a mounted app-big-planner.',
      },
    ).toBe(true);
    return last ?? 0;
  }

  /**
   * Read `stageTokenMap` — per-stage Active-token buckets (waiting/queued/instudio/total) keyed by
   * `currentstage` (component ts:552-578). No template binding (operator.md §1.I; testids.md
   * "NOT HOOKED") → read off the live component instance. Polls for the stream to populate.
   *
   * Returns counts only (the component's per-bucket `tokenlist` arrays are stripped, since they hold
   * raw token docs that are not part of the assertable numeric surface).
   */
  async readStageTokenMap(): Promise<StageTokenMap> {
    let last: StageTokenMap = {};
    await expect.poll(
      async () => {
        last = await this.readStageTokenMapOnce();
        return Object.keys(last).length > 0;
      },
      {
        ...POLL,
        message:
          'stageTokenMap: empty after polling. Needs the dev-mode `window.ng` global and a populated queue_token stream for this queue.',
      },
    ).toBe(true);
    return last;
  }

  /**
   * Read the per-stage total token count for a single `stage` from the component's `stageTokenMap`
   * (`stageTokenMap[stage].total`, component ts:565). Returns 0 when the stage currently holds no
   * Active tokens (the component never creates an empty entry, so an absent key means 0). The value
   * is APP-computed; the test does not derive it from raw Firestore reads.
   */
  async readPerStageTokenCount(stage: string): Promise<number> {
    let last = 0;
    await expect.poll(
      async () => {
        const map = await this.readStageTokenMapOnce();
        last = map[stage]?.total ?? 0;
        // resolve once the stream has produced ANY stage data (so a true 0 for `stage` is trustworthy,
        // not just "stream hasn't arrived yet")
        return Object.keys(map).length > 0;
      },
      {
        ...POLL,
        message: `readPerStageTokenCount: stageTokenMap never populated while looking up stage "${stage}". Needs the dev-mode \`window.ng\` global and a loaded queue_token stream.`,
      },
    ).toBe(true);
    return last;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Single (non-polling) snapshot of `stageTokenMap`, counts only. */
  private async readStageTokenMapOnce(): Promise<StageTokenMap> {
    const raw = await this.readInstanceField<Record<string, Partial<StageTokenBucket>>>('stageTokenMap');
    const out: StageTokenMap = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [stage, bucket] of Object.entries(raw)) {
      if (!bucket || typeof bucket !== 'object') continue;
      out[stage] = {
        waiting: Number(bucket.waiting ?? 0),
        queued: Number(bucket.queued ?? 0),
        instudio: Number(bucket.instudio ?? 0),
        total: Number(bucket.total ?? 0),
      };
    }
    return out;
  }

  /**
   * Read one public field off the live BigPlannerComponent instance using Angular's dev-mode debug
   * global. `ng.getComponent(<host element>)` returns the component instance for `app-big-planner`;
   * we pluck the named field. Only JSON-serialisable shapes survive the page→node boundary, so callers
   * must request plain numbers/objects (completedToken: number, stageTokenMap: object of counts).
   *
   * Returns null when the global or component is not yet present (page still booting) so callers can
   * keep polling; throws a descriptive error only when `window.ng` itself is missing AND the host
   * element exists (i.e. a production build where the debug global was stripped).
   */
  private async readInstanceField<T>(field: string): Promise<T | null> {
    return this.page.evaluate(({ field }) => {
      const host = document.querySelector('app-big-planner');
      if (!host) return null; // component not mounted yet
      const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
      if (!ng || typeof ng.getComponent !== 'function') {
        // Host is present but the Angular debug global is absent → almost certainly a production build.
        throw new Error(
          'window.ng.getComponent is unavailable: the served app must be a DEV build (production:false) for B!G-Planner instance reads (completedToken / stageTokenMap have no DOM binding).',
        );
      }
      const cmp = ng.getComponent(host) as Record<string, unknown> | null;
      if (!cmp) return null;
      const value = cmp[field];
      // Deep-clone to a plain JSON value so it crosses the evaluate boundary intact.
      try {
        return JSON.parse(JSON.stringify(value ?? null));
      } catch {
        return null;
      }
    }, { field }) as Promise<T | null>;
  }

  /** Parse a locator's trimmed text as an integer; null if absent/non-numeric. */
  private async parseIntOrNull(loc: Locator): Promise<number | null> {
    const txt = (await loc.textContent())?.trim() ?? '';
    if (txt === '') return null;
    const n = Number.parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }
}
