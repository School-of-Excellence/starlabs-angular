// queue-board.page.ts — page object for the operator Live Board
// (route /dynamicqueuemanager, component DynamicQueueManagerCloneComponent, selector
//  `app-dynamic-queue-manager-clone`).
//
// Source files (production branch / test/queue-e2e worktree):
//   src/app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.{ts,html}
//   src/app/queue system/people-involved/people-involved.component.html        (move-confirm dialog)
//   src/app/queue system/assign-queue-studio/assign-queue-studio.component.html (open-studio dialog)
// Recon read before writing: e2e/queue/recon/operator.md (§B header/queue-select, §C columns+move,
//   §D PeopleInvolved, §E AssignQueueStudio, §F comms, §G filters, §H bulk-move, §4 source-of-numbers)
//   and e2e/queue/recon/testids.md (OPERATOR surface). Auth is provided by the spec via
//   e2e/queue/support/auth.ts `loginAsOperator` BEFORE this object is used — this object only drives
//   the board of an already-authenticated, already-landed operator page.
//
// SELECTOR POLICY (SHARED CONVENTIONS): testid → id/formcontrolname → role+name → unique class/text.
//   No selector here is invented. Every locator is either a shipped `data-testid` verified present in
//   the worktree source (grep-confirmed: 17 qm-* hooks + pi-*/aqs-*), a PRE-EXISTING stable attribute
//   (`data-stage-key` on each column header, `data-token-id` on each card — operator.md §C, testids.md),
//   or a stable class cited in operator.md where no testid was shipped (the Stage-Counts chip — see
//   readStageChip + RISKS). All values are interpolated from `column.*`/`token.*`, so per-instance
//   scoping uses the companion `data-*` attributes, never brittle text.
//
// ANTI-CIRCULARITY (the whole point of the rebuild — see the brief's rule):
//   • Every READER below returns a number the APP computed and re-rendered from its live Firestore
//     stream (`collectionData`, async) — never a value the test wrote. Reads therefore poll
//     (`expect.poll`) until the stream has rendered, per SHARED CONVENTIONS.
//   • Every ACTION below drives the REAL Angular control (a real testid/class locator, then a real
//     click/fill) and, where the product opens a confirm dialog before committing (PeopleInvolved /
//     AssignQueueStudio), this object drives that dialog too — so the write the spec later asserts is
//     produced by the PRODUCT, not by the test. Actions do NOT read-back the value they just wrote;
//     callers assert via the board's recomputed counts / the `queue stage log` row the app wrote
//     (e2e/lib/assertions.ts) against a KNOWN-SEEDED number.

import { Page, Locator, expect } from '@playwright/test';

/** Route the operator board mounts on (operator.md routes table; app.routes.ts:179). */
const ROUTE = '/dynamicqueuemanager';

/**
 * Selector single-source-of-truth. testid values verified present in the worktree source
 * (grep -c on dynamic-queue-manager-clone.component.html = 1 each). Class/text fallbacks are the
 * "Best stable selector" column from operator.md for elements that were not given a testid.
 */
const SEL = {
  // --- header / queue selection (operator.md §B) ---
  queueSelect: '[data-testid="qm-queue-select"]',        // "Select Queue" mat-select (html:825)
  totalParticipants: '[data-testid="qm-total-participants"]', // span wrapping {{totalParticipants}} (html:837)
  liveQueueBtn: '[data-testid="qm-livequeue-btn"]',      // "Live Queue" quick-select btn; +data-queue-id (html:1017)
  exportCsv: '[data-testid="qm-export-csv"]',            // "Export CSV" button (html:868)
  adminStageBtn: 'button:has-text("Admin Stage")',       // opens comms for stage `queueadmin` (html:870)
  filtersOpen: '[data-testid="qm-filters-open"]',        // `tune` icon button → opens Filters sidenav (html:884)
  filterBadge: '[data-testid="qm-filter-badge"]',        // span.filter-btn-badge, only when count>0 (html:886)

  // --- stage columns & per-card move (operator.md §C) ---
  stageHeader: '.stagename[data-stage-key]',             // one per filteredStageQueue column (html:1182)
  stageCount: '[data-testid="qm-stage-count"]',          // count span inside a column header (html:1189)
  tokenCard: '[data-token-id]',                          // token card; data-token-id = profile_id||docid (html:1206)
  moveBtn: '[data-testid="qm-move-btn"]',                // per-card ⇄ Move button (html:1222)
  moveTarget: '[data-testid="qm-move-target"]',          // target-stage btn in open .move-dropdown; +data-stage-name (html:1240)
  moveDropdown: '.move-dropdown',                        // rendered only for the open token (html:1230)
  // per-stage developer "complete the whole column" action (cloud_done). No testid (developer-only):
  // scope by the column header, then this icon button (html:1194-1196).
  stageCompleteIcon: 'button:has(mat-icon:text-is("cloud_done"))',
  // per-stage comms (message) icon inside the column header (html:1190-1193).
  stageCommsIcon: 'button:has(mat-icon:text-is("message"))',

  // --- Stage-Counts chip row (operator.md §B/§4; NO testid shipped — stable classes) ---
  stageCountsToggle: '.stage-count-chip:has(.chip-name:text-is("Stage Counts"))', // collapsed dropdown toggle (html:1126)
  stageCountChip: '.stage-count-chip',                   // each card chip when expanded (html:1136)

  // --- comms sidebar (operator.md §F) ---
  commsSelectAll: '[data-testid="qm-comms-selectall"]',  // .select-all-wrapper (html:175)
  commsRecipientCount: '[data-testid="qm-comms-recipient-count"]', // span on Whatsapp btn (html:45)
  commsSend: '[data-testid="qm-comms-send"]',            // .send-btn, only when a comm type chosen (html:161)
  commsStageSelect: '.communication-container mat-select', // "Select Stages" multi-select (html:21)
  commsBulkInvite: '.communication-buttons button:has-text("BulkInvite(")', // BulkInvite(n) (html:57)
  commsClose: '.panel-header .close-panel-btn',          // close comms/filters sidenav (html:10/368)
  commsParticipantItem: '.participant-item',             // a participant row in comms list (html:185)

  // --- filters sidebar (operator.md §G) ---
  filtersClearAll: '[data-testid="qm-filters-clearall"]', // "Clear all" (html:378); only when count>0
  tagFilterRow: '.fsb-expandable:has(.fsb-label:has-text("Tag"))', // Tags row (label "Filter by Tags"/"N Tag(s)") (html:423)
  tagOption: '[data-testid="qm-tag-option"]',            // a tag row in the dropdown; +data-tag-id (html:446)
  tagChip: '[data-testid="qm-tag-chip"]',                // active-tag chip in top chips row; +data-tag-id (html:1062)

  // --- bulk-move panel (operator.md §H) ---
  bulkOverlay: '.bulk-overlay',                          // *ngIf="showBulkMovePanel" (html:1810)
  bulkTarget: '[data-testid="qm-bulk-target"]',          // "Move to Stage" mat-select (html:1839)
  bulkCommit: '[data-testid="qm-bulk-commit"]',          // "Move N Participant(s)" button (html:1879)
  bulkDone: '.bulk-done',                                // completed state (html:1895)

  // --- PeopleInvolved confirm dialog (operator.md §D) ---
  piPersonSelect: '[data-testid="pi-person-select"]',    // Specialist mat-select (people-involved html:7)
  piSubmit: '[data-testid="pi-submit"]',                 // "submit" (people-involved html:27)

  // --- AssignQueueStudio dialog (operator.md §E) ---
  aqsStudioSelect: '[data-testid="aqs-studio-select"]',  // Studio mat-select (assign-queue-studio html:6)
  aqsSubmit: '[data-testid="aqs-submit"]',               // "Assign Specialist" (assign-queue-studio html:46)

  // Material overlay primitives (options/dialogs render into the body CDK overlay).
  matOption: 'mat-option',
} as const;

