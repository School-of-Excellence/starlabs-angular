// queue-creation.page.ts — page object for the queue-creation-v3 authoring stepper.
//
// Surface: QueueCreationV3Component (selector `app-queue-creation-v3`),
//   src/app/queue system/queue-creation-v3/queue-creation-v3.component.{ts,html}.
//
// IMPORTANT — this stepper is a DIALOG, not a route. There is NO route for queue-creation-v3
//   (grep of app.routes.ts confirms zero references; the only opener is queue-list). It is opened
//   by QueueListComponent.createQueue(null) → `this.dialog.open(QueueCreationV3Component, {...})`
//   (queue-list.component.ts:110-125, height/width 100vw, disableClose:true), triggered by the
//   "Create Queue" button `button.queuebtn` (queue-list.component.html:11). So `openStepper`
//   navigates to /queuelist (authGuard — caller must already be logged in as the operator/admin via
//   support/auth.ts `loginAsOperator`), clicks Create Queue, and waits for the dialog stepper to mount.
//
// SELECTORS — there are ZERO `data-testid` attributes on `src/app/queue system/**` except the
//   operator board + its dialogs (testids.md confirms; the recon NEEDS-TESTID list does NOT cover
//   this authoring stepper at all). So every selector here uses the next-most-stable anchor per
//   SHARED CONVENTIONS (testid → id/formcontrolname → role+name → unique text), verified against the
//   real template `queue-creation-v3.component.html` (read at write time). Anchors used:
//     - dialog host / stepper : `mat-horizontal-stepper` inside `app-queue-creation-v3` (html:15)
//     - page title            : `h2.page-title` text "Queue Creation"                  (html:12)
//     - Queue Name            : `input[formcontrolname="queuename"]`                   (html:30)
//     - Queue Mentor select   : `mat-select[formcontrolname="queuementor"]` (multiple) (html:36)
//     - Queue Admin select    : `mat-select[formcontrolname="queueadmin"]`  (multiple) (html:53)
//     - Start / End date input: `input[formcontrolname="queuestartdate"|"queueenddate"]` (html:85-86)
//     - Venue select          : `mat-select[formcontrolname="venue"]`                  (html:100)
//     - Stages chip-grid input: input[matChipInputFor] inside `mat-chip-grid[formcontrolname="stages"]`
//                               on STEP 2 "Product Mapping"                            (html:286-311)
//     - step "Proceed" button : `button` text "Proceed to Product Mapping" (step 1)    (html:232)
//                               / "Next Step" (step 2)                                 (html:321)
//     - final Submit button   : `button` text "Submit" (step 5 "Completed" footer)     (html:884)
//   mat-select options + the date-range picker render into the global CDK overlay (outside the
//   dialog host), so option/calendar locators are page-rooted, not host-scoped.
//
// FORM / STEP MODEL (from the component TS + HTML):
//   The stepper has 5 steps. Step 0 "Queue Details" holds queuename / queuementor / queueadmin /
//   start+end dates / venue (all Validators.required; ctor ts:123-149). Step 1 "Product Mapping"
//   holds the `stages` mat-chip-grid (html:284-315) — so `addOneStage` operates on step 1. Advancing
//   off step 0 runs `proceedToNextstage()` which validates the whole Queue-Details block (ts:1168-1184),
//   so setQueueName/Admin/Mentor/Dates/Venue must all be set before `addOneStage` can reach step 1.
//
// SAVE / savedQueueId (anti-circularity):
//   `onsubmit()` generates the doc id CLIENT-SIDE (`metadata["docid"] = doc(collection(... 'queue
//   generation')).id`, ts:907), writes `queue generation/{docid}` via a writeBatch, then closes the
//   dialog with NO return value (ts:1102 `this.dialogRef.close()`). The id is therefore NOT in the
//   DOM and NOT returned to the opener. `savedQueueId()` reads the APP's OUTPUT — the `queue
//   generation` doc the component's batch wrote — via the read-only Admin handle
//   (support/firestore-admin.ts), keyed by the queue NAME the test set as a precondition. The
//   returned docid is a value the APP computed (app-generated id), NOT a value the test wrote, so
//   this does not violate the anti-circularity rule (we never assert read==written; we read an
//   app-produced id keyed by a known-seeded name). Target project/emulator is resolved by
//   firestore-admin (allowlist-pinned) — no project id is hardcoded here.

