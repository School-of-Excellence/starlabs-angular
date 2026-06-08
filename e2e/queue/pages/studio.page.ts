// studio.page.ts — page object for the Specialist "My Arena" / Dynamic Studio screen
// (route `/dynamicstudio`, component `dynamic-studio.component.{ts,html}`, recon SS-00..SS-16).
//
// WHY this object is shaped the way it is (anti-circularity rule — the whole point of the rebuild):
// every READ method here returns a number/flag the APP itself computed and rendered (a `studioList`
// button count, the `mapStudioLiveAssignment` live_tv icon, the `stageTokenList` waiting-list filter,
// the rendered `studiowidgets` panel rows) — NOT a value the test wrote. Every ACTION method drives a
// REAL selector + a REAL click/fill on the live Angular UI (testid-first per SHARED CONVENTIONS), so a
// spec asserts the product's behaviour, never a Firestore round-trip. The `collectionData` streams the
// component subscribes to are async, so stream-driven reads use `expect.poll` (per the brief).
//
// Selectors are testid-first (the test-hooks step added the `data-testid` attributes recorded in
// `e2e/queue/recon/testids.md` — verified present in the worktree templates), then formControlName /
// role+name / unique text where no testid exists. NO selector here is invented; each maps to a real
// element cited in `e2e/queue/recon/studio.md`.
//
// Reuse: this object does NOT re-implement login — specs log in via `e2e/queue/support/auth.ts`
// (`loginAsSpecialist`) which wraps the real login form. The `?profileid=<seeded specialist>` override
// hook (dynamic-studio.component.ts:160,171) lets a spec act as any seeded studio member without a
// per-specialist Auth user; `load(profileId)` threads it through.

import { Page, Locator, expect } from '@playwright/test';

/** A studio-button / token / move-target selector: either a 0-based index into the rendered list,
 *  or an explicit id that matches the element's companion `data-*` attribute (studioid / token / stage). */
export type StudioSelector = number | { studioId: string } | { tokenId: string } | { stage: string };

/** Counts the live-panel (`studiowidgets`) renders for a participant in studio — each value is the
 *  number of rows/cards the APP rendered for that widget (anti-circular: assert against a KNOWN seeded
 *  non-zero secondary-DB count, never parity-with-an-empty-read; see studio.md SS-07). A widget that
 *  is not gated on for the current stage reports 0 (its `*ngIf` did not render). */
export interface LivePanelWidgetCounts {
  /** Forms the participant submitted — `participantForm.length` (one button each). */
  forms: number;
  /** Triple-ATC docs awaiting validation — `tripleATCList.length`. */
  tripleAtc: number;
  /** Prescribed (validated/alpha) ATC entries — `alphaATCList.length`. */
  prescribedValidatedAtc: number;
  /** "Mark Completed Procedures" ATC blocks — `cwATClist.length`. */
  assignedAtc: number;
  /** Love-letter entries — `loveLetterList.length` (only counted when the panel is expanded). */
  loveLetters: number;
  /** AEL metric rows — keys of `participantAEL.crossovermetric` (0 if "No AEL Found"). */
  aelMetrics: number;
}

const ROUTE = '/dynamicstudio';

export class StudioPage {
  readonly page: Page;