/** Poll budget for stream-driven reads — mirrors playwright.queue.config expect timeout (20s). */
const POLL: { timeout: number; intervals: number[] } = { timeout: 20_000, intervals: [200, 400, 800] };

/**
 * How a caller names a stage column. The board can hold MULTIPLE columns with the same `stagename`
 * (a stage with a compulsory activity is split into Queued/Waiting/Activity sub-columns — component
 * ts:1944-1985), so a bare name is ambiguous for those stages. Callers may pass:
 *   • a string — matched first as an exact `data-stage-key` (e.g. "DRC_3" or "ATC_activity_5"), and
 *     if no header has that key, as a `stagename` (the column whose display name equals it; for a
 *     split stage that resolves to the first/Queued sub-column).
 *   • { name, type } — disambiguates a split stage by its type label ("Queued" | "Waiting" |
 *     "Activity"); `type: null` selects the simple (un-split) column.
 *   • { stageKey } — the exact `data-stage-key` (most precise).
 */
export type StageRef =
  | string
  | { stageKey: string }
  | { name: string; type?: 'Queued' | 'Waiting' | 'Activity' | null };

/** A token is referenced by the value the card carries in `data-token-id` (= profile_id || docid). */
export type TokenRef = string;

/** Options for a single-token move into a NON-Activity stage (drives PeopleInvolved). */
export interface MoveOpts {
  /**
   * Visible name of the Specialist to pick in the PeopleInvolved confirm dialog before the move
   * commits. The `person` mat-select is the only live control there (operator.md §D). If omitted,
   * the dialog is submitted as-is (the app allows submitting with no specialist — `submit(null)` path
   * is the Cancel button, but `pi-submit` submits the current form value). Pass this when the seeded
   * stage requires a specialist, else the write may carry `people_involved: []`.
   */
  specialist?: string;
  /** Max ms to wait for the confirm dialog to appear after clicking the target. Default 15000. */
  dialogTimeoutMs?: number;
}

/** Parsed CSV returned by exportCsv(): the header row and the data rows (each a string[] of cells). */
export interface ExportedCsv {
  headers: string[];
  rows: string[][];
  /** Convenience: row count (excludes the header). */
  rowCount: number;
}

export class QueueBoardPage {
  constructor(private readonly page: Page) {}

  // ===========================================================================
  // Navigation / queue selection
  // ===========================================================================