import { Page, Locator, expect } from '@playwright/test';
import { queryWhere, pollUntil, DocResult } from '../support/firestore-admin';

/** Route of the admin queue-list screen — the only entry point that opens this dialog. */
export const QUEUE_LIST_ROUTE = '/queuelist';

/** Stable anchors for the authoring stepper (single source of truth for this surface). */
const SEL = {
  host: 'app-queue-creation-v3',                       // dialog component host
  stepper: 'mat-horizontal-stepper',                   // the stepper itself (html:15)
  pageTitle: 'h2.page-title',                          // "Queue Creation" (html:12)
  // Step 0 "Queue Details" fields (formcontrolname is the stable hook — no testids here).
  queueName: 'input[formcontrolname="queuename"]',     // html:30
  queueMentor: 'mat-select[formcontrolname="queuementor"]', // html:36 (multiple)
  queueAdmin: 'mat-select[formcontrolname="queueadmin"]',   // html:53 (multiple)
  startDate: 'input[formcontrolname="queuestartdate"]',     // html:85
  endDate: 'input[formcontrolname="queueenddate"]',         // html:86
  venue: 'mat-select[formcontrolname="venue"]',             // html:100
  // Step 1 "Product Mapping" → the Queue Stages chip grid + its input (html:286-311).
  stagesChipGrid: 'mat-chip-grid[formcontrolname="stages"]',
  // The "Create Queue" trigger on the queue-list screen (queue-list.component.html:11).
  createQueueBtn: 'button.queuebtn',
  // --- The REMAINING step-0 required fields (all on the "Queue Details" step). The step-0
  //     advance gate (`proceedToNextstage()`, ts:1168-1179) AND the final submit guard
  //     (`onsubmit` requires `queueform.valid`, ts:846) demand ALL of these — not just
  //     name/admin/mentor/dates/venue — so a smoke save is impossible without them. Each is a
  //     plain matInput/textarea keyed by its formcontrolname (verified against html:127-227).
  description: 'textarea[formcontrolname="description"]',                 // html:129
  introdescription: 'textarea[formcontrolname="introdescription"]',       // html:138
  queueTargetCapacity: 'input[formcontrolname="queuetargetcapacity"]',    // html:167
  totalCapacity: 'input[formcontrolname="totalcapacity"]',                // html:173
  queueWelcomeTemplate: 'input[formcontrolname="queuewelcometemplate"]',  // html:181
  lastRegistrationDate: 'input[formcontrolname="lastregistrationdate"]',  // html:187 ([matDatepicker])
  queueWelcomeTitle: 'textarea[formcontrolname="queuewelcometitle"]',     // html:200
  queueWelcomeDescription: 'textarea[formcontrolname="queuewelcomedescription"]', // html:208
  queuedMessage: 'textarea[formcontrolname="queuedmessage"]',             // html:216
  waitingMessage: 'textarea[formcontrolname="waitingmessage"]',           // html:224
} as const;

/** Default poll budget for stream/CF-output reads (mirrors playwright.queue.config expect timeout). */
const POLL = { timeout: 20_000, intervals: [250, 500, 1000] } as const;

/**
 * A parseable near-future date string in MM/DD/YYYY (the format `setDates`' doc cites as accepted by
 * the default MatNativeDateAdapter). Used as the smoke default for `lastregistrationdate`. There is
 * no cross-field date validator on this form (only `Validators.required`), so any parseable date
 * satisfies the control — we just need a deterministic, non-null value.
 */
