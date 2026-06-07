// big-validate.page.ts — page object for the Validate Participant Assignments screen
// (route `validateParticipantAssignments`, component ValidateParticipantsAssignmentComponent,
//  selector `app-validate-participants-assignment`).
//
// Recon: e2e/queue/recon/big.md §BIG-04 (selectors, write-shapes §3d, role gate §4b) and
//   e2e/queue/recon/testids.md "BIG surface → validate-participants-assignment.component.html".
//   Every selector below is either a shipped `data-testid` (verified by grep against the served
//   worktree template src/app/big/validate-participants-assignment/…component.html) or, where no
//   testid was added, the most stable cited anchor (class / unique text). Selector priority used:
//   data-testid → id/formcontrolname → role+name → unique text/class. NO selector is invented.
//
// ANTI-CIRCULARITY (the whole point of the rebuild):
//   • The ONE reading method, movedCount(status), returns the number the COMPONENT rendered into the
//     per-column count span (`validate-col-count`, scoped by the column's `data-status`). That span is
//     bound to `getStatusCount(status)` = `filteredParticipantAssignmentsByStatus[status].length`
//     (component ts:538), which is recomputed from the LIVE `big participants assignments`
//     collectionData stream the component subscribes to (ts:500). It is a value the APP computed —
//     never a value the test wrote. A spec asserts it against a KNOWN-SEEDED number (rule half (b)).
//   • The action methods (select / accept / reject / rework) drive the REAL controls: a real checkbox
//     tick on a real participant card, then a real click on the real single-move menu item the app
//     renders. The status write is performed by the component's `moveSingleParticipant`
//     (updateDoc 'big participants assignments/{docid}', {status}, ts:683-687) — i.e. the PRODUCT
//     transitions the card; the test never writes the status itself (rule half (a)).
//   The intended usage is therefore: open() → read movedCount(target) as a baseline against the seed →
//   select(name) + accept()/reject()/rework() → expect.poll movedCount(target) to the seeded baseline
//   ± the number moved (the count the board RE-RENDERED), which is exactly the silent-data-gap invariant
//   in big.md §good_silent_gap_invariants ("validate single move: poll target column .column-count").
//
// ACCEPT / REJECT / REWORK semantics (big.md §BIG-04 "accept/reject/rework semantics"): the screen has
//   NO literal accept/reject button. The single-card `validate-review` button only opens a preview
//   dialog (Form/Video) or window.open()s to the ATC / Manual screens (component review(), ts:961-997)
//   — it does NOT itself perform a deterministic, in-DOM status write for the kanban. The deterministic,
//   driveable transition that writes `status` straight onto `big participants assignments` is the
//   single-move menu. So this object maps the verbs onto that move menu, matching the recon's mapping:
//     accept  → move the selected card to `completed`   (ts:683 moveSingleParticipant → status:'completed')
//     reject  → move the selected card to `rework`      (ts:683 → status:'rework')
//     rework  → move the selected card to `rework`      (alias of reject; the recon treats Reject and
//                                                         Rework as the same `rework` target)
//   Each verb is a real click on the real `validate-move-to[data-status=<target>]` item inside the
//   per-card single-move menu (`validate-single-move`). The menu's items are filteredStatus(current) =
//   every status EXCEPT the card's current one (ts:547), so the target item is always present unless the
//   card already sits in that status (guarded below).
//
// ROLE GATE (⚠ load-bearing — see RISKS): ngOnInit requires `roles['mentor']` truthy, else it
//   `alert('You have no access to the screen')` and `navigateByUrl('/')` (ts:184-193). The kanban
//   (`*ngIf="selectedAssignment && !loadingParticipants"`, html:206) therefore NEVER mounts for an
//   actor lacking the `mentor` role flag. open() logs in via support/auth.ts `loginAsBigAdmin` (the
//   BIG-surface owner) by default and accepts an `email` override so a spec can point at a
//   mentor-flagged actor; if the actor is bounced, open() surfaces it as a clear timeout on the host
//   wait rather than proceeding against an unmounted board (the same philosophy as auth.ts).
//
// Reuse: this object owns ONLY Validate selectors + the move/select interactions and the one rendered
//   count read. Firestore-side anti-circular checks (e.g. polling `big participants assignments.status`
//   the CF/board re-rendered, or comparing to a seeded baseline) belong in the spec via
//   e2e/queue/support/firestore-admin.ts / e2e/lib/assertions.ts — not here. It re-uses the real login
//   form exclusively through support/auth.ts (it does NOT re-implement login).