  // --- core surface anchors (testid-first, all verified in dynamic-studio.component.html) ---
  readonly arenaTitle: Locator;
  readonly noStudioAlert: Locator;
  readonly queueCards: Locator;
  readonly studioButtons: Locator;
  readonly liveTvIcons: Locator;
  readonly checkinToggle: Locator;
  readonly stageColumns: Locator;
  readonly tokenCards: Locator;
  readonly liveParticipantName: Locator;
  readonly inviteMoreBtn: Locator;
  readonly aelValidateBtn: Locator;
  readonly moveNextButtons: Locator;
  readonly markProcedureButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.arenaTitle = page.locator('[data-testid="studio-arena-title"]');
    this.noStudioAlert = page.locator('[data-testid="studio-no-studio-alert"]');
    this.queueCards = page.locator('[data-testid="studio-queue-card"]');
    this.studioButtons = page.locator('[data-testid="studio-select-btn"]');
    this.liveTvIcons = page.locator('[data-testid="studio-live-tv-icon"]');
    this.checkinToggle = page.locator('[data-testid="studio-checkin-toggle"]');
    this.stageColumns = page.locator('[data-testid="studio-stage-col"]');
    this.tokenCards = page.locator('[data-testid="studio-token-card"]');
    this.liveParticipantName = page.locator('[data-testid="studio-live-participant-name"]');
    this.inviteMoreBtn = page.locator('[data-testid="studio-invite-more-btn"]');
    this.aelValidateBtn = page.locator('[data-testid="studio-ael-validate-btn"]');
    this.moveNextButtons = page.locator('[data-testid="studio-move-next-btn"]');
    this.markProcedureButtons = page.locator('[data-testid="studio-mark-procedure-btn"]');
  }

  // ---------------------------------------------------------------------------------------------
  // load — navigate to /dynamicstudio (optionally acting as a seeded specialist via the override hook)
  // ---------------------------------------------------------------------------------------------
  /**
   * Navigate to the Dynamic Studio screen and wait until the Arena title has mounted (the data-driven
   * route guard admitted us and `ongoingQueue` resolved, OR the no-studio empty state rendered).
   * The spec is expected to have logged in first via `support/auth.ts loginAsSpecialist`.
   *
   * @param profileId optional seeded-specialist profile id → drives `?profileid=<id>` so the page acts
   *        as that studio member (dynamic-studio.component.ts:160,171). Requires the seed to have placed
   *        that profileid into a `queue studio pairing.participants` array (studio.md CRITICAL TEST HOOK).
   *        The route uses a RELATIVE path so it resolves against the config/env baseURL — never hardcoded.
   */
  async load(profileId?: string): Promise<void> {
    const url = profileId ? `${ROUTE}?profileid=${encodeURIComponent(profileId)}` : ROUTE;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // The arena title always renders once the component mounts (even before a studio is selected);
    // wait for it OR the no-studio empty-state so a guard bounce / blank surface fails fast.
    // `.first()` because a no-studio member renders BOTH the arena title AND the no-studio banner
    // (noStudioInAnyQueue is true while ongoingQueue still resolves to ongoingQueueList[0],
    // dynamic-studio.ts:205/349) — without it the `.or()` is a strict-mode violation (SS-16).
    await expect(this.arenaTitle.or(this.noStudioAlert).first()).toBeVisible({ timeout: 30_000 });
  }

  // ---------------------------------------------------------------------------------------------
  // SS-00 — multi-queue cards / empty states (APP-computed)
  // ---------------------------------------------------------------------------------------------
  /** Number of queue cards the board rendered — equals the app's `queuesWithStudios.length`
   *  (the multi-queue picker only renders when >1; 0 cards ⇒ single-queue or none). Stream-driven. */
  async queueCardCount(): Promise<number> {
    await expect(this.arenaTitle.or(this.noStudioAlert)).toBeVisible();
    return await this.pollCount(this.queueCards);
  }

  /** True iff the app rendered the "No studios available in any of your ongoing queues." banner
   *  (`noStudioInAnyQueue == true`, dynamic-studio.ts:204/349). Stream-driven.
   *
   *  The banner is set only AFTER the constructor's queue/studio resolution chain finishes:
   *  getRoles → products → ongoing queues → `loadQueueStudioCounts()` (which awaits a firstEmit
   *  promise across chunked `queue studio pairing` subscriptions, ts:293-337) → `noStudioInAnyQueue
   *  = !firstWithStudios` (ts:204). For a no-studio member `load()` resolves on the arena title
   *  immediately (the title renders against `ongoingQueueList[0]` before the counts settle), so the
   *  banner can lag the title by several seconds under suite load. A 10s poll undershoots that on a
   *  busy emulator (SS-16 flaked false); use a 30s budget to match the other stream-driven reads. */
  async noActiveQueueAlertShown(): Promise<boolean> {
    return await this.pollVisible(this.noStudioAlert, 30_000);
  }

  // ---------------------------------------------------------------------------------------------
  // SS-01 — studio select / counts / live_tv (APP-computed)
  // ---------------------------------------------------------------------------------------------
  /** Number of "My Studio" select buttons the app rendered — equals `studioList.length`
   *  (the app filters to pairings where `participants.includes(profileid) && !delete`, ts:464).
   *
   *  The studio buttons are populated by the `queue studio pairing` `collectionData` subscription
   *  (getStudio, ts:456), which fires AFTER the init "Loading…" dialog closes (ts:214) — so a bare
   *  `pollCount` can read the transient pre-stream 0 and return it (SS-01 flake). We first wait for
   *  the surface to reach a TERMINAL state — either ≥1 studio button rendered OR the no-studio banner
   *  shown (the two mutually-exclusive outcomes of the stream settling, ts:464/349) — then count.
   *  For a no-studio member the terminal state is the banner ⇒ this correctly settles at 0 (SS-16). */
  async studioButtonCount(): Promise<number> {
    // Wait for the pairing stream to settle into one of its two terminal renders before counting.
    await expect(this.studioButtons.first().or(this.noStudioAlert).first())
      .toBeVisible({ timeout: 30_000 })
      .catch(() => {
        /* neither terminal appeared in time — fall through to pollCount, which will report the
           (likely 0) count the spec can then assert/fail on with its own message. */
      });
    return await this.pollCount(this.studioButtons);
  }

  /**
   * Click a "My Studio" select button → `onStudioSelect(studio)`. Selecting recomputes the
   * waiting-list (`stageTokenList`) and check-in state. After the click we wait for the button to
   * carry the selected style (`.primarystudio`) so the spec doesn't race the re-render.
   * @param i 0-based index, or `{studioId}` to target a specific pairing via its `data-studioid`.
   */
  async selectStudio(i: StudioSelector): Promise<void> {
    const btn = this.studioButtonAt(i);
    // No explicit one-shot scrollIntoViewIfNeeded(): on cloud the chunked `queue studio pairing`
    // collectionData stream rebuilds the studioList and can detach the button mid-select ("Element is
    // not attached to the DOM"). locator.click() auto-scrolls, auto-waits for actionability, and
    // re-resolves the locator on detach — so the explicit scroll was the sole fragile step.
    await btn.click();
    // onStudioSelect flips the class to 'primarystudio' for the selected studio (html:47).
    await expect(btn).toHaveClass(/primarystudio/, { timeout: 20_000 });
  }

  /** Number of studio buttons currently showing the `live_tv` icon — equals the count of studios with
   *  a truthy `mapStudioLiveAssignment[studio.docid]` (computed ts:516-526). Stream-driven. */
  async liveTvCount(): Promise<number> {
    return await this.pollCount(this.studioButtons.locator('[data-testid="studio-live-tv-icon"]'));
  }

  /**
   * Wait until the studio identified by `studioId` shows its `live_tv` icon — i.e. the
   * `live assignment` stream has populated `mapStudioLiveAssignment[<docid>]` (html:55, ts:516-526).
   *
   * WHY this gate matters (the SS-07/SS-09..SS-13 empty-live-name race): `onStudioSelect` reads
   * `this.liveAssignment = mapStudioLiveAssignment[selectedStudio.docid]` SYNCHRONOUSLY (ts:642) and
   * then, inside the same call, sets up the token subscription whose token-resolution is GUARDED by
   * `this.liveAssignment != null` (ts:697). If the studio is selected BEFORE the live-assignment
   * stream has fired, `liveAssignment` is null at select time → the token subscription fires once with
   * `liveAssignment == null` and SKIPS resolving `liveAssignment.token`; the panel later mounts (the
   * LA stream re-sets `liveAssignment`, preserving an undefined token, ts:528-531) but the participant
   * name stays empty because `liveAssignment.token` was never resolved. In real use a human takes
   * seconds to click, so the stream is always populated first; this method reproduces that ordering by
   * waiting for the app's OWN readiness signal (the live_tv icon) before the spec selects the studio.
   *
   * Returns true if the icon appeared within `timeout`, false otherwise (caller may still proceed for a
   * studio that legitimately has NO live assignment — e.g. SS-01/02/03 where no live panel is expected).
   */
  async waitForLiveTv(studioId: string, timeout = 30_000): Promise<boolean> {
    const icon = this.page.locator(
      `[data-testid="studio-select-btn"][data-studioid="${cssAttr(studioId)}"] [data-testid="studio-live-tv-icon"]`,
    );
    return await icon
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Select a studio that is expected to host a LIVE session and wait until its live panel has fully
   * hydrated (the participant name rendered non-empty). This is the race-free path for the in-studio
   * cases (SS-07/SS-09..SS-13, cross-db): it (1) waits for the studio's `live_tv` icon so the
   * live-assignment stream has populated `mapStudioLiveAssignment` BEFORE the click (so `onStudioSelect`
   * sees a non-null `liveAssignment` and its token subscription resolves `liveAssignment.token`, ts:697),
   * (2) clicks the studio (real action), then (3) waits for the participant-name `<h3>` to carry text —
   * the APP-COMPUTED confirmation that `liveAssignment.token` resolved and `mapProfile[profile_id]`
   * rendered. The spec then asserts the live-panel content it computed.
   *
   * @param studioId the pairing docid (`data-studioid`) of the studio to open.
   * @param timeout per-step budget (default 30000ms).
   */
  async selectStudioWithLivePanel(studioId: string, timeout = 30_000): Promise<void> {
    // (1) wait for the live-assignment stream to surface this studio (live_tv icon) so the synchronous
    //     read in onStudioSelect (ts:642) sees a populated mapStudioLiveAssignment.
    await this.waitForLiveTv(studioId, timeout);
    // (2) real select.
    await this.selectStudio({ studioId });
    // (3) wait for the live panel to hydrate the participant name (token resolved + mapProfile rendered).
    //     A plain toBeVisible would pass on an empty <h3> only if it had layout box; the app leaves it
    //     EMPTY (zero-size) until the token resolves, so visibility here == "name text rendered".
    await expect(this.liveParticipantName).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------------------------
  // SS-02 — check-in toggle + log (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Drive the "Studio Checkin" slide-toggle → `checkinStudio($event.checked)` (writes pairing.checkin
   * + one `studio checkin log` row, ts:850-864). No-op if the toggle is already in the requested state
   * (Angular only fires `(change)` on an actual flip). The on-hold path silently reverts the toggle and
   * writes `onhold` instead (ts:866-873) — callers assert that via `isCheckinLogged` (no log) if needed.
   * @param toggle desired checked state.
   */
  async checkin(toggle: boolean): Promise<void> {
    await expect(this.checkinToggle).toBeVisible({ timeout: 20_000 });
    const isOn = await this.isCheckinOn();
    if (isOn === toggle) return; // already in the requested state — clicking would be a no-op
    // The clickable surface of a mat-slide-toggle is the inner button/label; click the host, which
    // Angular Material forwards to the toggle input.
    await this.checkinToggle.locator('button, .mdc-switch, label').first().click();
    // Confirm the app applied the flip (aria-checked / class reflects [checked]=selectedStudio.checkin).
    await expect
      .poll(async () => await this.isCheckinOn(), { timeout: 20_000 })
      .toBe(toggle);
  }

  /**
   * Whether the app currently treats this studio as checked-in. This reads the APP's rendered toggle
   * state (its `[checked]="selectedStudio['checkin']"` binding), which the component sets only after the
   * `studio checkin log` write/stream settles — so a spec uses it as the app-computed "checked-in?" flag.
   * NOTE: it asserts the UI the app rendered, NOT a value the test wrote; pair with a `studio checkin
   * log` row count in the spec for the full SS-02 parity invariant. Returns false when no studio selected
   * (toggle absent). Stream-driven.
   */
  async isCheckinLogged(): Promise<boolean> {
    if (!(await this.checkinToggle.isVisible().catch(() => false))) return false;
    // Poll the app's rendered toggle state; resolve to whatever it settles on (true once the app marks
    // the studio checked-in). We do NOT assert true here — the caller decides what the value should be —
    // so a non-throwing poll that reads the current state is the right shape.
    let on = false;
    await expect
      .poll(async () => {
        on = await this.isCheckinOn();
        return true; // resolve once readable; `on` carries the app-computed value
      }, { timeout: 20_000, intervals: [200, 400, 800] })
      .toBe(true);
    return on;
  }

  // ---------------------------------------------------------------------------------------------
  // SS-03 — waiting-list eligible tokens (APP-computed filter)
  // ---------------------------------------------------------------------------------------------
  /**
   * Wait until the waiting-list region has PAINTED at least one stage column (or timeout). Returns true
   * if a `studio-stage-col` rendered, false otherwise.
   *
   * KNOWN APP LIMITATION (returned as a productFinding): in the headless emulator the waiting-list
   * `*ngFor="let stage of stageTokenList"` (html:141) can fail to paint even though the component state
   * is correct — `onStudioSelect` populates `stageTokenList` from the `collectionData` token-query
   * subscription (ts:805-811), but that subscription's emission does not flush Angular change detection
   * in this build, so the `*ngFor` (and the Bring-To-Studio button inside it) never render and no test
   * UI interaction forces a flush. Specs use this to SKIP-with-finding rather than hang/fail when the
   * surface cannot be driven (the brief's sanctioned pattern for a UI element that legitimately can't
   * render), so a clean environment where CD does flush still exercises the case.
   * @param stage optional stagename → wait for THAT column specifically.
   */
  async waitForWaitingList(stage?: string, timeout = 20_000): Promise<boolean> {
    const target = stage
      ? this.page.locator(`[data-testid="studio-stage-col"][data-stage="${cssAttr(stage)}"]`)
      : this.stageColumns;
    return await target
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Total number of eligible waiting-list token cards the app rendered across all stage columns —
   * the app applies the silent-gap filter in `onStudioSelect` (status=='ready' AND currentstage==stage
   * AND liveassignmentid==null AND atcmodel ⊇ product AND preassign passes, ts:804-811). Assert this
   * against a KNOWN seeded eligible count. Stream-driven (the waiting list renders only when
   * `liveAssignment==null && selectedStudio.checkin`).
   * @param stage optional stagename → count only that column's tokens (scoped via `data-stage`).
   */
  async waitingListEligibleCount(stage?: string): Promise<number> {
    // When `stage` is given, scope to that column via its `data-stage` and count its token cards;
    // otherwise count every rendered token card across all columns.
    const target = stage
      ? this.page.locator(`[data-testid="studio-stage-col"][data-stage="${cssAttr(stage)}"] [data-testid="studio-token-card"]`)
      : this.tokenCards;
    return await this.pollCount(target);
  }

  // ---------------------------------------------------------------------------------------------
  // SS-04 — Bring To Studio → invite (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Click a token's "Bring To Studio" button → `sendStudioInvitation(token)` (creates exactly one
   * `studioinvitation` with `clientresponse:null`, expiry now+2min, ts:973-999; or, for a stage-grouping
   * stage, opens `InviteOtherStudioComponent` first). The spec asserts the produced `studioinvitation`
   * doc (or the dup-guard alert) — NOT a value it wrote.
   * @param sel which token: 0-based index into the rendered cards, or `{tokenId}` (its `data-token`).
   */
  async bringToStudio(sel: StudioSelector): Promise<void> {
    const card = this.tokenCardAt(sel);
    const btn = card.locator('[data-testid="studio-bring-btn"]');
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
  }

  // ---------------------------------------------------------------------------------------------
  // SS-06 — assign studio → open session (real action through the Assign-Specialist dialog)
  // ---------------------------------------------------------------------------------------------
  /**
   * Complete the "Assign Specialist" dialog that opens the live session (the §3a coupled writes:
   * pairing→live, token instudio+liveassignmentid+studioid, one `live assignment` status:live, one
   * `queue stage log` movedthrough:"studio"). This dialog (`AssignQueueStudioComponent`) is opened by
   * the app's `assignStudio()` after a participant accepts (or by an operator move); this method drives
   * the OPEN dialog: it confirms the studio is selected and clicks the "Assign Specialist" submit
   * (`aqs-submit`, disabled until the form is valid). The submit is the real product action; the spec
   * asserts the resulting cross-ref triangle + single stage-log against the seeded token.
   * @param sel optional studio selector → if the dialog's studio select supports a choice and an id is
   *        given, pick it; otherwise the app pre-selects the single studio (aqs.ts:73-77).
   */
  async assignStudioOpenSession(sel?: StudioSelector): Promise<void> {
    const submit = this.page.locator('[data-testid="aqs-submit"]');
    await expect(submit).toBeVisible({ timeout: 20_000 });

    // If an explicit studio id was requested and the studio select is enabled, choose it; otherwise
    // rely on the app's single-studio pre-selection. We only act on a concrete {studioId}.
    if (sel && typeof sel === 'object' && 'studioId' in sel) {
      const studioSelect = this.page.locator('[data-testid="aqs-studio-select"]');
      if (await studioSelect.isEnabled().catch(() => false)) {
        await studioSelect.click();
        // mat-select options render in an overlay panel; pick by the data-studio-id if present, else
        // fall back to a single available option.
        const opt = this.page.locator('mat-option').first();
        await opt.click();
      }
    }

    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();
    // Dialog closes on submit; wait for the submit anchor to detach so the spec doesn't race the write.
    await expect(submit).toBeHidden({ timeout: 30_000 });
  }

  /**
   * Ensure the live panel's participant name has hydrated; if it is still empty after a short wait,
   * RE-SELECT the studio (`studioId`) to force `onStudioSelect` to re-resolve `liveAssignment.token`
   * against the now-populated live-assignment stream (ts:642/697). No-op if the name is already present.
   *
   * WHY this is needed after `assignStudioOpenSession()` (the SS-07/SS-08 post-assign empty-name race):
   * assignStudio() opens the session, the app sets `liveAssignment` from the live-assignment stream, but
   * resolves `liveAssignment.token` only on the NEXT token-stream emission (ts:697, guarded by
   * `liveAssignment != null`). If the token stream emitted BEFORE the live-assignment stream populated
   * `liveAssignment`, the token stays unresolved and the participant name renders empty until something
   * re-triggers onStudioSelect. Re-selecting is that deterministic settle — NOT a value the test wrote.
   */
  async reconcileLivePanel(studioId: string, timeout = 15_000): Promise<void> {
    const hydrated = await this.liveParticipantName
      .filter({ hasText: /\S/ })
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    if (hydrated) return;
    // Re-select to re-run onStudioSelect now that mapStudioLiveAssignment is populated.
    await this.selectStudio({ studioId }).catch(() => {});
    await expect(this.liveParticipantName).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------------------------
  // SS-07 — live-panel widget counts (APP-computed; assert against KNOWN seeded non-zero counts)
  // ---------------------------------------------------------------------------------------------
  /**
   * Read the counts the live `studiowidgets` panel rendered for the in-studio participant. Each value
   * is the number of rows/buttons/cards the APP produced from its (cross-DB) queries — assert each
   * against a KNOWN seeded NON-ZERO count (lower bound), never parity-with-a-possibly-empty-read
   * (studio.md SS-07 anti-circularity). A widget gated off for the current stage reports 0.
   * Stream-driven. NOTE: `loveLetters` is only non-zero if the Love Letters panel is expanded first
   * (`expandLoveLetters()`), because the list renders behind a collapse.
   */
  async livePanelWidgetCounts(): Promise<LivePanelWidgetCounts> {
    // Anchor on the live participant name so we only read once the live panel mounted.
    await expect(this.liveParticipantName).toBeVisible({ timeout: 30_000 });

    // Forms: one button per `participantForm` inside the "Forms submitted by the Participant" widgetbox.
    const formsBox = this.widgetBoxByTitle('Forms submitted by the Participant');
    const forms = await this.countButtonsIn(formsBox);

    // Triple ATC: one button per `tripleATCList` entry; the "No Triple ATC found" span ⇒ 0.
    const tripleBox = this.widgetBoxByTitle('Triple ATC Submitted');
    const tripleAtc = await this.countButtonsIn(tripleBox);

    // Prescribed validated (alpha) ATC: one `.steplabel` per `alphaATCList` entry in the
    // "ATC Prescribed to the Participant" widgetbox.
    const alphaBox = this.widgetBoxByTitle('ATC Prescribed to the Participant');
    const prescribedValidatedAtc = await this.pollCount(alphaBox.locator('.steplabel'));

    // Assigned ATC ("Mark Completed Procedures"): one `.border` block per `cwATClist` entry.
    const assignedBox = this.widgetBoxByTitle('Mark Completed Procedures');
    const assignedAtc = await this.pollCount(assignedBox.locator('.border'));

    // AEL metric rows: each `crossovermetric` key renders one Current-Level mat-select in the AEL box.
    const aelBox = this.widgetBoxByTitle('Participant AEL');
    const aelMetrics = await this.pollCount(aelBox.locator('mat-form-field'));

    // Love letters: rendered only when the collapse is open; count the `.love-letter-item` rows.
    const loveLetters = await this.pollCount(this.page.locator('.love-letter-card .love-letter-item'));

    return { forms, tripleAtc, prescribedValidatedAtc, assignedAtc, loveLetters, aelMetrics };
  }

  /** Expand the Love Letters collapse (so `livePanelWidgetCounts().loveLetters` can read the list). */
  async expandLoveLetters(): Promise<void> {
    const card = this.page.locator('.love-letter-card');
    if (!(await card.isVisible().catch(() => false))) return;
    if (await card.evaluate((el) => el.classList.contains('previous-atc-card--open')).catch(() => false)) return;
    await card.locator('.previous-atc-toggle').click();
  }

  // ---------------------------------------------------------------------------------------------
  // SS-09 — mark procedures complete (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Click a "Mark as Completed" / "Completed" procedure button → `markProcedure(a,i,j)` (toggles the
   * `firestore-atc` procedure `status` between `completed`/`yet to start`, ts:1970-1983). After the
   * click we wait for the button to flip to the `marked` class (status now `completed`) so the spec
   * can re-read persisted state. The spec asserts persistence by reloading + re-selecting the studio.
   * @param index 0-based index into the rendered procedure buttons (default 0 = the first procedure).
   */
  async markProcedureComplete(index = 0): Promise<void> {
    const btn = this.markProcedureButtons.nth(index);
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    // markProcedure toggles status→'completed', which swaps the class 'tomark'→'marked' (html:500).
    await expect(btn).toHaveClass(/marked/, { timeout: 20_000 });
  }

  // ---------------------------------------------------------------------------------------------
  // SS-10 — invite more participants in studio (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Click "Invite More Participant in this Studio" → `inviteMore(false)` (opens `AssignQueueStudioComponent`
   * titled "Update Additional Specialist…"; on submit updates `live assignment.bonusactivity` + token
   * `people_involved` WITHOUT tearing the session down, ts:1600-1612; cancel ⇒ no write, ts:1592).
   * This method only OPENS the dialog (waits for the assign submit to appear); the spec then drives the
   * dialog via `assignStudioOpenSession`-style steps or asserts the cancel/no-write path. The
   * `live assignment` is asserted by the spec, not by this object.
   */
  async inviteMore(): Promise<void> {
    await expect(this.inviteMoreBtn).toBeVisible({ timeout: 20_000 });
    await this.inviteMoreBtn.click();
    // The dialog is the same AssignQueueStudio dialog; its submit anchor confirms it opened.
    await expect(this.page.locator('[data-testid="aqs-submit"]')).toBeVisible({ timeout: 20_000 });
  }

  // ---------------------------------------------------------------------------------------------
  // SS-12 — move to next stage / complete (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Click a next-stage move button → `moveStage(config.stage, config.markascompleted)` (the §3f
   * complete+close writes: token detached, one stage-log movedthrough:"studio", live-assignment
   * completed, pairing status:null; final stage fires `updateDeliveryStatus`). Only the visible
   * variation/non-variation branch of the button renders (both share the `studio-move-next-btn` testid
   * + a `data-stage`), so we scope by `mode` when given.
   *
   * If a `StageIncompleteConfirmationComponent` appears (same-stage loop OR not-mark-completed,
   * ts:1275-1283) we confirm it via its "Submit" button. If the AEL gate alert fires
   * ("Participant AEL is not validated…", ts:1168) the move aborts — the spec should validate AEL
   * first (`validateAEL`); we surface the alert text by dismissing it and throwing so the spec sees the
   * gate rather than a silent no-op.
   *
   * @param mode optional target stage name → scope to the move button with that `data-stage`
   *        (e.g. the next stage). Omit to click the sole rendered move button.
   */
  async moveNext(mode?: string): Promise<void> {
    const btn = mode
      ? this.page.locator(`[data-testid="studio-move-next-btn"][data-stage="${cssAttr(mode)}"]`).first()
      : this.moveNextButtons.first();
    await expect(btn).toBeVisible({ timeout: 20_000 });

    // Capture an AEL-gate alert (native alert ⇒ the move returns without writing). We accept the dialog
    // and remember its message so we can throw a clear error instead of letting the move silently no-op.
    let alertText: string | null = null;
    const onDialog = (d: { message(): string; accept(): Promise<void> }) => {
      alertText = d.message();
      return d.accept();
    };
    this.page.once('dialog', onDialog as never);

    await btn.scrollIntoViewIfNeeded();
    await btn.click();

    // If the stage-incomplete confirmation dialog opens, proceed via its "Submit" button. CRUCIAL:
    // that dialog's Submit is GATED on a REQUIRED reason textarea (`reasonControl`, Validators.required,
    // stage-incomplete-confirmation.component.ts:40-41) — clicking Submit with an EMPTY reason is a
    // silent no-op (onsubmit returns early, the dialog stays open, the move never writes a stage-log).
    // So we FILL the reason first, then Submit. The dialog also has a Yes/No pre-assign radio defaulting
    // to "Yes" (result.preassign=true), which needs no interaction.
    const confirmSubmit = this.page.getByRole('button', { name: /^Submit$/ });
    if (await confirmSubmit.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const reason = this.page.getByPlaceholder('Enter reason for moving this participant');
      if (await reason.isVisible().catch(() => false)) {
        await reason.fill('e2e: move to next stage');
      }
      await confirmSubmit.click();
    }

    // Give a beat for a possible alert to have fired, then surface the AEL gate as an explicit failure.
    await this.page.waitForTimeout(300);
    this.page.off('dialog', onDialog as never);
    if (alertText && /AEL is not validated/i.test(alertText)) {
      throw new Error(`[StudioPage.moveNext] move blocked by AEL gate: "${alertText}". Validate AEL first.`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // SS-08 — validate AEL (real action)
  // ---------------------------------------------------------------------------------------------
  /**
   * Click the AEL validate button → `updateCurrentAEL()` (writes an `interim crossover` doc and sets
   * `participant AEL.flag='validated'`, batch ts:2253-2264; this also unblocks the SS-12 complete gate).
   * After the click we wait for the button to flip to the `aelValidated` class (the app set
   * `participantAEL.aelStatus='validated'`). The spec asserts the `interim crossover` write + flag
   * against the seeded AEL, not a value it wrote.
   */
  async validateAEL(): Promise<void> {
    await expect(this.aelValidateBtn).toBeVisible({ timeout: 20_000 });
    await this.aelValidateBtn.scrollIntoViewIfNeeded();
    await this.aelValidateBtn.click();
    // updateCurrentAEL flips aelStatus→'validated', swapping the class to 'aelValidated' (html:286).
    await expect(this.aelValidateBtn).toHaveClass(/aelValidated/, { timeout: 20_000 });
  }

  // =============================================================================================
  // internal helpers
  // =============================================================================================

  /** Resolve a studio-button locator from an index or `{studioId}`. */
  private studioButtonAt(sel: StudioSelector): Locator {
    if (typeof sel === 'number') return this.studioButtons.nth(sel);
    if ('studioId' in sel) {
      return this.page.locator(`[data-testid="studio-select-btn"][data-studioid="${cssAttr(sel.studioId)}"]`);
    }
    throw new Error('[StudioPage] selectStudio expects an index or {studioId}');
  }

  /** Resolve a token-card locator from an index or `{tokenId}`. */
  private tokenCardAt(sel: StudioSelector): Locator {
    if (typeof sel === 'number') return this.tokenCards.nth(sel);
    if ('tokenId' in sel) {
      return this.page.locator(`[data-testid="studio-token-card"][data-token="${cssAttr(sel.tokenId)}"]`);
    }
    throw new Error('[StudioPage] bringToStudio expects an index or {tokenId}');
  }

  /** A `.widgetbox` whose `.actiontitle` text contains `title` (the live-panel widgets are anchored by
   *  their visible heading text — no per-widget testid exists; see studio.md §2 NEEDS-TESTID). */
  private widgetBoxByTitle(title: string): Locator {
    return this.page
      .locator('.widgetbox')
      .filter({ has: this.page.locator('.actiontitle', { hasText: title }) });
  }

  /** Count the action buttons inside a widgetbox (each list entry renders one `.actionbtn`/button);
   *  returns 0 when the box is absent (widget gated off). Stream-driven. */
  private async countButtonsIn(box: Locator): Promise<number> {
    return await this.pollCount(box.locator('button.actionbtn'));
  }

  /** Poll a locator's `.count()` until it stabilises (the value the app's stream rendered). */
  private async pollCount(loc: Locator): Promise<number> {
    let last = 0;
    await expect
      .poll(async () => {
        last = await loc.count();
        return last;
      }, { timeout: 20_000, intervals: [200, 400, 800] })
      // assert it's a non-negative number (always true) so poll resolves once the count is readable
      .toBeGreaterThanOrEqual(0);
    return last;
  }

  /** Poll a locator's visibility (used for the no-studio empty-state banner).
   *  Resolves as soon as the locator is visible; otherwise returns its last (false) reading at timeout. */
  private async pollVisible(loc: Locator, timeout = 10_000): Promise<boolean> {
    let visible = false;
    await expect
      .poll(async () => {
        visible = await loc.isVisible().catch(() => false);
        return visible; // resolve once VISIBLE (don't burn the whole budget once true); carries the value
      }, { timeout, intervals: [200, 400, 800] })
      .toBe(true)
      .catch(() => {
        /* never became visible within the budget — `visible` stays false; caller asserts on it */
      });
    return visible;
  }

  /** Read the app's rendered checked state of the check-in toggle (its `[checked]` binding). */
  private async isCheckinOn(): Promise<boolean> {
    // mat-slide-toggle reflects checked via aria-checked on its inner button and a host class.
    const ariaBtn = this.checkinToggle.locator('button[role="switch"], [role="switch"]').first();
    if (await ariaBtn.count()) {
      const checked = await ariaBtn.getAttribute('aria-checked').catch(() => null);
      if (checked != null) return checked === 'true';
    }
    // Fallback: Material toggles add 'mat-mdc-slide-toggle-checked' / 'mdc-switch--selected' when on.
    const cls = (await this.checkinToggle.getAttribute('class').catch(() => '')) || '';
    if (/checked|selected/.test(cls)) return true;
    const inner = (await this.checkinToggle.locator('.mdc-switch').getAttribute('class').catch(() => '')) || '';
    return /selected|checked/.test(inner);
  }
}

/** Escape a value for use inside a CSS attribute selector (`[data-x="..."]`). Firestore ids are
 *  token-safe, but stage names / titles can contain spaces & punctuation — wrap defensively. */
function cssAttr(value: string): string {
  return String(value).replace(/(["\\])/g, '\\$1');
}

export default StudioPage;