function defaultLastRegistrationDate(): string {
  const d = new Date(Date.now() + 14 * 86400e3);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export class QueueCreationPage {
  readonly page: Page;
  /** The dialog component host (`app-queue-creation-v3`) — scope all in-dialog locators to it. */
  readonly host: Locator;
  /** The horizontal stepper inside the dialog. */
  readonly stepper: Locator;

  /** The queue name the test filled, captured so `savedQueueId()` can key the read on it. */
  private filledQueueName: string | null = null;

  constructor(page: Page) {
    this.page = page;
    this.host = page.locator(SEL.host);
    this.stepper = this.host.locator(SEL.stepper);
  }

  // ---------------------------------------------------------------------------
  // openStepper — open the dialog via the REAL queue-list "Create Queue" button
  // ---------------------------------------------------------------------------

  /**
   * Navigate to /queuelist (authGuard — caller logs in first via support/auth.ts `loginAsOperator`),
   * click the real "Create Queue" button, and wait until the authoring stepper dialog has mounted.
   * Drives the actual product entry point (a real click on `button.queuebtn`), not a synthetic nav —
   * there is no route to deep-link to (the component is dialog-only).
   */
  async openStepper(opts: { timeoutMs?: number } = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    await this.page.goto(QUEUE_LIST_ROUTE, { waitUntil: 'domcontentloaded' });
    // Confirm the guard admitted us (didn't bounce to /login) and the list mounted.
    await this.page.waitForURL((u) => u.pathname.includes('queuelist'), { timeout });
    const createBtn = this.page.locator('app-queue-list').locator(SEL.createQueueBtn);
    await expect(createBtn).toBeVisible({ timeout });
    await createBtn.click();
    // The dialog renders to the CDK overlay; the stepper + title confirm it (and that data finished
    // loading — the component shows a spinner while `loading` is true, hiding the .mainscreen).
    await expect(this.host.locator(SEL.pageTitle)).toBeVisible({ timeout });
    await expect(this.stepper).toBeVisible({ timeout });
  }

  // ---------------------------------------------------------------------------
  // Step 0 "Queue Details" — action methods (real fills / real clicks)
  // ---------------------------------------------------------------------------

  /**
   * Fill the Queue Name (`input[formcontrolname="queuename"]`, html:30). Captures the value so
   * `savedQueueId()` can later locate the written `queue generation` doc by name.
   */
  async fillQueueName(name: string): Promise<void> {
    const input = this.host.locator(SEL.queueName);
    await expect(input).toBeVisible({ timeout: 15_000 });
    // Do NOT click() the input: the Material outline's `.mat-mdc-form-field-required-marker` (the "*"
    // floating-label span) overlays the field and intercepts the pointer event, so a real click hangs
    // (observed: 120s timeout on "subtree intercepts pointer events"). `fill()` focuses the element
    // programmatically (no hit-test) and sets the value — exactly what we need. `focus()` first makes
    // the floating label settle so the value commits cleanly.
    await input.focus();
    await input.fill(name);
    // `updateOn:'change'` (ctor ts:124) commits on input; blur to flush before validation/advance.
    await input.blur();
    this.filledQueueName = name;
  }

  /**
   * Set the Queue Admin multi-select to the given profile ids (`mat-select[formcontrolname=
   * "queueadmin"]`, html:53). The options are `<mat-option [value]="profile.id">{{profile.name}}` over
   * `returnprofile()` (html:61-63); `profile.id` is the profile_ref doc id (ts:485-488). We pick by the
   * stable option VALUE, not its display text, so callers pass seeded profile ids. The first mat-option
   * in this select is the ngx-mat-select-search box (html:54-60) — never an actual choice — so option
   * matching skips it by requiring a non-empty value. Drives the real overlay (open → click options).
   */
  async setQueueAdmin(ids: string[]): Promise<void> {
    await this.selectMultiByValue(this.host.locator(SEL.queueAdmin), ids, 'queueadmin');
  }

  /**
   * Set the Queue Mentor multi-select (`mat-select[formcontrolname="queuementor"]`, html:36). Mentor
   * is also `Validators.required` and is gated by step-0's `proceedToNextstage()` (ts:1169-1170), so a
   * caller that only wants to reach the stages step must set it too. Same option-value semantics as
   * `setQueueAdmin`. Exposed because advancing the stepper is impossible without a valid mentor.
   */
  async setQueueMentor(ids: string[]): Promise<void> {
    await this.selectMultiByValue(this.host.locator(SEL.queueMentor), ids, 'queuementor');
  }

  /**
   * Set the Venue single-select (`mat-select[formcontrolname="venue"]`, html:100). Options are
   * `<mat-option [value]="list.location">{{list.location}}` over `venueList` (html:101-103) — value ==
   * the visible location string — so callers pass the seeded location text. Required + step-0-gated
   * (ts:1171), so it must be set before advancing to the stages step.
   */
  async setVenue(location: string): Promise<void> {
    const select = this.host.locator(SEL.venue);
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.click();
    const option = this.overlayOption().filter({ hasText: location }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    await this.closeOverlay();
  }

  /**
   * Set the Queue Start & End dates on the mat-date-range-input (`queuestartdate` / `queueenddate`
   * text inputs, html:85-86). These are plain matInput text fields inside `mat-date-range-input`, so we
   * type the date strings directly (the MatNativeDateAdapter parses them) rather than driving the
   * calendar popup — typing is the stable path and avoids the CDK calendar overlay. Pass strings the
   * locale date adapter accepts (e.g. "6/20/2026" / "MM/DD/YYYY"); the component re-floors the times in
   * `onsubmit` (ts:856-859) so only the date part matters.
   * @param start start-date string
   * @param end   end-date string
   */
  async setDates(start: string, end: string): Promise<void> {
    const startInput = this.host.locator(SEL.startDate);
    const endInput = this.host.locator(SEL.endDate);
    await expect(startInput).toBeVisible({ timeout: 15_000 });
    // focus() (not click()) — the Material outline's required-marker/notched-outline overlays the input
    // and intercepts pointer events (a click hangs). focus()+fill() sets the value without a hit-test.
    await startInput.focus();
    await startInput.fill(start);
    await startInput.blur();
    await endInput.focus();
    await endInput.fill(end);
    await endInput.blur();
  }

  /**
   * Fill the REMAINING step-0 "Queue Details" required fields (everything beyond name/admin/
   * mentor/dates/venue). Both the step-0 advance gate (`proceedToNextstage()`, ts:1168-1179) and
   * the submit guard (`onsubmit` needs `queueform.valid`, ts:846) require ALL of these, so a
   * caller that wants to advance off step 0 / save MUST call this. Plain matInput/textarea fills
   * keyed by formcontrolname (the stable hook — no testids on this surface). `lastregistrationdate`
   * is a single `[matDatepicker]` text input; we type the date string (the MatNativeDateAdapter
   * parses it) rather than driving the calendar popup, mirroring `setDates`. Capacities are
   * `type="number"` inputs (html:167/173) — pass numeric strings.
   *
   * @param d field values (all optional; sensible smoke defaults applied per missing field).
   */
  async fillRequiredDetails(
    d: {
      description?: string;
      introDescription?: string;
      queueTargetCapacity?: string;
      totalCapacity?: string;
      welcomeTemplate?: string;
      lastRegistrationDate?: string;
      welcomeTitle?: string;
      welcomeDescription?: string;
      queuedMessage?: string;
      waitingMessage?: string;
    } = {},
  ): Promise<void> {
    const fillText = async (selector: string, value: string) => {
      const el = this.host.locator(selector);
      await expect(el).toBeVisible({ timeout: 15_000 });
      // focus() (not click()) — the Material form-field outline/required-marker overlays matInput and
      // intercepts the pointer event (a real click hangs). focus()+fill() sets the value hit-test-free.
      await el.focus();
      await el.fill(value);
      await el.blur(); // updateOn:'change' commits on input; blur flushes before the gate runs.
    };
    await fillText(SEL.description, d.description ?? 'E2E smoke queue description');
    await fillText(SEL.introdescription, d.introDescription ?? 'E2E smoke intro description');
    await fillText(SEL.queueTargetCapacity, d.queueTargetCapacity ?? '10');
    await fillText(SEL.totalCapacity, d.totalCapacity ?? '50');
    await fillText(SEL.queueWelcomeTemplate, d.welcomeTemplate ?? 'E2E Welcome Template');
    await fillText(SEL.lastRegistrationDate, d.lastRegistrationDate ?? defaultLastRegistrationDate());
    await fillText(SEL.queueWelcomeTitle, d.welcomeTitle ?? 'Welcome');
    await fillText(SEL.queueWelcomeDescription, d.welcomeDescription ?? 'Welcome to the E2E smoke queue');
    await fillText(SEL.queuedMessage, d.queuedMessage ?? 'You are queued.');
    await fillText(SEL.waitingMessage, d.waitingMessage ?? 'You are waiting.');
  }

  /**
   * Open the Venue single-select and click its FIRST real option, returning the option's bound
   * `value` (the seeded `event location.location` string — html:101-103). Use when the test only
   * needs *a* valid venue (a smoke save) and does not care which: it selects whatever the seeded
   * `event location` collection offers rather than hardcoding a location string. Throws (after
   * closing the overlay) if the select renders zero options — surfacing a missing `event location`
   * seed instead of silently advancing with an invalid form. Drives the REAL overlay.
   * @returns the selected venue value (location string the APP computed from its stream).
   */
  async pickFirstVenue(): Promise<string> {
    const select = this.host.locator(SEL.venue);
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.click();
    const options = this.overlayOption();
    // Venue options have NO ngx-mat-select-search box (html:100-104), so option[0] is a real venue.
    const first = options.first();
    if (!(await first.isVisible().catch(() => false))) {
      await this.closeOverlay();
      throw new Error(
        'pickFirstVenue: the Venue select has ZERO options — seed at least one `event location` ' +
          'doc as a precondition (venueList is empty otherwise and step-0 can never validate).',
      );
    }
    const value = await this.optionValue(first);
    await first.click();
    await this.closeOverlay();
    return value;
  }

  /**
   * Open the given staff multi-select (`field`: 'queueadmin'|'queuementor') and click its first
   * REAL option (skipping the leading ngx-mat-select-search box, html:54-60), returning that
   * option's bound `value` — the staff `profile_ref.id` (component ts:485-488). Lets a smoke test
   * pick *a* seeded admin/mentor without hardcoding a profileid, while still capturing the exact id
   * so the spec can assert it round-tripped into the written `queue generation` doc. Throws (after
   * closing the overlay) if there is no real option. Drives the REAL overlay.
   * @returns the selected profile id (the value the APP bound to the option).
   */
  async pickFirstProfile(field: 'queueadmin' | 'queuementor'): Promise<string> {
    const select = this.host.locator(field === 'queueadmin' ? SEL.queueAdmin : SEL.queueMentor);
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.scrollIntoViewIfNeeded().catch(() => {});
    // The Material notched-outline label (`<mat-label>`) overlaps the mat-select trigger and intercepts
    // the pointer, so a plain click can hang ("subtree intercepts pointer events"). Click the trigger
    // element itself; fall back to a force-click (the overlay opens on the bound mousedown either way).
    const trigger = select.locator('.mat-mdc-select-trigger');
    if ((await trigger.count()) > 0) {
      await trigger.first().click({ force: true });
    } else {
      await select.click({ force: true });
    }
    const options = this.overlayOption();
    await expect(options.first()).toBeVisible({ timeout: 10_000 });
    // Find the first option with a non-empty bound value (the search box has none).
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const value = await this.optionValueOrNull(opt);
      if (value != null && value.length > 0) {
        await opt.click();
        await this.closeOverlay();
        return value;
      }
    }
    await this.closeOverlay();
    throw new Error(
      `pickFirstProfile(${field}): no selectable option with a bound value — seed the staff auth ` +
        'chain (users_roles + profile_data) so returnprofile() lists at least one profile.',
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1 "Product Mapping" — add a stage to the chip grid
  // ---------------------------------------------------------------------------

  /**
   * Add ONE stage name to the Queue Stages chip grid (`mat-chip-grid[formcontrolname="stages"]`,
   * html:286-311). The chip grid lives on STEP 1 "Product Mapping"; this method advances the stepper
   * from step 0 if needed (via `proceedToNextstage()`, which requires the step-0 Queue-Details fields
   * to be valid first — so call setQueueName/Admin/Mentor/Dates/Venue beforehand). It types the stage
   * into the chip input and commits with Enter (the input fires `addStage` on ENTER/COMMA, ts:552-560).
   * Resolves once the stage chip is visible, confirming the APP added it to the `stages` form value.
   * @param stage the stage label to add (e.g. "Welcome")
   */
  async addOneStage(stage: string): Promise<void> {
    await this.ensureStagesStep();
    const chipGrid = this.host.locator(SEL.stagesChipGrid);
    await expect(chipGrid).toBeVisible({ timeout: 15_000 });
    // The chip-grid input is the textbox wired to `[matChipInputFor]` (html:305). NOTE: `matChipInputFor`
    // is an Angular-Material property @Input bound as `[matChipInputFor]="chipGrid"` — Angular does NOT
    // reflect it to a DOM attribute, so `input[matChipInputFor]` matches nothing. The MatChipInput
    // directive instead stamps the class `mat-mdc-chip-input` on its host <input>. Scope to the grid so
    // a chip-input elsewhere can't match.
    const chipInput = chipGrid.locator('input.mat-mdc-chip-input');
    // Wait EXPLICITLY for the input element itself (not just its enclosing grid) to attach + become
    // visible, with a bounded timeout. The grid host can render a beat before its projected `<input>`
    // settles inside the outlined mat-form-field; a bare `focus()` would otherwise sit on the default
    // 120s ACTION timeout waiting for the locator (observed AUTH-01 hang) instead of failing fast here.
    await expect(
      chipInput,
      'addOneStage: the Queue-Stages chip input never became visible inside its chip-grid (step-1 "Product Mapping" did not fully render — is the step-0 gate satisfied / the dialog past its loading spinner?).',
    ).toBeVisible({ timeout: 15_000 });
    // Focus the chip input so the typed stage commits on Enter. focus() avoids the Material outline /
    // required-marker pointer intercept; if focus() can't land (e.g. the label briefly overlays the
    // control), fall back to a force-click on the input, which the chip-input accepts to take focus.
    try {
      await chipInput.focus({ timeout: 10_000 });
    } catch {
      await chipInput.click({ force: true, timeout: 10_000 });
    }
    await chipInput.fill(stage);
    await chipInput.press('Enter');
    // `addStage` pushes onto the stages array and renders a `mat-chip-row` with the stage text
    // (html:293-303). Assert the chip the APP rendered (not the input value we typed).
    await expect(
      chipGrid.locator('mat-chip-row').filter({ hasText: stage }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  // ---------------------------------------------------------------------------
  // save — drive the stepper to the final step and click Submit
  // ---------------------------------------------------------------------------

  /**
   * Advance through the remaining steps to the final "Completed" step and click its Submit button
   * (`button` text "Submit", html:884, `(click)="onsubmit(queueform.getRawValue())"`). `onsubmit`
   * commits the `queue generation` writeBatch and then closes the dialog (ts:1102), so we resolve once
   * the dialog host has detached — that is the APP signalling the write path ran and the dialog closed
   * (the spec then asserts the CF/app output, e.g. via savedQueueId()).
   *
   * Advancing uses the steps' own "Next" buttons (`proceedToNextstage()` per step), so each step's
   * validation runs exactly as the product enforces it. Assumes step 0 was completed (name/admin/
   * mentor/dates/venue set) and at least one stage was added on step 1.
   */
  async save(opts: { timeoutMs?: number } = {}): Promise<void> {
    const timeout = opts.timeoutMs ?? 30_000;
    // Walk forward until the final-step Submit button is present, clicking each step's primary "next"
    // button. The step bodies are *ngIf'd by the stepper, so only the active step's buttons are in DOM.
    const submitBtn = this.host.getByRole('button', { name: /^\s*Submit\s*$/ });
    for (let i = 0; i < 6; i++) {
      if (await submitBtn.isVisible().catch(() => false)) break;
      // The active step exposes exactly one forward button; its label changes per step
      // ("Proceed to Product Mapping" / "Next Step" / "Next Process"). Match any of them.
      const nextBtn = this.host
        .getByRole('button', { name: /Proceed to Product Mapping|Next Step|Next Process/ })
        .first();
      await expect(nextBtn).toBeVisible({ timeout: 15_000 });
      await nextBtn.click();
      // Give the stepper a beat to swap the active step into the DOM before the next probe.
      await expect
        .poll(async () => (await submitBtn.isVisible().catch(() => false)) || (await nextBtn.isVisible().catch(() => false)), {
          timeout: 15_000,
        })
        .toBe(true);
    }
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });
    await submitBtn.click();
    // onsubmit() closes the dialog after the batch is committed (ts:1102). Detachment of the host is
    // the app-observable "submitted" signal; wait for it so the spec doesn't race the Firestore write.
    await expect(this.host).toBeHidden({ timeout });
  }

  // ---------------------------------------------------------------------------
  // savedQueueId — read the APP's OUTPUT (the written queue generation doc)
  // ---------------------------------------------------------------------------

  /**
   * Resolve the docid of the `queue generation` document the stepper just CREATED, by querying for the
   * doc whose `queuename` equals the name passed to `fillQueueName` (the test's precondition). The id
   * itself is APP-generated (`onsubmit` ts:907) and written by the component's batch — it is NOT a
   * value the test wrote, so returning it does not breach anti-circularity (we never compare read==
   * written; we read an app-produced id keyed by a known name). Polls because the write is async and
   * (on the cloud target) may lag the dialog close.
   *
   * @param name optional override for the queue name to match (defaults to the value fillQueueName set).
   * @returns the created queue's docid.
   * @throws if fillQueueName was never called and no name override is given, or if no matching doc
   *         appears within the poll budget.
   */
  async savedQueueId(name?: string): Promise<string> {
    const queueName = name ?? this.filledQueueName;
    if (!queueName) {
      throw new Error(
        'savedQueueId: no queue name to match — call fillQueueName(name) first (or pass name explicitly).',
      );
    }
    const docs = await pollUntil<DocResult[]>(
      () => queryWhere('queue generation', [['queuename', '==', queueName]]),
      (rows) => rows.length > 0,
      { timeoutMs: POLL.timeout, label: `queue generation doc with queuename="${queueName}"` },
    );
    // The component writes `docid` into the doc body (ts:907/911); prefer it, fall back to the snapshot
    // id (they are equal — the doc is created at `queue generation/{docid}`).
    const doc = docs[0];
    const docid = (doc['docid'] as string | undefined) ?? doc.id;
    return docid;
  }

  /**
   * Resolve the FULL `queue generation` document the stepper just created (the APP's OUTPUT), keyed
   * by the queue NAME `fillQueueName` set. Returns `{ id, ...body }` where `id` is the Firestore
   * snapshot id and the body includes the app-written fields (`docid`, `queuename`, `queueadmin`
   * ARRAY, `queuementor`, `stages`, `venue`, …). Anti-circularity: the body is the value the
   * COMPONENT's batch wrote (it computed `docid` client-side, ts:907, and shaped `metadata`,
   * ts:865-905) — the spec asserts the app's own output shape, never a value the test itself wrote
   * back (the test only set the queue NAME, which is the lookup key, not the asserted field).
   *
   * @param name optional queue-name override (defaults to the value `fillQueueName` set).
   * @returns the created queue's `{ id, ...data }`.
   */
  async readSavedQueueDoc(name?: string): Promise<DocResult> {
    const queueName = name ?? this.filledQueueName;
    if (!queueName) {
      throw new Error(
        'readSavedQueueDoc: no queue name to match — call fillQueueName(name) first (or pass name).',
      );
    }
    const docs = await pollUntil<DocResult[]>(
      () => queryWhere('queue generation', [['queuename', '==', queueName]]),
      (rows) => rows.length > 0,
      { timeoutMs: POLL.timeout, label: `queue generation doc with queuename="${queueName}"` },
    );
    return docs[0];
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Ensure the stepper is on step 1 "Product Mapping" (where the stages chip grid lives). Idempotent:
   * if the chip grid is already visible we are there; otherwise click step 0's "Proceed to Product
   * Mapping" button (which runs the step-0 validation gate). If the gate blocks (a required field is
   * missing), the chip grid never appears and the subsequent `addOneStage` assertion times out with a
   * clear message — surfacing the missing precondition rather than silently no-op'ing.
   */
  private async ensureStagesStep(): Promise<void> {
    const chipGrid = this.host.locator(SEL.stagesChipGrid);
    if (await chipGrid.isVisible().catch(() => false)) return;
    const proceed = this.host.getByRole('button', { name: /Proceed to Product Mapping/ }).first();
    if (await proceed.isVisible().catch(() => false)) {
      await proceed.click();
    }
    await expect(chipGrid).toBeVisible({ timeout: 15_000 });
  }

  /** Locator for mat-select options in the global CDK overlay (options render outside the dialog host). */
  private overlayOption(): Locator {
    // Match both Material 19 MDC option and the legacy class, scoped to the open panel.
    return this.page.locator('.cdk-overlay-container mat-option, .cdk-overlay-container .mat-mdc-option');
  }

  /**
   * Open a multi-select and click the options whose VALUE matches each id in `ids`. mat-option does not
   * expose its bound `[value]` as a DOM attribute, so we resolve the value via the live Angular option
   * instance (`ng.getComponent(<mat-option host>).value`) — the served e2e app is a dev build
   * (production:false), so the `window.ng` debug global is present (same mechanism big-planner.page.ts
   * relies on). The first option in these selects is the ngx-mat-select-search box (no real value); the
   * value-match naturally skips it. Closes the overlay afterwards.
   */
  private async selectMultiByValue(select: Locator, ids: string[], label: string): Promise<void> {
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.click();
    const panelOptions = this.overlayOption();
    await expect(panelOptions.first()).toBeVisible({ timeout: 10_000 });
    for (const id of ids) {
      const option = await this.findOptionByValue(panelOptions, id);
      if (!option) {
        await this.closeOverlay();
        throw new Error(
          `setQueue* (${label}): no mat-option with value "${id}" in the open panel — pass a seeded profile/option id that the select actually lists.`,
        );
      }
      await option.click();
    }
    await this.closeOverlay();
  }

  /**
   * Find the open-panel mat-option whose Angular-bound `value` === `id`. Iterates the rendered options
   * and reads each one's instance `value` via the dev-mode `ng.getComponent` global. Returns the
   * matching Locator or null. (Used instead of text matching so callers key on stable ids, not on
   * display names that can collide or change.)
   */
  private async findOptionByValue(panelOptions: Locator, id: string): Promise<Locator | null> {
    const count = await panelOptions.count();
    for (let i = 0; i < count; i++) {
      const opt = panelOptions.nth(i);
      if ((await this.optionValueOrNull(opt)) === id) return opt;
    }
    return null;
  }

  /**
   * Read a mat-option's Angular-bound `value` via the dev-mode `ng.getComponent` global (the served
   * e2e app is a DEV build — production:false — so `window.ng` is present; same mechanism
   * big-planner.page.ts + findOptionByValue rely on). Returns `null` when the option has no bound
   * value (e.g. the ngx-mat-select-search box). Throws a clear error if `window.ng` is absent.
   */
  private async optionValueOrNull(opt: Locator): Promise<string | null> {
    return opt.evaluate((el) => {
      const ng = (window as unknown as { ng?: { getComponent?: (e: Element) => unknown } }).ng;
      if (!ng || typeof ng.getComponent !== 'function') {
        throw new Error(
          'window.ng.getComponent is unavailable: queue-creation selects read the option bound value, which needs a DEV build (production:false).',
        );
      }
      const cmp = ng.getComponent(el) as { value?: unknown } | null;
      const v = cmp?.value;
      return v == null ? null : String(v);
    });
  }

  /** Like {@link optionValueOrNull} but throws if the option has no bound value (caller expects one). */
  private async optionValue(opt: Locator): Promise<string> {
    const v = await this.optionValueOrNull(opt);
    if (v == null || v.length === 0) {
      throw new Error('mat-option has no bound value (expected a real selectable option).');
    }
    return v;
  }

  /** Close an open CDK overlay (mat-select panel / date picker) by pressing Escape. */
  private async closeOverlay(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.locator('.cdk-overlay-container .mat-mdc-select-panel, .cdk-overlay-container .mat-select-panel'))
      .toHaveCount(0, { timeout: 10_000 })
      .catch(() => undefined);
  }
}