import { Page, Locator, expect } from '@playwright/test';
import { loginAsBigAdmin, LoginOpts } from '../support/auth';

/** Route the standalone ValidateParticipantsAssignmentComponent is mounted at (app.routes.ts:237). */
export const VALIDATE_ROUTE = '/validateParticipantAssignments';

/** The five kanban statuses, in the component's order (`statusList`, ts:152 / html:208). */
export const VALIDATE_STATUSES = ['initiated', 'ongoing', 'review', 'rework', 'completed'] as const;
export type ValidateStatus = (typeof VALIDATE_STATUSES)[number];

/** Default poll budget for stream-driven reads (mirrors the playwright.queue.config expect timeout). */
const POLL: { timeout: number; intervals: number[] } = { timeout: 20_000, intervals: [250, 500, 1000] };

/**
 * Shipped selectors (testids.md §BIG validate-participants-assignment). For elements rendered in an
 * *ngFor the testid VALUE is static and a companion `[attr.data-*]` carries the per-instance id, so we
 * locate one instance with `[data-testid="X"][data-…="<id>"]` (testids.md conventions).
 */
const SEL = {
  marathonSelect: '[data-testid="validate-marathon-select"]',     // <select> (html:24)
  assignmentItem: '[data-testid="validate-assignment-item"]',     // .assignment-item *ngFor; data-assignment-id (html:94)
  column: '[data-testid="validate-col"]',                         // .kanban-column *ngFor; data-status (html:210)
  columnCount: '[data-testid="validate-col-count"]',              // .column-count → getStatusCount(status) (html:218)
  bulkMove: '[data-testid="validate-bulk-move"]',                 // .move-all-btn (opens bulk menu) (html:241)
  singleMove: '[data-testid="validate-single-move"]',             // .action-btn-sm.move (opens single menu) (html:295)
  // SHARED testid on both the bulk- and single-move menu items; only the OPEN mat-menu has items in the
  // DOM (testids.md note). data-status carries the TARGET status `s`. (html:250 bulk / html:302 single)
  moveTo: '[data-testid="validate-move-to"]',
  review: '[data-testid="validate-review"]',                      // .action-btn-sm.review (status==='review') (html:286)
  // No testid on the card / name / checkbox — stable class anchors cited in big.md §BIG-04 (html:256-272).
  participantCard: '.participant-card',
  participantName: '.participant-name',
  participantCheckbox: '.participant-checkbox',
} as const;

/** Options for {@link BigValidatePage.open}. */
export interface ValidateOpenOpts extends LoginOpts {
  /** Skip login (caller already authenticated); only navigate + wait for mount. */
  skipLogin?: boolean;
  /** Which seeded BIG admin to log in as (0-based; seeder creates big0..big3). Default 0. */
  adminIndex?: number;
  /**
   * Marathon to select after mount. Either the marathon DOC id (preferred — matches the <option>'s
   * [ngValue]="marathon.id") or its visible title (label match). When omitted, the first non-disabled
   * marathon is selected (so the assignment list + kanban can populate).
   */
  marathonId?: string;
  marathonTitle?: string;
  /**
   * Assignment to open after the marathon is chosen. Either the assignment id (matches the card's
   * data-assignment-id) or its visible title. When omitted, the first assignment in the list is opened.
   * The kanban only renders once an assignment is selected (`*ngIf="selectedAssignment"`, html:206).
   */
  assignmentId?: string;
  assignmentTitle?: string;
  /** Max time to wait for the route + component to mount. Default 30000ms. */
  timeoutMs?: number;
}