  /**
   * Navigate to the board if not already there (auth/landing is the spec's job via
   * `loginAsOperator`). Idempotent — safe to call at the top of a flow. baseURL comes from the
   * Playwright config; no project id is hardcoded.
   */
  async open(): Promise<void> {
    if (!this.page.url().includes(ROUTE.replace(/^\//, ''))) {
      await this.page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    }
    await expect(this.page.locator(SEL.queueSelect)).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Open the "Select Queue" dropdown and pick the queue whose visible option text == `name`. Fires
   * the component's `onQueueSelect()` which wires the `queue_token` stream and renders the board
   * (operator.md §B; component ts:1826). Resolves once the post-selection header (Total Participants)
   * is in the DOM, i.e. `selectedQueue != null` (html:835), so subsequent reads have a board to read.
   *
   * This is a REAL click on the REAL mat-select + its overlay option — not a state write.
   */
  async selectQueue(name: string): Promise<void> {
    await this.open();
    await this.page.locator(SEL.queueSelect).click();
    // mat-select options render in a body-level CDK overlay; the queue options are `item.queuename`
    // (html:831). Use exact text to avoid matching the ngx-mat-select-search placeholder option.
    await this.page.locator(SEL.matOption).filter({ hasText: name }).first().click();
    // Picker closes; the header span renders only when selectedQueue is set.
    await expect(this.page.locator(SEL.totalParticipants)).toBeVisible({ timeout: 30_000 });
    // Wait out the "Staging Queue..." loader so the queue_token stream has RESOLVED before any read:
    // the board inits totalParticipants=0 (component ts:174) and only recomputes it once the stream
    // lands (ts:2009), closing the loader at ts:1761/1822/1852/1856. Without this, reads catch the
    // stale 0 while the columns (which poll until rendered) show the real count — a settle race.
    const loader = this.page.getByText('Staging Queue', { exact: false });
    await loader.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => { /* already closed (fast) */ });
    await loader.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => { /* gone */ });
  }

  /** Locator for a "Live Queue" quick-select button by its queue docid (data-queue-id). */
  liveQueueButton(queueId: string): Locator {
    return this.page.locator(`${SEL.liveQueueBtn}[data-queue-id="${queueId}"]`);
  }

  // ===========================================================================
  // READS — every value is APP-computed and stream-driven (expect.poll)
  // ===========================================================================

  /**
   * The board's "Total Participants" number (html:837): Σ of each stage's `allTokens.length`
   * EXCLUDING the "Unattended Participants" stage, after active filters are applied (component
   * ts:2009-2011). APP-computed from the live `queue_token` stream — polled until it renders a finite
   * integer. Never a value the test wrote.
   */
  async readTotalParticipants(): Promise<number> {
    return this.pollNumber(
      this.page.locator(SEL.totalParticipants),
      'readTotalParticipants: the "Total Participants" span never rendered a number — is a queue selected and the queue_token stream loaded?',
    );
  }

  /**
   * Per-stage COLUMN count (html:1189): `column.allTokens?.length ?? column.tokenlist.length` — the
   * number the board re-rendered for one column header, scoped by its stable `data-stage-key`. This is
   * the count `assertCountConserved` (e2e/lib/assertions.ts) diffs before/after a move. APP-computed,
   * polled. Resolves `stage` to a single column (see StageRef); throws if it matches 0 or >1 columns.
   */
  async readColumnCount(stage: StageRef): Promise<number> {
    const header = await this.resolveStageHeader(stage);
    const countSpan = header.locator(SEL.stageCount);
    return this.pollNumber(
      countSpan,
      `readColumnCount: stage-count span for ${this.describeStage(stage)} never rendered a number.`,
    );
  }

  /**
   * Snapshot of EVERY visible column's count as a { stageKey → count } map. Handy for passing both
   * `before` and `after` to assertCountConserved without naming stages. Keys are the stable
   * `data-stage-key` values (unique per column, including split sub-columns). APP-computed; polled
   * until at least one column has rendered a number.
   */
  async readAllColumnCounts(): Promise<Record<string, number>> {
    let last: Record<string, number> = {};
    await expect
      .poll(async () => {
        last = await this.readAllColumnCountsOnce();
        return Object.keys(last).length > 0;
      }, { ...POLL, message: 'readAllColumnCounts: no stage columns rendered a numeric count.' })
      .toBe(true);
    return last;
  }

  /**
   * The "Stage Counts" chip badge for a given stage NAME (operator.md §B/§4; html:1138-1139):
   * `getStageCountTotal(card)` aggregated from the `stage opportunity count` cards — a DIFFERENT
   * app-computed number than the per-column count (it sums the configured status buckets, component
   * ts:1363-1392). The chip strip is collapsed by default, so this opens it first
   * (`showStageCountDropdown`). No testid was shipped for these chips — selectors use the stable
   * `.stage-count-chip` / `.chip-name` / `.chip-badge` classes cited in operator.md (see RISKS).
   *
   * `stageName` is matched against the chip's `.chip-name` (= `card.stagename`). APP-computed, polled.
   */
  async readStageChip(stageName: string): Promise<number> {
    // Expand the Stage-Counts dropdown if its card chips are not yet present.
    const chips = this.page.locator(SEL.stageCountChip).filter({ hasText: stageName });
    if ((await chips.count()) === 0) {
      const toggle = this.page.locator(SEL.stageCountsToggle);
      await expect(toggle, 'readStageChip: "Stage Counts" toggle not found (no stage opportunity count cards?)').toBeVisible({ timeout: 10_000 });
      await toggle.click();
    }
    // The matching card chip's badge holds getStageCountTotal(card). Scope name match to .chip-name to
    // avoid the toggle chip ("Stage Counts") and partial-name collisions.
    const card = this.page
      .locator(SEL.stageCountChip)
      .filter({ has: this.page.locator('.chip-name', { hasText: new RegExp(`^${escapeRegExp(stageName)}$`) }) })
      .first();
    const badge = card.locator('.chip-badge');
    return this.pollNumber(
      badge,
      `readStageChip: chip badge for stage "${stageName}" never rendered a number (is it one of the configured stage-count cards?).`,
    );
  }

  // ===========================================================================
  // ACTIONS — single-token moves (drive the real move-dropdown + confirm dialog)
  // ===========================================================================

  /**
   * Move ONE token to a NON-Activity target stage through the real UI:
   *   1. open that token's move dropdown (qm-move-btn, scoped by the card's data-token-id),
   *   2. click the target option (qm-move-target[data-stage-name=...]) — fires moveTokenToStage,
   *   3. drive the PeopleInvolved confirm dialog (pi-person-select + pi-submit) that opens for every
   *      non-Activity move (operator.md §D; component ts:2895) and commits the writeBatch.
   *
   * The PRODUCT performs the writes (queue_token update + `queue stage log` set — operator.md §3.1);
   * this method only drives clicks. Do NOT assert by reading the field back — assert the new
   * `queue stage log` row / recomputed counts (anti-circularity). `opts.specialist` picks the
   * Specialist when the stage needs one.
   *
   * @param tokenSel  the card's data-token-id (profile_id || docid).
   * @param targetStage  the destination — matched against qm-move-target's data-stage-name
   *        (= targetColumn.stagename). Pass a plain stage NAME (the dropdown lists names, not keys).
   */
  async moveToken(tokenSel: TokenRef, targetStage: string, opts: MoveOpts = {}): Promise<void> {
    await this.clickMoveTarget(tokenSel, targetStage);
    await this.confirmPeopleInvolved(opts);
  }

  /**
   * Move ONE token INTO an Activity stage (open a studio): same dropdown→target click, but the target
   * being an Activity stage makes the product open the AssignQueueStudio dialog instead of
   * PeopleInvolved (operator.md §E; component ts:3088). This method picks the studio
   * (aqs-studio-select) and submits (aqs-submit) — the product then writes the `live assignment` +
   * pairing `status:'live'` + token `status:'instudio'` (operator.md §3.2).
   *
   * @param tokenSel  card data-token-id.
   * @param studio    the Activity stage name (qm-move-target[data-stage-name]) to move into.
   * @param studioOption  visible name of the studio to choose in aqs-studio-select. If omitted, the
   *        first enabled studio option is chosen.
   */
  async moveTokenToActivity(tokenSel: TokenRef, studio: string, studioOption?: string): Promise<void> {
    await this.clickMoveTarget(tokenSel, studio);
    const dialogSelect = this.page.locator(SEL.aqsStudioSelect);
    await expect(dialogSelect, 'moveTokenToActivity: AssignQueueStudio dialog did not open after choosing the Activity target.').toBeVisible({ timeout: 15_000 });
    await this.pickMatOption(dialogSelect, studioOption); // studioOption undefined → first enabled option
    const submit = this.page.locator(SEL.aqsSubmit);
    await expect(submit, 'moveTokenToActivity: "Assign Specialist" submit stayed disabled (form invalid — a studio + required activity must be chosen).').toBeEnabled({ timeout: 10_000 });
    await submit.click();
    await expect(dialogSelect).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Drive a token through its FINAL-stage completion. The final move is a normal non-Activity move to
   * the terminal stage, so it routes through PeopleInvolved exactly like moveToken; when the drop is
   * the last stage the component additionally calls guard.updateDeliveryStatus(... "completed")
   * (operator.md §3.1.c). Caller passes the terminal stage NAME (the variation's last stage, e.g.
   * "Completed"). Equivalent to `moveToken(tokenSel, terminalStage, opts)`, named for intent/readability.
   *
   * @param tokenSel  card data-token-id.
   * @param terminalStage  the terminal stage name to move into.
   */
  async completeFinal(tokenSel: TokenRef, terminalStage: string, opts: MoveOpts = {}): Promise<void> {
    await this.moveToken(tokenSel, terminalStage, opts);
  }

  // ===========================================================================
  // ACTIONS — bulk
  // ===========================================================================

  /**
   * "Complete the whole column" via the per-stage developer action (cloud_done icon →
   * completeQueue(column tokens, stagename) — html:1194-1196). This button is ONLY in the DOM when the
   * acting operator has the `developer` role; if absent this throws a clear timeout (RISKS: seed the
   * operator as developer, or drive completion per-token via completeFinal / the Bulk Move panel).
   * The PRODUCT performs the per-token completion writes; assert via recomputed counts / log rows.
   *
   * @param stage  which column to complete (StageRef; resolves to one column header).
   */
  async bulkComplete(stage: StageRef): Promise<void> {
    const header = await this.resolveStageHeader(stage);
    const btn = header.locator(SEL.stageCompleteIcon);
    await expect(btn, `bulkComplete: developer "cloud_done" complete button not present on ${this.describeStage(stage)} (operator likely lacks the developer role).`).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  /**
   * Bulk-invite a selection of participants via the comms panel: open comms for `stage`, select the
   * given participants (or Select-All), then click "BulkInvite(n)" (html:57-61) which opens the
   * CreateBulkInvitation dialog (operator.md §F / testids.md `bulkinv-*`). Returns the recipient count
   * the PANEL reported it acted on (getSelectedTokens().length, read from the recipient-count span) so
   * the spec can assert against a KNOWN-SEEDED selection size — that count is APP-computed, not written
   * by the test.
   *
   * NOTE: this method opens comms + selects + clicks BulkInvite; finishing the invite (choosing a stage
   * in the bulkinv dialog and clicking `bulkinv-submit-btn`) is left to the spec/dialog page object,
   * since the invite TARGET stage and CF-fanout assertion are spec concerns. If the dialog page object
   * is unavailable, the spec asserts the panel-reported recipient count returned here.
   *
   * @param selection  { stage } to open comms on; and either { all:true } to Select-All or
   *        { tokens: TokenRef[] } to toggle specific participant rows by their card token id.
   */
  async bulkInvite(selection: { stage: StageRef; all?: boolean; tokens?: TokenRef[] }): Promise<number> {
    await this.openComms(selection.stage);
    await this.selectCommsRecipients(selection);
    const count = await this.commsRecipientCount();
    const btn = this.page.locator(SEL.commsBulkInvite);
    await expect(btn, 'bulkInvite: "BulkInvite(n)" button is disabled — no participants selected.').toBeEnabled({ timeout: 10_000 });
    await btn.click();
    return count;
  }

  // ===========================================================================
  // ACTIONS / READS — comms sidebar
  // ===========================================================================

  /**
   * Open the comms sidebar for a stage. Two entry points (operator.md §F): the per-stage message icon
   * in a column header, or — for the special admin stage — the "Admin Stage" header button. Pass the
   * literal string 'queueadmin' (or { admin:true }) for the Admin Stage; otherwise a StageRef naming a
   * column whose message icon is clicked. Resolves once the comms panel (Select-All wrapper) is shown.
   */
  async openComms(stage: StageRef | 'queueadmin' | { admin: true }): Promise<void> {
    if (stage === 'queueadmin' || (typeof stage === 'object' && 'admin' in stage && stage.admin)) {
      await this.page.locator(SEL.adminStageBtn).click();
    } else {
      const header = await this.resolveStageHeader(stage as StageRef);
      await header.locator(SEL.stageCommsIcon).click();
    }
    await expect(this.page.locator(SEL.commsSelectAll), 'openComms: comms panel (Select-All) did not appear.').toBeVisible({ timeout: 15_000 });
  }

  /**
   * Recipient count shown in the comms panel (html:45): `getSelectedTokens().length`, the size of the
   * component's `selectedTokens` Set (operator.md §4). APP-computed, polled. Read AFTER selecting
   * participants. Returns 0 when nothing is selected.
   */
  async commsRecipientCount(): Promise<number> {
    return this.pollNumber(
      this.page.locator(SEL.commsRecipientCount),
      'commsRecipientCount: the recipient-count span never rendered a number (is the comms panel open?).',
    );
  }

  /**
   * Toggle "Select All" in the comms panel (html:175, toggleSelectAll()). Idempotent toward
   * `want`: only clicks when the current checked state (`.custom-checkbox.checked` via areAllSelected())
   * differs. NOTE: Select-All only has rows to select once stages are chosen in "Select Stages" — the
   * panel's participant list is empty until then (html:184), so choose stages first (selectCommsStages
   * or open comms via a stage's icon which pre-fills selectedChatStage but NOT selectedStages).
   */
  async commsSelectAll(want = true): Promise<void> {
    const wrapper = this.page.locator(SEL.commsSelectAll);
    await expect(wrapper).toBeVisible();
    const checked = await wrapper.locator('.custom-checkbox.checked').count();
    if ((checked > 0) !== want) {
      await wrapper.click();
    }
    if (want) {
      await expect(wrapper.locator('.custom-checkbox.checked'), 'commsSelectAll: Select-All did not become checked (are there participants in the chosen stages?).').toHaveCount(1, { timeout: 10_000 });
    }
  }

  /**
   * Choose stages in the comms "Select Stages" multi-select (html:21). The participant list + recipient
   * count populate from the chosen stages (operator.md §F). `stageDisplayNames` are matched against the
   * option text `getStageDisplayName(stage) (n)`. Leaves the overlay closed afterward.
   */
  async selectCommsStages(stageDisplayNames: string[]): Promise<void> {
    const select = this.page.locator(SEL.commsStageSelect);
    await expect(select).toBeVisible();
    await select.click();
    for (const name of stageDisplayNames) {
      await this.page.locator(SEL.matOption).filter({ hasText: name }).first().click();
    }
    // Close the multi-select overlay (Escape) so it does not cover the Select-All / Send controls.
    await this.page.keyboard.press('Escape');
  }

  /**
   * Whether the comms "Send" button is present AND enabled. The `.send-btn` is rendered only when a
   * comm TYPE has been selected (`*ngIf="selectedCommType"`, html:160) and is `[disabled]` while no
   * participant is selected (html:161). Returns false when the button is absent (no comm type chosen).
   * This is a read of the PRODUCT's own enable/`*ngIf` logic — not a test-side computation.
   */
  async commsSendEnabled(): Promise<boolean> {
    const send = this.page.locator(SEL.commsSend);
    if ((await send.count()) === 0) return false; // no comm type selected → button not rendered
    return send.isEnabled();
  }

  /** Toggle a single participant row in the comms list by the value its card carries (token id text scope). */
  async toggleCommsParticipant(tokenSel: TokenRef): Promise<void> {
    // The comms participant rows don't carry data-token-id (operator.md §F lists no testid); they are
    // matched by the participant whose card on the board has data-token-id == tokenSel. To stay on
    // ONLY-existing selectors we match the row by the participant NAME shown on its board card.
    const name = await this.tokenName(tokenSel);
    const row = this.page.locator(SEL.commsParticipantItem).filter({ hasText: name }).first();
    await expect(row, `toggleCommsParticipant: no comms row for token ${tokenSel} (name "${name}") — are its stages selected?`).toBeVisible({ timeout: 10_000 });
    await row.click();
  }

  // ===========================================================================
  // ACTIONS / READS — filters sidebar
  // ===========================================================================

  /** Open the Filters sidebar (the `tune` icon button, html:884 → sidenavMode='filter'). */
  async openFilters(): Promise<void> {
    await this.page.locator(SEL.filtersOpen).click();
    // Filters body renders the Clear-all only when a filter is active; the Tags row is the stable anchor
    // for "panel is open" (it exists whenever availableTags.length>0). Fall back to the panel header.
    await expect(
      this.page.locator('.filter-sidenav-body, .panel-header:has(b:text-is("Filters"))').first(),
      'openFilters: Filters sidebar did not open.',
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Apply (toggle ON) a tag filter by the tag's visible name. Opens the Tags row if collapsed, then
   * clicks the matching `qm-tag-option` (html:446, toggleTagSelection + onTagFilterChange — a LIVE
   * filter, no Apply button). Confirms the tag became active by its chip appearing in the top chips row
   * (qm-tag-chip). The board re-filters itself; the spec asserts the recomputed counts.
   *
   * Requires openFilters() first. `tag` matches the option's inner name span (html:451).
   */
  async applyFilterTag(tag: string): Promise<void> {
    // Open the Tags dropdown if its options aren't present yet.
    if ((await this.page.locator(SEL.tagOption).count()) === 0) {
      const row = this.page.locator(SEL.tagFilterRow).locator('.fsb-row').first();
      await expect(row, 'applyFilterTag: Tags filter row not found (availableTags empty?).').toBeVisible({ timeout: 10_000 });
      await row.click();
    }
    const option = this.page.locator(SEL.tagOption).filter({ hasText: tag }).first();
    await expect(option, `applyFilterTag: tag option "${tag}" not found in the Tags dropdown.`).toBeVisible({ timeout: 10_000 });
    await option.click();
    // The applied tag surfaces as a removable chip in the top chips row — confirms the filter is live.
    await expect(this.page.locator(SEL.tagChip).filter({ hasText: tag }), `applyFilterTag: tag chip "${tag}" did not appear after selecting it.`).toHaveCount(1, { timeout: 10_000 });
  }

  /**
   * The active-filter badge count on the `tune` button (html:886, getActiveFilterCount()): the number
   * of active filter DIMENSIONS (search/segments/tags/preassigned/…) — operator.md §4. The badge span
   * only renders when the count is > 0, so this returns 0 when the badge is absent. APP-computed.
   */
  async filterBadgeCount(): Promise<number> {
    const badge = this.page.locator(SEL.filterBadge);
    if ((await badge.count()) === 0) return 0; // *ngIf hides it at 0
    return this.pollNumber(badge, 'filterBadgeCount: filter badge present but rendered no number.');
  }

  /**
   * Clear all filters. The "Clear all" button (qm-filters-clearall, html:378) lives in the Filters
   * sidebar header and only renders when ≥1 filter is active. Opens Filters if needed; no-ops when no
   * filter is active (button absent → nothing to clear). Confirms by polling the badge back to 0.
   */
  async clearFilters(): Promise<void> {
    if ((await this.page.locator(SEL.filtersClearAll).count()) === 0) {
      // Maybe the sidebar is closed. Open it and re-check.
      await this.openFilters();
    }
    const clear = this.page.locator(SEL.filtersClearAll);
    if ((await clear.count()) === 0) return; // genuinely nothing active
    await clear.click();
    await expect.poll(() => this.filterBadgeCount(), { ...POLL, message: 'clearFilters: active-filter badge did not return to 0.' }).toBe(0);
  }

  // ===========================================================================
  // ACTIONS / READS — export CSV
  // ===========================================================================

  /**
   * Click "Export CSV" (qm-export-csv, html:868) and parse the downloaded file. exportCSV() builds the
   * CSV client-side from `stageQueue` + `fetchAllLogs()` and triggers an `<a download>` (operator.md
   * §3.5; component ts:3442/3731) — NO Firestore write. The CSV is comma-delimited, CRLF-terminated,
   * first line = header list, BOM-prefixed (component ConvertToCSV ts:3748-3757). Returns the parsed
   * headers + rows so the spec can assert the export reflects APP state (e.g. row count vs a KNOWN
   * stage population) — the numbers come from the product's own export, not from the test.
   *
   * Captures Playwright's `download` event; reads the saved stream. baseURL/project untouched.
   */
  async exportCsv(): Promise<ExportedCsv> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download', { timeout: 30_000 }),
      this.page.locator(SEL.exportCsv).click(),
    ]);
    const stream = await download.createReadStream();
    const text = await streamToString(stream);
    return parseCsv(text);
  }

  // ===========================================================================
  // Locators exposed for spec-level scoping / debugging
  // ===========================================================================

  /** Locator for a token card by its data-token-id. */
  tokenCard(tokenSel: TokenRef): Locator {
    return this.page.locator(`${SEL.tokenCard}[data-token-id="${this.cssEscape(tokenSel)}"]`);
  }

  /**
   * Reveal a token card that the board paginated out of the DOM. The board renders only the first
   * `PAGE_SIZE` (15) tokens per column ordered by `logdate asc` and hides the rest behind a "Load More"
   * button (component ts:getDisplayedTokens/PAGE_SIZE=15; html:1592 `.load-more-btn`). A freshly seeded
   * token has the LATEST `logdate`, so on a crowded shared column (e.g. the common "Evolution Prep
   * Orientation" entry, where the base seed + every variation cohort pile up well past 15) it sorts last
   * and never renders until the column is paged open. This clicks every currently-visible "Load More"
   * button (across all columns) until either the card is in the DOM or no Load-More remains. It is a
   * no-op when the card is already on the first page, and it drives the product's REAL Load-More control
   * (never mutates state) — so it is safe to call before any card-presence wait. Returns true once the
   * card is present, false if it could not be revealed within the bound.
   */
  async revealTokenCard(tokenSel: TokenRef, opts: { maxClicks?: number } = {}): Promise<boolean> {
    const card = this.tokenCard(tokenSel);
    if ((await card.count()) > 0) return true;
    const loadMore = this.page.locator('.load-more-btn');
    const maxClicks = opts.maxClicks ?? 40;
    for (let i = 0; i < maxClicks; i++) {
      if ((await card.count()) > 0) return true;
      const buttons = await loadMore.elementHandles();
      if (buttons.length === 0) break;
      let clickedAny = false;
      for (const b of buttons) {
        try {
          if (await b.isVisible()) {
            await b.click({ timeout: 2_000 });
            clickedAny = true;
          }
        } catch {
          // a button may detach as the column re-renders after a sibling click — ignore and continue.
        }
      }
      if (!clickedAny) break;
      // let the *ngFor re-render the newly paged-in tokens before the next presence check.
      await this.page.waitForTimeout(150);
    }
    return (await card.count()) > 0;
  }

  /**
   * Best-effort IMAGING capture: reveal the participant's card (paging it in if a crowded column hid
   * it past the 15-row "Load More" limit), scroll it into view, and write a VIEWPORT screenshot to
   * `absPath` — visual proof the participant's REAL card is on the REAL operator board at its current
   * stage (the column header + card are both in frame). Never mutates state (drives only Load-More +
   * scroll). Returns whether the card was captured.
   */
  async captureTokenCardShot(tokenSel: TokenRef, absPath: string): Promise<boolean> {
    try {
      await this.revealTokenCard(tokenSel);
      const card = this.tokenCard(tokenSel);
      if ((await card.count()) === 0) return false;
      await card.first().scrollIntoViewIfNeeded().catch(() => {});
      await this.page.waitForTimeout(250);
      await this.page.screenshot({ path: absPath }); // viewport — shows the card in its column context
      return true;
    } catch {
      return false;
    }
  }

  /** Locator for a stage column header by exact data-stage-key. */
  stageHeaderByKey(stageKey: string): Locator {
    return this.page.locator(`${SEL.stageHeader}[data-stage-key="${this.cssEscape(stageKey)}"]`);
  }

  /**
   * All `data-stage-key`s the board rendered for a given stage NAME — one for a simple stage, several
   * for a split studio stage (`<name>_queued_i` / `_waiting_i` / `_activity_i`). Pure DOM read of the
   * live headers (no key reconstruction). Used by count-drift assertions to find WHICH sub-column a
   * token left/entered (the Queued sub-column for a parked token). Returns [] if the name isn't present.
   */
  async stageKeysForName(stageName: string): Promise<string[]> {
    const headers = await this.collectHeaders();
    return headers.filter((h) => h.name === stageName).map((h) => h.key);
  }

  /**
   * Public wrapper over the internal StageRef→`data-stage-key` resolver (the simple/Queued column for a
   * bare name). Exposed so specs can key board-count snapshots by the exact column the board built,
   * rather than reconstructing keys by hand.
   */
  async resolveStageKeyPublic(stage: StageRef): Promise<string> {
    return this.resolveStageKey(stage);
  }

  /**
   * READ-ONLY inspection of a token's move-dropdown: open it, assert the scoped target option(s) the
   * APP rendered, then DISMISS without committing (leaves shared board state untouched). Proves the
   * board OFFERS exactly the oracle's legal operator targets (`opts.offers`) and does NOT render an
   * illegal/backbone-only target (`opts.absent`) — e.g. the dead-forward DRC→ATC Preparation skip
   * (flow-config.md §3 D1). The option values are APP-COMPUTED (the board renders the variation-scoped
   * `nextstage` edges from its live Firestore stream); this asserts a value the product produced, not
   * one the test wrote, and commits NO move (anti-circularity / serialized-suite safety).
   *
   * @param tokenSel card data-token-id.
   * @param opts.offers  stage names the dropdown MUST offer (data-stage-name present + visible).
   * @param opts.absent  stage names the dropdown MUST NOT offer (data-stage-name absent).
   */
  async assertMoveTargets(tokenSel: TokenRef, opts: { offers?: string[]; absent?: string[] } = {}): Promise<void> {
    const card = this.tokenCard(tokenSel);
    await this.revealTokenCard(tokenSel); // page the card in if a crowded column hid it (>15 tokens)
    await expect(card, `assertMoveTargets: token card ${tokenSel} not found on the board.`).toBeVisible({ timeout: 15_000 });
    const moveBtn = card.locator(SEL.moveBtn);
    await expect(moveBtn, `assertMoveTargets: Move button for token ${tokenSel} disabled/missing.`).toBeEnabled({ timeout: 10_000 });
    await moveBtn.click();
    await expect(this.page.locator(SEL.moveDropdown).first(), `assertMoveTargets: move-dropdown did not open for token ${tokenSel}.`).toBeVisible({ timeout: 10_000 });
    try {
      for (const name of opts.offers || []) {
        // A SPLIT stage (compulsoryactivity) renders ONLY as typed buckets "<name> (Queued|Waiting|Activity)",
        // never bare — so "offered" means the exact name OR any of its typed sub-column buckets is present.
        // A split stage yields MULTIPLE matches (up to 3 typed buckets), so assert on `.first()` to avoid a
        // strict-mode violation — "offered" only requires that AT LEAST ONE matching option is visible.
        await expect(
          this.moveTargetAnyVariant(name).first(),
          `assertMoveTargets: dropdown for token ${tokenSel} must OFFER scoped target "${name}" (the board did not render it, bare or as a typed "(Queued|Waiting|Activity)" bucket).`,
        ).toBeVisible({ timeout: 10_000 });
      }
      for (const name of opts.absent || []) {
        // Absence is STRICT: neither the bare name nor ANY typed bucket may appear (an illegal/backbone-only
        // skip must not be reachable through any sub-column — flow-config §3 D1).
        await expect(
          this.moveTargetAnyVariant(name),
          `assertMoveTargets: dropdown for token ${tokenSel} must NOT offer "${name}" (bare or any typed bucket — illegal/backbone-only skip, flow-config §3 D1).`,
        ).toHaveCount(0, { timeout: 10_000 });
      }
    } finally {
      // Dismiss WITHOUT committing — keep shared board state clean for the serialized suite.
      await this.page.keyboard.press('Escape').catch(() => {});
    }
  }

  /**
   * READ-ONLY assertion that a token has NO legal forward move — the product reality of a terminal /
   * parking stage whose variation exposes ZERO `nextstage` edges (e.g. V9 uP! Prep-Hold, whose sole
   * stage IS its terminal — flow-config.md §2 V9). Opens the token's move-dropdown and asserts that the
   * board rendered ZERO *enabled* move-target options, then DISMISSES without committing.
   *
   * Why "enabled-zero", not "count-zero": the board's `checkAvailablestages` builds the dropdown from
   * the token's *variation stage list* (`mapVariation[variationid].stages`), not from `nextstage`, and
   * the template lists every variation stage EXCEPT marking the current one `[disabled]`
   * (component ts:checkAvailablestages + html move-dropdown `[disabled]="targetColumn.stagename ===
   * column.stagename"`). For a single-stage variation the ONLY option the board can render is the
   * current stage itself — and it is rendered DISABLED. So the product-truthful "move-dropdown EMPTY"
   * is: zero ENABLED targets (no destination the operator can actually pick). This reads a value the
   * APP computed from its live variation-scoped stream — never one the test wrote — and writes NO move.
   *
   * Also asserts (defensively) that no ENABLED target names any *other* stage, and that any rendered
   * option is the disabled self-stage — surfacing a regression where a terminal suddenly offers a move.
   *
   * @param tokenSel       card data-token-id.
   * @param expectSelfStage optional: the stage the token sits on (the only option the board may render,
   *        rendered disabled). When given, asserts the lone rendered option (if any) carries this
   *        data-stage-name and is disabled.
   */
  async assertNoEnabledMoveTargets(tokenSel: TokenRef, expectSelfStage?: string): Promise<void> {
    const card = this.tokenCard(tokenSel);
    await this.revealTokenCard(tokenSel); // page the card in if a crowded column hid it (>15 tokens)
    await expect(card, `assertNoEnabledMoveTargets: token card ${tokenSel} not found on the board.`).toBeVisible({ timeout: 15_000 });
    const moveBtn = card.locator(SEL.moveBtn);
    // The Move ⇄ button itself renders for every (non-DFU) token; it is only disabled for locked/
    // defaulted/DFU financial cases (component html move-btn [disabled]). A parked terminal token is
    // none of those, so the button is enabled and opens a dropdown that lists no pickable destination.
    await expect(moveBtn, `assertNoEnabledMoveTargets: Move button for token ${tokenSel} disabled/missing.`).toBeEnabled({ timeout: 10_000 });
    await moveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await moveBtn.click();
    await expect(this.page.locator(SEL.moveDropdown).first(), `assertNoEnabledMoveTargets: move-dropdown did not open for token ${tokenSel}.`).toBeVisible({ timeout: 10_000 });
    try {
      // The product's "no legal move" signal: ZERO ENABLED move-target options. (A disabled self-stage
      // option may render; it is NOT a destination the operator can choose.) APP-computed; polled
      // because the dropdown's stage list is derived from the async variation stream.
      await expect
        .poll(async () => this.page.locator(`${SEL.moveTarget}:not([disabled])`).count(), {
          ...POLL,
          message: `assertNoEnabledMoveTargets: token ${tokenSel} must have ZERO enabled move-targets (terminal/parking stage), but the board rendered at least one pickable destination.`,
        })
        .toBe(0);
      // Defensive: the only option the board may render is the disabled self-stage (bare for an un-split
      // stage, or a typed bucket for a split one — match either form).
      if (expectSelfStage) {
        const self = this.moveTargetAnyVariant(expectSelfStage);
        const selfBare = `${SEL.moveTarget}[data-stage-name="${this.cssEscape(expectSelfStage)}"]`;
        const selfTyped = `${SEL.moveTarget}[data-stage-name^="${this.cssEscape(`${expectSelfStage} (`)}"]`;
        const others = this.page.locator(`${SEL.moveTarget}:not(${selfBare}):not(${selfTyped})`);
        await expect(others, `assertNoEnabledMoveTargets: dropdown for token ${tokenSel} rendered a target other than the disabled self-stage "${expectSelfStage}".`).toHaveCount(0, { timeout: 10_000 });
        // If the self-stage option renders at all, it must be DISABLED (cannot move onto itself).
        if ((await self.count()) > 0) {
          await expect(self.first(), `assertNoEnabledMoveTargets: the self-stage option "${expectSelfStage}" must be rendered DISABLED.`).toBeDisabled({ timeout: 10_000 });
        }
      }
    } finally {
      await this.page.keyboard.press('Escape').catch(() => {});
    }
  }

  // ===========================================================================
  // Internals
  // ===========================================================================

  /**
   * Click a token's Move button then the named target option inside its open `.move-dropdown`. Shared
   * by moveToken / moveTokenToActivity / completeFinal. The dropdown renders ONLY for the open token
   * (isMenuOpen, component ts:4409), and qm-move-target is a static value, so the target is scoped by
   * its data-stage-name (the open token's dropdown is the only one in the DOM) — never by brittle text.
   */
  private async clickMoveTarget(tokenSel: TokenRef, targetStage: string): Promise<void> {
    const card = this.tokenCard(tokenSel);
    await this.revealTokenCard(tokenSel); // page the card in if a crowded column hid it (>15 tokens)
    await expect(card, `move: token card ${tokenSel} not found on the board.`).toBeVisible({ timeout: 15_000 });
    const moveBtn = card.locator(SEL.moveBtn);
    await expect(moveBtn, `move: Move button for token ${tokenSel} is disabled (DFU/locked) or missing.`).toBeEnabled({ timeout: 10_000 });
    await moveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await moveBtn.click();
    // The dropdown for this token is now open; target options carry data-stage-name = targetColumn.stagename.
    // For a SPLIT stage (compulsoryactivity) the board renders NO bare option — only the typed sub-column
    // buckets "<name> (Queued)" / "(Waiting)" / "(Activity)" (component checkAvailablestages, ts:2796-2821).
    // So resolve the destination to a real, present option: prefer the exact name the caller passed (works
    // when a caller already passed a suffixed bucket, e.g. "Diagnostics (Activity)"); else fall back to the
    // "(Queued)" bucket — the canonical non-Activity "send to this stage" destination (moveTokenToStage
    // parses the suffix back to the bare stage, ts:2856-2860, so the committed currentstage is the bare
    // name either way). This is the product's real surface, not a relaxed selector.
    const target = await this.resolveMoveTarget(targetStage, tokenSel);
    await target.click();
  }

  /**
   * Resolve a caller-supplied destination NAME to the move-dropdown option the board actually renders,
   * accounting for split-stage sub-column suffixes. Returns a Locator scoped to the OPEN dropdown's
   * `qm-move-target` whose data-stage-name is either the exact name or its "(Queued)" bucket. Asserts
   * the option exists (visible) before returning — so callers fail with a clear message if no legal
   * destination is offered (e.g. an illegal scoped edge). The dropdown must already be open.
   */
  private async resolveMoveTarget(targetStage: string, tokenSel: TokenRef): Promise<Locator> {
    const exact = this.page.locator(`${SEL.moveTarget}[data-stage-name="${this.cssEscape(targetStage)}"]`);
    // Split stages render ONLY as typed buckets "<name> (Queued|Waiting|Activity)"; un-split stages render
    // bare. The board's checkAvailablestages EXCLUDES exactly the (stage,type) sub-column the token
    // currently sits in (component ts:2803) — so for a SELF-LOOP onto a split stage (target == the token's
    // own stage, e.g. the "Send Back" edge), the "(Queued)" bucket the token sits in is NOT offered, but the
    // sibling "(Waiting)"/"(Activity)" buckets ARE (and committing any of them re-buckets the token onto the
    // SAME bare stage — moveTokenToStage parses the suffix back, ts:2856-2860). So accept the exact name OR
    // its "(Queued)" bucket OR ANY typed sub-column bucket of this stage. Wait until at least one has
    // rendered (the dropdown's *ngFor populates async on open) so we never race-read 0 and pick nothing.
    const queued = this.page.locator(`${SEL.moveTarget}[data-stage-name="${this.cssEscape(`${targetStage} (Queued)`)}"]`);
    const waiting = this.page.locator(`${SEL.moveTarget}[data-stage-name="${this.cssEscape(`${targetStage} (Waiting)`)}"]`);
    const anyTyped = this.page.locator(`${SEL.moveTarget}[data-stage-name^="${this.cssEscape(`${targetStage} (`)}"]`);
    await expect(
      exact.or(queued).or(anyTyped).first(),
      `move: target option "${targetStage}" (or any "${targetStage} (Queued|Waiting|Activity)" split bucket) not available ` +
        `in the move dropdown for token ${tokenSel} (not a legal scoped edge from its current stage?).`,
    ).toBeVisible({ timeout: 10_000 });
    // Prefer the exact match (caller may have passed a suffixed bucket, e.g. "Diagnostics (Activity)", or
    // the stage is un-split); then the "(Queued)" bucket; then the "(Waiting)" bucket. We deliberately
    // prefer a NON-Activity sub-column for the self-loop case (the token's own "(Queued)" is excluded by
    // the board): committing to "(Activity)" would route moveTokenToStage down the studio-assign branch
    // (dropType=="Activity" → AssignQueueStudio dialog, component ts:2883/2900) instead of a plain
    // same-stage move. anyTyped is the last resort (Activity-only would be a genuine studio target).
    if ((await exact.count()) > 0) return exact.first();
    if ((await queued.count()) > 0) return queued.first();
    if ((await waiting.count()) > 0) return waiting.first();
    return anyTyped.first();
  }

  /**
   * Drive the PeopleInvolved confirm dialog that opens after a non-Activity move target is clicked
   * (operator.md §D). Picks the Specialist if `opts.specialist` is given, then submits (pi-submit).
   * Waits for the dialog to close (the writeBatch commits on submit — component ts:2958).
   */
  private async confirmPeopleInvolved(opts: MoveOpts): Promise<void> {
    const submit = this.page.locator(SEL.piSubmit);
    await expect(submit, 'move: PeopleInvolved confirm dialog did not open after clicking the target stage.').toBeVisible({ timeout: opts.dialogTimeoutMs ?? 15_000 });
    if (opts.specialist) {
      const personSelect = this.page.locator(SEL.piPersonSelect);
      await expect(personSelect).toBeVisible();
      await this.pickMatOption(personSelect, opts.specialist);
    }
    await submit.click();
    await expect(submit, 'move: PeopleInvolved dialog did not close after submit (the move may not have committed).').toBeHidden({ timeout: 15_000 });
  }

  /** Select comms recipients per a bulkInvite/selection descriptor (Select-All or explicit tokens). */
  private async selectCommsRecipients(selection: { all?: boolean; tokens?: TokenRef[] }): Promise<void> {
    if (selection.all) {
      await this.commsSelectAll(true);
    } else if (selection.tokens && selection.tokens.length) {
      for (const t of selection.tokens) await this.toggleCommsParticipant(t);
    }
  }

  /**
   * Open a mat-select and click an option. When `optionText` is given, matches the option by text;
   * otherwise picks the first ENABLED option (used for "any valid studio"). Works for the dialog
   * selects (pi-person-select / aqs-studio-select) whose overlay renders into the body.
   */
  private async pickMatOption(select: Locator, optionText?: string): Promise<void> {
    await select.click();
    if (optionText) {
      await this.page.locator(SEL.matOption).filter({ hasText: optionText }).first().click();
    } else {
      // first option that is not disabled (Material marks disabled options aria-disabled="true")
      await this.page.locator(`${SEL.matOption}:not([aria-disabled="true"])`).first().click();
    }
    // For single-select, the overlay auto-closes; pressing Escape is harmless if it already closed.
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /** Resolve a StageRef to exactly one column-header Locator (throws on 0 / >1 matches). */
  private async resolveStageHeader(stage: StageRef): Promise<Locator> {
    const key = await this.resolveStageKey(stage);
    const header = this.stageHeaderByKey(key);
    const n = await header.count();
    if (n !== 1) {
      throw new Error(`resolveStageHeader: ${this.describeStage(stage)} resolved to data-stage-key "${key}" matching ${n} headers (expected exactly 1).`);
    }
    return header;
  }

  /**
   * Resolve a StageRef to a concrete `data-stage-key`. Strategy:
   *   • { stageKey } → used as-is.
   *   • string → if a header with that exact data-stage-key exists, use it; else treat it as a stage
   *     NAME and find the column whose display name matches (preferring the simple/Queued column).
   *   • { name, type } → find the column header whose name matches and whose type label matches
   *     (type null → the simple column; "Queued"/"Waiting"/"Activity" → that sub-column).
   * Matching reads the LIVE headers' data-stage-key + rendered name, so it follows whatever the board
   * actually built (component ts:1927-1985) rather than reconstructing keys by hand.
   */
  private async resolveStageKey(stage: StageRef): Promise<string> {
    if (typeof stage === 'object' && 'stageKey' in stage) return stage.stageKey;

    const headers = await this.collectHeaders();
    if (headers.length === 0) {
      throw new Error('resolveStageKey: no stage column headers on the board (is a queue selected and rendered?).');
    }

    if (typeof stage === 'string') {
      const exact = headers.find((h) => h.key === stage);
      if (exact) return exact.key; // it was a stageKey
      const byName = headers.filter((h) => h.name === stage);
      if (byName.length === 0) {
        throw new Error(`resolveStageKey: no column with data-stage-key or name "${stage}". Available keys: ${headers.map((h) => h.key).join(', ')}`);
      }
      // Prefer the simple/Queued column for a bare name on a split stage (deterministic choice).
      return (byName.find((h) => h.type == null) ?? byName.find((h) => h.type === 'Queued') ?? byName[0]).key;
    }

    // { name, type }
    const { name, type } = stage;
    const match = headers.filter((h) => h.name === name && (type === undefined ? true : (h.type ?? null) === (type ?? null)));
    if (match.length !== 1) {
      throw new Error(`resolveStageKey: { name:"${name}", type:${JSON.stringify(type)} } matched ${match.length} columns (expected 1). Available: ${headers.map((h) => `${h.name}[${h.type ?? 'simple'}]`).join(', ')}`);
    }
    return match[0].key;
  }

  /**
   * Read every visible column header's { key, name, type } from the live DOM. `name` is the header's
   * text minus the trailing "- <count>" and the icon-button glyphs; `type` is parsed from the
   * "(Queued|Waiting|Activity)" suffix the template appends (html:1187-1188). Pure DOM read of what the
   * board rendered — no key reconstruction.
   */
  private async collectHeaders(): Promise<{ key: string; name: string; type: 'Queued' | 'Waiting' | 'Activity' | null }[]> {
    return this.page.locator(SEL.stageHeader).evaluateAll((els) =>
      els.map((el) => {
        const key = el.getAttribute('data-stage-key') || '';
        // The first inner span holds the highlighted stage name; the optional next span holds "(type)".
        const spans = Array.from(el.querySelectorAll(':scope > span > span'));
        const rawName = (spans[0]?.textContent || '').trim();
        let type: 'Queued' | 'Waiting' | 'Activity' | null = null;
        const typeText = (spans[1]?.textContent || '').replace(/[()\s]/g, '');
        if (typeText === 'Queued' || typeText === 'Waiting' || typeText === 'Activity') type = typeText;
        // Fallback: derive type from the stageKey shape (<name>_<type>_<i>) if the span parse missed.
        if (!type) {
          if (/_queued_\d+$/.test(key)) type = 'Queued';
          else if (/_waiting_\d+$/.test(key)) type = 'Waiting';
          else if (/_activity_\d+$/.test(key)) type = 'Activity';
        }
        return { key, name: rawName, type };
      }),
    );
  }

  /** Single snapshot of { data-stage-key → count } across all columns. */
  private async readAllColumnCountsOnce(): Promise<Record<string, number>> {
    return this.page.locator(SEL.stageHeader).evaluateAll((els) => {
      const out: Record<string, number> = {};
      for (const el of els) {
        const key = el.getAttribute('data-stage-key');
        if (!key) continue;
        const span = el.querySelector('[data-testid="qm-stage-count"]');
        const n = Number.parseInt((span?.textContent || '').trim(), 10);
        if (Number.isFinite(n)) out[key] = n;
      }
      return out;
    });
  }

  /** Read the participant NAME shown on a token card (html:1337-1338, "Name:" label). */
  private async tokenName(tokenSel: TokenRef): Promise<string> {
    const card = this.tokenCard(tokenSel);
    await expect(card, `tokenName: token card ${tokenSel} not found.`).toBeVisible({ timeout: 10_000 });
    // The card shows "Name:" then the value span. Read the value next to the "Name:" label.
    const value = card.locator('.label:text-is("Name:") + span, .label:has-text("Name") + span').first();
    const txt = (await value.textContent())?.trim();
    if (txt) return txt;
    // Fallback: the whole card text (still product-rendered) — let the comms filter substring-match it.
    return (await card.textContent())?.trim() || tokenSel;
  }

  /** Poll a locator until its trimmed text parses to a finite integer; return it. */
  private async pollNumber(loc: Locator, message: string): Promise<number> {
    await expect.poll(async () => (await this.parseIntOrNull(loc)) !== null, { ...POLL, message }).toBe(true);
    return (await this.parseIntOrNull(loc)) ?? 0;
  }

  /** Parse a locator's trimmed text as an integer; null if absent/non-numeric. */
  private async parseIntOrNull(loc: Locator): Promise<number | null> {
    if ((await loc.count()) === 0) return null;
    const txt = (await loc.first().textContent())?.trim() ?? '';
    if (txt === '') return null;
    const n = Number.parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }

  /** CSS.escape for attribute-value selectors (token ids / stage keys can contain spaces, etc.). */
  private cssEscape(v: string): string {
    // Playwright accepts double-quoted attr values; escape embedded quotes/backslashes.
    return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * A `qm-move-target` locator that matches a stage NAME whether the board rendered it bare (un-split
   * stage) OR as any of its typed sub-column buckets "<name> (Queued|Waiting|Activity)" (a split
   * compulsoryactivity stage — component checkAvailablestages, ts:2796-2821). Used by the read-only
   * dropdown assertions so an "offered"/"absent" check is correct for both kinds of stage. The CSS
   * attribute prefix-match `^="<name> ("` pins the typed buckets to exactly this stage (the trailing
   * " (" cannot collide with a longer stage name that merely starts with `name`).
   */
  private moveTargetAnyVariant(name: string): Locator {
    const exact = `${SEL.moveTarget}[data-stage-name="${this.cssEscape(name)}"]`;
    const typed = `${SEL.moveTarget}[data-stage-name^="${this.cssEscape(`${name} (`)}"]`;
    return this.page.locator(`${exact}, ${typed}`);
  }

  /** Human-readable StageRef for error messages. */
  private describeStage(stage: StageRef): string {
    if (typeof stage === 'string') return `stage "${stage}"`;
    if ('stageKey' in stage) return `stageKey "${stage.stageKey}"`;
    return `stage { name:"${stage.name}", type:${JSON.stringify(stage.type ?? null)} }`;
  }
}

// =============================================================================
// Module-local helpers (CSV / regex)
// =============================================================================

/** Read a Node Readable stream fully into a UTF-8 string (Playwright download stream). */
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Parse the board's exported CSV. Format produced by ConvertToCSV (component ts:3748-3757):
 *   • leading UTF-8 BOM ('﻿'),
 *   • CRLF ('\r\n') row terminator,
 *   • comma field separator,
 *   • first row = header list.
 * The component does its own quoting/escaping (ts:3759+), so this parser supports RFC-4180-style
 * double-quoted fields (embedded commas, quotes "" , and CRLF inside quotes) defensively.
 */
function parseCsv(text: string): ExportedCsv {
  const clean = text.replace(/^﻿/, '');
  const records = splitCsvRecords(clean);
  // Drop a trailing empty record (file usually ends with a CRLF).
  while (records.length && records[records.length - 1].length === 1 && records[records.length - 1][0] === '') {
    records.pop();
  }
  const headers = records.length ? records[0] : [];
  const rows = records.slice(1);
  return { headers, rows, rowCount: rows.length };
}

/** RFC-4180-ish record/field splitter (handles quoted fields with commas/newlines/escaped quotes). */
function splitCsvRecords(s: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') { if (s[i + 1] === '\n') i++; row.push(field); records.push(row); field = ''; row = []; continue; }
    if (c === '\n') { row.push(field); records.push(row); field = ''; row = []; continue; }
    field += c;
  }
  // flush last field/row if the file didn't end on a newline
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }
  return records;
}

/** Escape a string for use inside a RegExp literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