export class BigValidatePage {
  readonly page: Page;

  /** Component host — scope card/column locators here so a stray element elsewhere can never match. */
  readonly host: Locator;
  /** Marathon <select> (html:24). */
  readonly marathonSelect: Locator;
  /** All assignment list items (html:94). */
  readonly assignmentItems: Locator;
  /** All kanban columns (html:210). */
  readonly columns: Locator;

  constructor(page: Page) {
    this.page = page;
    const host = page.locator('app-validate-participants-assignment');
    this.host = host;
    this.marathonSelect = host.locator(SEL.marathonSelect);
    this.assignmentItems = host.locator(SEL.assignmentItem);
    this.columns = host.locator(SEL.column);
  }

  // --------------------------------------------------------------------------------------------
  // open — navigate, pass the mentor gate, select a marathon + assignment so the kanban mounts.
  // --------------------------------------------------------------------------------------------

  /**
   * Log in (unless `skipLogin`), navigate to `validateParticipantAssignments`, pass the `mentor` role
   * gate, then select a marathon and open an assignment so the kanban board (and its count spans /
   * participant cards) renders. The board is `collectionData`-backed, so we wait for the host then for
   * at least one column to appear.
   *
   * ⚠ If the logged-in actor lacks `roles['mentor']`, ngOnInit redirects to `/` (ts:184-193): the host
   * wait below then times out with a message pointing at the role gap (RISKS). Pass `{ email }` (a
   * mentor-flagged actor) or `{ skipLogin:true }` after authenticating as one.
   */
  async open(opts: ValidateOpenOpts = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    if (!opts.skipLogin) {
      // loginAsBigAdmin uses the REAL login form (auth.ts) and lands on /big-dashboard; we then push to
      // the Validate route. The `email` override lets a spec log in as a mentor-flagged actor.
      await loginAsBigAdmin(this.page, opts.adminIndex ?? 0, { timeoutMs: timeout, email: opts.email });
    }
    await this.page.goto(VALIDATE_ROUTE, { waitUntil: 'domcontentloaded' });
    await this.page.waitForURL((u) => u.pathname.includes(VALIDATE_ROUTE.replace(/^\//, '')), { timeout });

    // The mentor gate either lets the component render or bounces to '/'. Wait for the host; a bounce
    // surfaces here as a clear timeout naming the gate, instead of silently proceeding.
    await expect(
      this.host,
      'Validate component did not mount — the actor likely lacks the `mentor` role flag, so ngOnInit ' +
        'redirected to `/` (big.md §4b). Log in as a mentor-flagged actor via open({ email }).',
    ).toBeVisible({ timeout });

    await this.selectMarathon(opts.marathonId, opts.marathonTitle, timeout);
    await this.selectAssignment(opts.assignmentId, opts.assignmentTitle, timeout);

    // Kanban renders only after an assignment is selected (`*ngIf="selectedAssignment"`, html:206).
    await expect(this.columns.first(), 'kanban columns did not render after selecting an assignment').toBeVisible({
      timeout,
    });
  }

  /** Select a marathon by docid (option [ngValue]=marathon.id) or title, else the first enabled option. */
  private async selectMarathon(marathonId: string | undefined, marathonTitle: string | undefined, timeout: number): Promise<void> {
    await expect(this.marathonSelect).toBeVisible({ timeout });
    if (marathonId !== undefined) {
      // The marathon list is stream-driven (loadMarathons getDocs, ts:231-242): wait until the option
      // for this id has actually rendered before we try to select it.
      //
      // ⚠ The <select> is bound with `[ngValue]="marathon.id"`. Angular's SelectControlValueAccessor
      // serialises EVERY ngValue with a registration-index prefix — the option's DOM `value` is
      // `"<index>: <marathon.id>"` (forms.mjs `_buildValueString`), NOT the raw id. So
      // `selectOption(marathonId)` would match NOTHING and — because the queue emulator config sets no
      // actionTimeout — Playwright's selectOption would RETRY UNTIL THE 120s TEST TIMEOUT (the real
      // cause of the BIG-07 "Target page closed" failures). We therefore NEVER call selectOption with
      // the raw id; we resolve the option's real DOM `value` first (bounded count/getAttribute calls)
      // and select by THAT value (or fall back to label/index), so a missing option fails fast.
      const byId = this.marathonSelect.locator(`option[value$=": ${cssAttrValue(marathonId)}"]`).first();
      const byIdContains = this.marathonSelect.locator(`option[value*="${cssAttrValue(marathonId)}"]`).first();
      let resolvedValue: string | null = null;
      await expect
        .poll(
          async () => {
            // Prefer the exact `"<idx>: <id>"` suffix match; fall back to a contains-match (covers any
            // Angular encoding variant). Read the real `value` attribute and select by it.
            for (const opt of [byId, byIdContains]) {
              if ((await opt.count()) > 0) {
                const v = await opt.getAttribute('value');
                if (v) {
                  resolvedValue = v;
                  return true;
                }
              }
            }
            return false;
          },
          {
            timeout,
            message:
              `validate marathon option for id "${marathonId}" never rendered (is the marathon seeded? ` +
              `the <select> uses [ngValue], so its option value is "<index>: ${marathonId}").`,
          },
        )
        .toBe(true);
      await this.marathonSelect.selectOption(resolvedValue!);
      return;
    }
    if (marathonTitle !== undefined) {
      // Resolve the matching option's value by its visible text BEFORE selecting, so a non-matching
      // label fails fast (selectOption({ label }) would otherwise retry to the test timeout — see above).
      const opt = this.marathonSelect.locator('option', { hasText: marathonTitle }).first();
      await expect(
        opt,
        `validate marathon option with title "${marathonTitle}" never rendered`,
      ).toBeAttached({ timeout });
      const value = await opt.getAttribute('value');
      if (value) {
        await this.marathonSelect.selectOption(value);
        return;
      }
      await this.marathonSelect.selectOption({ label: marathonTitle });
      return;
    }
    // Default: pick the first NON-disabled, non-null option (skip the "Select Marathon" placeholder).
    const options = this.marathonSelect.locator('option:not([disabled])');
    await expect(options.first()).toBeAttached({ timeout });
    await this.marathonSelect.selectOption({ index: await this.firstSelectableOptionIndex() });
  }

  /** Index of the first real marathon option (skips the disabled placeholder at index 0). */
  private async firstSelectableOptionIndex(): Promise<number> {
    const all = this.marathonSelect.locator('option');
    const count = await all.count();
    for (let i = 0; i < count; i++) {
      const disabled = await all.nth(i).getAttribute('disabled');
      const value = (await all.nth(i).getAttribute('value')) ?? '';
      // The placeholder is [ngValue]="null" + disabled; a real marathon has a truthy value and no disabled.
      if (disabled === null && value !== '' && value !== 'null') return i;
    }
    return 1; // sensible fallback past the placeholder
  }

  /** Open an assignment by id (data-assignment-id) or title, else the first item in the list. */
  private async selectAssignment(assignmentId: string | undefined, assignmentTitle: string | undefined, timeout: number): Promise<void> {
    // The list renders after a marathon is chosen + assignments load (`*ngIf` html:89).
    await expect(this.assignmentItems.first(), 'assignment list never populated for the selected marathon').toBeVisible({
      timeout,
    });
    let item: Locator;
    if (assignmentId !== undefined) {
      item = this.host.locator(`${SEL.assignmentItem}[data-assignment-id="${assignmentId}"]`).first();
    } else if (assignmentTitle !== undefined) {
      item = this.assignmentItems.filter({ hasText: assignmentTitle }).first();
    } else {
      item = this.assignmentItems.first();
    }
    await expect(item).toBeVisible({ timeout });
    await item.click();
  }

  // --------------------------------------------------------------------------------------------
  // select — tick a participant card's checkbox by the participant's rendered name.
  // --------------------------------------------------------------------------------------------

  /**
   * Select (tick) the participant whose rendered name matches `sel`, by clicking the REAL checkbox on
   * that participant's card. `sel` matches the card's `.participant-name` text
   * (`mapProfile[p.profileid]?.name`, html:272). The selection is what the move/accept/reject/rework
   * actions then operate on (the component tracks it in `selectedParticipantAssignments`, ts:648).
   *
   * Cards have no data-testid (none was added for the per-card row — see RISKS); `.participant-card`
   * scoped by its `.participant-name` is the most stable cited anchor (big.md §BIG-04, html:256-272).
   * Returns the status (kanban column) the matched card currently sits in, so the caller (and the
   * accept/reject/rework verbs) know the source column without re-querying.
   *
   * @param sel the participant's visible name (exact-ish: Playwright hasText is a substring match; pass
   *            a unique fragment). Throws via the visibility wait if no such card is rendered.
   */
  async select(sel: string): Promise<ValidateStatus> {
    const { card, status } = await this.findParticipantCard(sel);
    const checkbox = card.locator(SEL.participantCheckbox);
    // mat-checkbox renders an inner <input type=checkbox>; click the label/host to toggle reliably.
    await expect(checkbox).toBeVisible();
    const input = checkbox.locator('input[type="checkbox"]');
    const alreadyChecked = await input.isChecked().catch(() => false);
    if (!alreadyChecked) {
      // Click the mat-checkbox host (its label area) — clicking the visually-hidden input directly can
      // miss; the host forwards the toggle to `onSelectParticipantAssignment` (html:263).
      await checkbox.click();
    }
    await expect(input, `participant "${sel}" checkbox did not become checked`).toBeChecked();
    return status;
  }

  // --------------------------------------------------------------------------------------------
  // accept / reject / rework — REAL single-move clicks that write `status` via the app.
  // --------------------------------------------------------------------------------------------

  /**
   * ACCEPT the most-recently-selected participant → move their card to `completed` (big.md §BIG-04:
   * "Accept" = move to completed). Drives the card's REAL single-move menu
   * (`validate-single-move` → `validate-move-to[data-status="completed"]`); the component's
   * `moveSingleParticipant` then writes `{status:'completed'}` to `big participants assignments`
   * (ts:683-687, write-shape §3d). Pass `name` to target a specific participant; otherwise the single
   * selected card is used.
   */
  async accept(name?: string): Promise<void> {
    await this.moveSelectedTo('completed', name);
  }

  /**
   * REJECT the selected participant → move their card to `rework` (big.md §BIG-04: "Reject/Rework" =
   * move to rework). Real single-move click → `moveSingleParticipant` writes `{status:'rework'}`.
   */
  async reject(name?: string): Promise<void> {
    await this.moveSelectedTo('rework', name);
  }

  /**
   * REWORK the selected participant → move their card to `rework`. Alias of {@link reject}: the recon
   * maps both Reject and Rework onto the `rework` target (there is no distinct "rework-only" write on
   * this screen). Kept as a separate verb because specs read more clearly with it.
   */
  async rework(name?: string): Promise<void> {
    await this.moveSelectedTo('rework', name);
  }

  /**
   * Generic single-card move: locate the card (by `name`, or the single currently-selected card),
   * open its single-move menu, and click the target-status item. This is the REAL interaction path the
   * accept/reject/rework verbs share. No-op-with-throw if the card already sits in `target` (the move
   * menu only offers OTHER statuses — filteredStatus(current), ts:547 — so the item would be absent).
   */
  async moveSelectedTo(target: ValidateStatus, name?: string): Promise<void> {
    const { card, status } = name !== undefined ? await this.findParticipantCard(name) : await this.findSelectedCard();
    if (status === target) {
      throw new Error(
        `cannot move participant to "${target}": the card is already in that column, so the single-move ` +
          `menu (filteredStatus excludes the current status, component ts:547) offers no "${target}" item.`,
      );
    }
    // Open this card's single-move menu (the trigger lives in the card's .participant-actions).
    const trigger = card.locator(SEL.singleMove);
    await expect(trigger, 'single-move trigger not found on the participant card').toBeVisible();
    await trigger.click();

    // mat-menu items render in the CDK overlay at the PAGE root (NOT inside the host). Only the OPEN
    // menu has items in the DOM (testids.md note), so scope to the overlay container.
    const item = this.openMoveMenuItem(target);
    await expect(item, `single-move menu item for target "${target}" did not appear`).toBeVisible();
    await item.click();
    // Let the menu overlay close so a subsequent move doesn't click a stale item.
    await this.waitForMoveMenuClosed();
  }

  /**
   * BULK move: tick a set of participants (already selected via {@link select}) and move all selected
   * in `fromStatus` to `target` via the column's REAL bulk-move menu (`validate-bulk-move` →
   * `validate-move-to[data-status=target]`). The component's `moveParticipant` writes `{status:target}`
   * for every selected docid in a batch (ts:658-681, write-shape §3d). The bulk trigger is disabled
   * until ≥1 card in `fromStatus` is selected (html:240).
   */
  async bulkMove(fromStatus: ValidateStatus, target: ValidateStatus): Promise<void> {
    if (fromStatus === target) {
      throw new Error(`bulkMove: fromStatus and target are both "${target}" — the menu offers no such item (ts:547).`);
    }
    const column = this.column(fromStatus);
    const trigger = column.locator(SEL.bulkMove);
    await expect(trigger, `bulk-move trigger not enabled in column "${fromStatus}" (select ≥1 card first)`).toBeEnabled();
    await trigger.click();
    const item = this.openMoveMenuItem(target);
    await expect(item, `bulk-move menu item for target "${target}" did not appear`).toBeVisible();
    await item.click();
    await this.waitForMoveMenuClosed();
  }

  // --------------------------------------------------------------------------------------------
  // movedCount — APP-computed per-column count (stream-driven → expect.poll). Reading method.
  // --------------------------------------------------------------------------------------------

  /**
   * The number of participant cards the BOARD rendered in `status`'s column — i.e. the value the
   * component put in that column's count span (`validate-col-count`, html:218), bound to
   * `getStatusCount(status)` = `filteredParticipantAssignmentsByStatus[status].length` (ts:538). This
   * is recomputed from the live `big participants assignments` stream (ts:500), so it is a value the
   * APP computed, never one the test wrote — it is the assertable target after a move (poll it to the
   * seeded baseline ± moved). Polls because the stream is async (per SHARED CONVENTIONS).
   *
   * @param status the kanban column. With no arg, returns the count of the `completed` column (the
   *   natural "moved/accepted" total) — pass an explicit status to read any other column.
   */
  async movedCount(status: ValidateStatus = 'completed'): Promise<number> {
    const countEl = this.column(status).locator(SEL.columnCount).first();
    let value = NaN;
    await expect
      .poll(
        async () => {
          if ((await countEl.count()) === 0) return null;
          const raw = (await countEl.first().innerText()).trim();
          const n = Number(raw.replace(/[^\d.-]/g, ''));
          if (raw.length === 0 || !Number.isFinite(n)) return null;
          value = n;
          return n;
        },
        {
          ...POLL,
          message: `movedCount("${status}"): the column count span never rendered a finite number (is the kanban mounted and the big participants assignments stream loaded?)`,
        },
      )
      .not.toBeNull();
    return value;
  }

  // --------------------------------------------------------------------------------------------
  // Locator helpers
  // --------------------------------------------------------------------------------------------

  /** One kanban column by its status (`data-status` companion attr on `validate-col`). */
  column(status: ValidateStatus): Locator {
    return this.host.locator(`${SEL.column}[data-status="${status}"]`).first();
  }

  /** Review button for a participant card (only present when the card is in the `review` column, html:286). */
  reviewButton(name: string): Locator {
    return this.host
      .locator(SEL.participantCard)
      .filter({ has: this.page.locator(`${SEL.participantName}:has-text("${escapeText(name)}")`) })
      .first()
      .locator(SEL.review);
  }

  // --------------------------------------------------------------------------------------------
  // internals
  // --------------------------------------------------------------------------------------------

  /**
   * Find the participant card whose `.participant-name` contains `name`, and the status of the column
   * it sits in. Searches every column so the caller need not know where the participant currently is.
   */
  private async findParticipantCard(name: string): Promise<{ card: Locator; status: ValidateStatus }> {
    for (const status of VALIDATE_STATUSES) {
      const card = this.column(status)
        .locator(SEL.participantCard)
        .filter({ has: this.page.locator(`${SEL.participantName}:has-text("${escapeText(name)}")`) })
        .first();
      if ((await card.count()) > 0 && (await card.isVisible().catch(() => false))) {
        return { card, status };
      }
    }
    // Not found in any column — produce a descriptive failure via an assertion on the host-wide locator.
    const anywhere = this.host
      .locator(SEL.participantCard)
      .filter({ has: this.page.locator(`${SEL.participantName}:has-text("${escapeText(name)}")`) })
      .first();
    await expect(anywhere, `no participant card with name containing "${name}" is rendered in any column`).toBeVisible({
      timeout: POLL.timeout,
    });
    // If the assertion somehow passes (race), recurse once.
    return this.findParticipantCard(name);
  }

  /** Find the single currently-selected participant card (exactly one expected). */
  private async findSelectedCard(): Promise<{ card: Locator; status: ValidateStatus }> {
    for (const status of VALIDATE_STATUSES) {
      const selected = this.column(status).locator(`${SEL.participantCard}.selected`);
      const n = await selected.count();
      if (n >= 1) {
        if (n > 1) {
          throw new Error(
            `findSelectedCard: ${n} cards selected in "${status}" — accept/reject/rework operate on ONE card. ` +
              `Pass an explicit participant name, or use bulkMove() for multi-select.`,
          );
        }
        return { card: selected.first(), status };
      }
    }
    throw new Error('no participant card is selected — call select(name) before accept/reject/rework, or pass a name.');
  }

  /**
   * The OPEN move menu's target item for `target` status. Move-menu items render in the CDK overlay at
   * the page root (a mat-menu portal), carry the SHARED testid `validate-move-to`, and expose the
   * target status on `data-status`. Only the currently-open menu has items in the DOM (testids.md), so
   * a page-root scope is correct and unambiguous.
   */
  private openMoveMenuItem(target: ValidateStatus): Locator {
    const overlay = this.page.locator('.cdk-overlay-container');
    return overlay.locator(`${SEL.moveTo}[data-status="${target}"]`).first();
  }

  /** Wait until no move-menu items remain in the overlay (the menu closed after a click). */
  private async waitForMoveMenuClosed(): Promise<void> {
    const items = this.page.locator(`.cdk-overlay-container ${SEL.moveTo}`);
    await expect
      .poll(async () => items.count(), {
        ...POLL,
        message: 'move menu overlay did not close after selecting a target status',
      })
      .toBe(0);
  }
}

/** Escape double-quotes for use inside a Playwright :has-text("…") string. */
function escapeText(s: string): string {
  return s.replace(/"/g, '\\"');
}

/** Escape a value for use inside a double-quoted CSS attribute selector (e.g. `[value$="…"]`). */
function cssAttrValue(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
