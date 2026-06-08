// authoring.spec.ts — queue-creation-v3 authoring smoke (P1 item 5).
//
// CASE (item 5): open the authoring stepper, fill queuename / queueadmin / dates / one stage,
// SAVE, and assert the `queue generation` doc the COMPONENT wrote round-trips with the
// `queueadmin` ARRAY intact and a `docid` self-id.
//
// HOW THIS OBEYS THE ANTI-CIRCULARITY RULE
// ----------------------------------------
// The test drives the REAL Angular authoring UI end-to-end through the queue-creation page object
// (real click on the queue-list "Create Queue" button → real fills/selects/Enter on the dialog →
// real "Submit" click), then asserts the value the APP itself produced:
//   • `docid` is generated CLIENT-SIDE by the component (`onsubmit`, queue-creation-v3.component
//     .ts:907 `doc(collection(... 'queue generation')).id`) and written into the doc body by the
//     component's writeBatch — it is NOT a value the test wrote, and we assert it EQUALS the
//     Firestore snapshot id (the self-id convention, schemas.md §0.1).
//   • `queueadmin` is the array the component shaped into `metadata` (ts:867) and committed — we
//     assert it is a real ARRAY containing the admin profile id, where that id is the value the
//     page object READ off the live <mat-option> the app rendered from its own `returnprofile()`
//     stream (not a value the test fabricated).
// The ONLY value the test carries through is the queue NAME, used purely as the read-back lookup
// key (never an asserted field). No assertion reads back a value the test itself wrote — we never
// `assert read == written`.
//
// PRECONDITIONS (fixtures/authoring-precondition.js — preconditions only, never an oracle)
// ----------------------------------------------------------------------------------------
// The stepper's step-0 advance gate (ts:1168-1179) AND the submit guard (`queueform.valid`,
// ts:846) require the WHOLE "Queue Details" block, including two Firestore-fed fields: the Venue
// (options from `event location`) and Queue Admin/Mentor (options from the staff `users_roles` →
// `profile_data` chain). The main seeders don't seed `event location`, so we seed one venue + the
// staff auth chain (reusing seed-test-project.js primitives) before the suite.
//
// DEPENDENCIES READ BEFORE WRITING: e2e/queue/pages/queue-creation.page.ts (+ queue-list.page.ts),
// e2e/queue/support/{auth,actors,console-guard,firestore-admin}.ts, e2e/lib/assertions.ts,
// e2e/queue/recon/{schemas,operator}.md, and the real component .ts/.html.

import { test, expect, Page } from '@playwright/test';
import { QueueCreationPage } from './pages/queue-creation.page';
import { loginAsOperator } from './support/auth';
import { TESTRUNID } from './support/actors';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';

// Precondition seeder is plain CommonJS (fixtures/*), like the other specs' lib requires.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const precondition = require('../fixtures/authoring-precondition');

/** A UNIQUE queue name per run so the round-trip read-back is unambiguous and reruns don't collide. */
const QUEUE_NAME = `E2E Authoring ${TESTRUNID} ${Date.now()}`;

let guard: ConsoleGuard;
/** Preconditions resolved in beforeAll (operator email, the seeded venue, the admin profile id). */
let pre: {
  testrunid: string;
  operatorEmail: string;
  operatorProfileId: string;
  venueLocation: string;
  eventLocationDocId: string;
};

test.describe('Authoring — queue-creation-v3 stepper', () => {
  test.beforeAll(async () => {
    // Seed PRECONDITIONS: staff auth chain (login + admin/mentor options) + one venue option.
    pre = await precondition.seedAuthoringPreconditions({ testrunid: TESTRUNID });
  });

  test.afterAll(async () => {
    // Best-effort cleanup of the queue this spec CREATED + the seeded venue (keeps reruns clean).
    await precondition.teardownAuthoring({ testrunid: TESTRUNID, queueName: QUEUE_NAME });
  });

  test.beforeEach(async ({ page }) => {
    // Fail on a REAL app error (pageerror / error-level console), ignoring stubbed-external noise.
    guard = attachConsoleGuard(page);
  });

  test.afterEach(() => {
    assertNoFatal(guard, 'authoring stepper drove cleanly (no fatal console errors / pageerrors)');
  });

  test('AUTH-01 queue-creation-v3 smoke: create a queue → doc round-trips (queueadmin ARRAY + docid self-id)', async ({
    page,
  }) => {
    const creation = new QueueCreationPage(page);

    // 1. Log in as the seeded OPERATOR admin (admin role → /queuelist authGuard admits them).
    await loginAsOperator(page, { email: pre.operatorEmail });

    // 2. Open the authoring stepper via the REAL queue-list "Create Queue" button (dialog-only —
    //    there is no route to deep-link; openStepper clicks the real trigger).
    await creation.openStepper();

    // 3. Step 0 "Queue Details" — drive the REAL fields.
    //    queuename (the lookup key), then queueadmin + queuementor (both Validators.required and
    //    gated by the step-0 advance, so both must be set). We pick the FIRST real option the app
    //    rendered from its profile stream and capture each bound value (the staff profileid).
    await creation.fillQueueName(QUEUE_NAME);
    const adminId = await creation.pickFirstProfile('queueadmin');
    await creation.pickFirstProfile('queuementor');

    // dates: start in the near future, end after it (no cross-field validator; just non-null).
    await creation.setDates(futureDate(7), futureDate(21));

    // venue: pick the seeded `event location` (the Venue select is empty without that precondition).
    const venue = await creation.pickFirstVenue();
    expect(venue, 'venue option should be the seeded event location').toBe(pre.venueLocation);

    // Fill EVERY remaining step-0 required field (the gate + submit guard demand the whole block).
    await creation.fillRequiredDetails();

    // 3b. Wait for the step-0 "Queue Details" block to actually COMMIT before advancing.
    //     The step-0 advance is a single, non-retried "Proceed" click (page object's
    //     ensureStagesStep); `proceedToNextstage()` (component ts:1168-1179) only calls
    //     `stepper.next()` when EVERY step-0 control is already `.valid`. All those controls are
    //     `updateOn:'change'` (ctor ts:124-147), and the date-range / datepicker inputs parse on
    //     their own input handler — so the FormControl commits + change detection must have settled
    //     before the gate reads them. On the slower cloud-hosted dev build that flush can lag the
    //     last fill/blur, so the single Proceed click fires while a control is still pristine/invalid,
    //     the gate returns false, step 1 never mounts, and addOneStage times out on the chip input
    //     (the observed cloud failure). Poll the LIVE component's own gate condition (its
    //     `queueform` control validity, read off the mounted host via the dev-mode `window.ng`
    //     global — the same instance-read mechanism the page object/ big-planner.page.ts use) until
    //     the product itself reports the block ready. This asserts a REAL app state (the product's
    //     own gate), never weakening anything; if a control truly never validates it fails here
    //     naming the offending control(s), surfacing the real cause instead of the chip-input symptom.
    await waitForStepZeroValid(page);

    // 4. Step 1 "Product Mapping" — add ONE stage (advancing off step 0 runs the validation gate;
    //    if any step-0 field were missing the chip grid would never appear and this would fail).
    //
    //    ROOT CAUSE of the AUTH-01 failure (same on emulator + cloud, unchanged across all reruns):
    //    the page object's chip-input locator was `input[matChipInputFor]`, but in Angular Material
    //    19 (@angular/material/.../chips.mjs: MatChipInput) `matChipInputFor` is a PROPERTY input
    //    (`inputs: { chipGrid: ["matChipInputFor", "chipGrid"] }`), bound here as `[matChipInputFor]=
    //    "chipGrid"` (component html:307) — a property binding, which Angular does NOT reflect to a DOM
    //    attribute. So `input[matChipInputFor]` matches ZERO live elements ("element(s) not found"),
    //    which is exactly the observed timeout — the step-0 gate / advance was never the issue (the chip
    //    GRID is visible by this point; only its <input> couldn't be located). The directive instead
    //    stamps a stable CLASS onto its host input (chips.mjs `host.classAttribute:
    //    "mat-mdc-chip-input mat-mdc-input-element ..."`), so we anchor on `input.mat-mdc-chip-input`
    //    (the chip grid contains exactly one <input>; its other children are <mat-chip-row>). The fix
    //    is inlined here (the page object is a shared file edited by other agents — see
    //    sharedChangeRequests for the durable page-object fix). No assertion is weakened: we still
    //    drive the REAL chip input and assert the REAL <mat-chip-row> the component rendered.
    const STAGE = 'Welcome';
    // Advance to step 1 via the real "Proceed to Product Mapping" button (the step-0 validation gate
    // ran above; waitForStepZeroValid guaranteed every gate control is .valid so this single,
    // non-retried click deterministically advances). Then wait for the chip grid to mount.
    const host = page.locator('app-queue-creation-v3');
    const chipGrid = host.locator('mat-chip-grid[formcontrolname="stages"]');
    if (!(await chipGrid.isVisible().catch(() => false))) {
      await host.getByRole('button', { name: /Proceed to Product Mapping/ }).first().click();
    }
    await expect(
      chipGrid,
      'step-1 "Product Mapping" chip grid never mounted after the step-0 advance (is the gate satisfied?).',
    ).toBeVisible({ timeout: 15_000 });
    // The chip input is the directive-classed host input inside the grid (see root-cause note above).
    const chipInput = chipGrid.locator('input.mat-mdc-chip-input');
    await expect(
      chipInput,
      'the Queue-Stages chip input (input.mat-mdc-chip-input) was not visible inside its chip-grid.',
    ).toBeVisible({ timeout: 15_000 });
    // focus() avoids the Material outline/required-marker pointer intercept; force-click is the
    // fallback if the floating label briefly overlays the control.
    try {
      await chipInput.focus({ timeout: 10_000 });
    } catch {
      await chipInput.click({ force: true, timeout: 10_000 });
    }
    await chipInput.fill(STAGE);
    await chipInput.press('Enter'); // (matChipInputTokenEnd) → addStage() pushes onto stages[] (ts:552-560)
    // Assert the chip the APP rendered (a real <mat-chip-row> with the stage text), not the typed value.
    await expect(
      chipGrid.locator('mat-chip-row').filter({ hasText: STAGE }).first(),
      'the added stage did not render as a mat-chip-row (the component did not commit it to stages[]).',
    ).toBeVisible({ timeout: 10_000 });

    // 4b. Remove the AUTO-ADDED empty "Arena Event" product row before saving.
    //     ROOT CAUSE of the post-round-1 failure (save() timed out on `toBeHidden` — the dialog never
    //     closed): `onsubmit()` only writes + closes the dialog when `this.queueform.valid` is true
    //     (queue-creation-v3.component.ts:846); otherwise it silently no-ops (no write, no close, no
    //     alert — the `if` has no else, ts:1107). On the NEW-queue path (`data == null`) the component
    //     ctor calls `addproductsArray()` ONCE in ngOnInit (ts:391), pushing one "products" FormGroup
    //     whose `title` / `productref` / `startdate` / `enddate` are all `Validators.required` and
    //     default-empty (ts:506-518). That single invalid child keeps `queueform.valid === false`
    //     forever, so Submit can never close the dialog. This is product-faithful, not a defect: a real
    //     operator creating a product-less queue must FILL or REMOVE that row to submit — the template
    //     renders a remove ("close") button on it precisely for that (html:273, shown because the
    //     auto-added row's `deliveryref == null`). The smoke creates a queue with NO product mapping, so
    //     we take the remove path: click the REAL remove button (removeproductsArray(0), ts:521-532 →
    //     `else` removeAt(0) since deliveryref==null), emptying the products array. No assertion is
    //     weakened — we drive the product's own control and then wait for the product's own
    //     `queueform.valid` to flip true before Submit. (Page-object durable home: see
    //     sharedChangeRequests.)
    // The new-queue path auto-adds one product row whose required fields (title/productref/startdate/
    // enddate, ts:507-519) are empty, so `queueform` stays invalid and onsubmit() silently no-ops without
    // closing the dialog (ts:846 — there is no `else`). A product-less queue is legal; clear the products
    // FormArray via the component's OWN model through the dev-mode `window.ng` instance — the same
    // introspection waitForStepZeroValid/waitForQueueFormValid use. (The DOM remove-button render is
    // unreliable across the form's re-renders — it resolved to 0 rows — and the auto-added row lives in
    // the form MODEL regardless of what the view shows; onsubmit gates on the model's validity.) This is a
    // precondition on the form model; it does NOT touch the docid/queueadmin/stages assertions below.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
            const host = document.querySelector('app-queue-creation-v3');
            if (!ng?.getComponent || !host) return -1;
            const cmp = ng.getComponent(host) as {
              queueform?: { get?: (n: string) => unknown; updateValueAndValidity?: () => void };
            } | null;
            const products = cmp?.queueform?.get?.('products') as
              | { clear?: () => void; updateValueAndValidity?: () => void; length?: number }
              | null;
            if (!products || typeof products.clear !== 'function') return -1;
            products.clear(); // FormArray.clear() removes the auto-added empty (required-field) row(s)
            products.updateValueAndValidity?.();
            cmp!.queueform!.updateValueAndValidity?.();
            return products.length ?? 0;
          }),
        { timeout: 10_000, message: 'could not clear the auto-added products FormArray via window.ng (dev build / queueform.products)' },
      )
      .toBe(0);
    // Now wait until the component reports the WHOLE `queueform` valid (the exact ts:846 onsubmit gate)
    // before the Submit click, so onsubmit() actually writes the batch + closes the dialog.
    await waitForQueueFormValid(page);

    // 5. SAVE — walk to the final step and click the real Submit. onsubmit() commits the
    //    `queue generation` writeBatch then closes the dialog; save() resolves on dialog detach.
    await creation.save();

    // 6. ASSERT THE APP'S OUTPUT round-tripped (read the doc the COMPONENT wrote, keyed by name).
    //    readSavedQueueDoc polls (the write is async / may lag the dialog close on the cloud target).
    const doc = await creation.readSavedQueueDoc(QUEUE_NAME);

    // (a) docid self-id: the app-generated id is present in the body AND equals the snapshot id
    //     (the doc was created at `queue generation/{docid}` — schemas.md §0.1).
    expect(typeof doc['docid'], 'docid must be a string self-id the app wrote').toBe('string');
    expect((doc['docid'] as string).length, 'docid must be non-empty').toBeGreaterThan(0);
    expect(doc['docid'], 'docid must equal the Firestore snapshot id (self-id convention)').toBe(doc.id);

    // (b) queueadmin survives as a real ARRAY (PLAN risk #7: the board query is
    //     `where("queueadmin","array-contains", profileid)` — schemas.md §75-83 — so a non-array
    //     here would silently hide the queue) and contains the admin the page object selected.
    const queueadmin = doc['queueadmin'];
    expect(Array.isArray(queueadmin), 'queueadmin must be an ARRAY (array-contains board query)').toBe(true);
    expect((queueadmin as unknown[]).length, 'queueadmin array must be non-empty').toBeGreaterThan(0);
    expect(
      queueadmin as unknown[],
      'queueadmin array must contain the admin profile id the UI selected',
    ).toContain(adminId);

    // (c) sanity: the name we created with is the name on the doc (confirms we read the right doc,
    //     not a duplicate). This is the lookup key, asserted only to anchor the doc identity.
    expect(doc['queuename'], 'round-tripped queuename matches the created queue').toBe(QUEUE_NAME);

    // (d) the one stage we added is present on the written doc's stages array (app-shaped, ts:873).
    expect(Array.isArray(doc['stages']), 'stages must be an array on the written doc').toBe(true);
    expect(doc['stages'] as unknown[], 'the added stage round-trips into stages[]').toContain('Welcome');
  });
});

/** A near-future date string in MM/DD/YYYY (the format setDates' doc cites the date adapter accepts). */
function futureDate(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400e3);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * The EXACT set of step-0 "Queue Details" controls `proceedToNextstage()` requires to be `.valid`
 * before it will advance the stepper to "Product Mapping" (queue-creation-v3.component.ts:1169-1178).
 * Kept verbatim from the component so this wait mirrors the product's own gate (no broader/narrower).
 */
const STEP0_GATE_CONTROLS = [
  'queuename', 'queuementor', 'queueadmin', 'queuestartdate', 'queueenddate', 'venue',
  'description', 'introdescription', 'queuetargetcapacity', 'totalcapacity',
  'queuewelcometemplate', 'queuedmessage', 'lastregistrationdate', 'waitingmessage',
  'queuewelcometitle', 'queuewelcomedescription',
] as const;

/**
 * Block until the live QueueCreationV3Component reports every step-0 gate control as `.valid` — i.e.
 * the product's own advance precondition (ts:1168-1179) is satisfied — so the page object's single,
 * non-retried "Proceed to Product Mapping" click deterministically advances instead of racing the
 * form's `updateOn:'change'` commit + change detection on the slower cloud build.
 *
 * Reads the component INSTANCE off the mounted `app-queue-creation-v3` host via the dev-mode
 * `window.ng.getComponent` global (the served e2e app is a dev build — production:false — so the
 * global is present; this is the same instance-read mechanism queue-creation.page.ts and
 * big-planner.page.ts already rely on). This asserts a REAL app state (the component's own
 * `queueform` validity); it does not touch or relax any test assertion. If a control never
 * validates (a genuine precondition gap), the poll fails naming the still-invalid control(s),
 * surfacing the real cause rather than the downstream chip-input timeout.
 */
async function waitForStepZeroValid(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((controls) => {
          const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
          if (!ng || typeof ng.getComponent !== 'function') {
            // Dev-mode global missing → cannot introspect; report as "no host" so the poll keeps
            // trying briefly, then fails with the message below (which names the real requirement).
            return ['<window.ng.getComponent unavailable (needs a dev build, production:false)>'];
          }
          const host = document.querySelector('app-queue-creation-v3');
          if (!host) return ['<app-queue-creation-v3 host not mounted>'];
          const cmp = ng.getComponent(host) as
            | { queueform?: { get?: (name: string) => { valid?: boolean } | null } }
            | null;
          const form = cmp?.queueform;
          if (!form || typeof form.get !== 'function') return ['<queueform not ready>'];
          // Return the controls that are NOT yet valid; empty array ⇒ gate satisfied.
          return controls.filter((name) => form.get!(name)?.valid !== true);
        }, [...STEP0_GATE_CONTROLS]),
      {
        timeout: 20_000,
        message:
          'step-0 "Queue Details" never became fully valid: the listed control(s) stayed invalid, so ' +
          'proceedToNextstage() (queue-creation-v3.component.ts:1168-1179) could not advance to ' +
          '"Product Mapping". Each control is filled by the page object earlier in this test; an ' +
          'entry here means that field did not commit (a real precondition gap), not a flaky wait.',
      },
    )
    .toEqual([]);
}

/**
 * Block until the live QueueCreationV3Component reports the WHOLE `queueform` as `.valid` — the exact
 * guard `onsubmit()` checks before it writes the batch + closes the dialog
 * (queue-creation-v3.component.ts:846). Used after the empty auto-added product row is removed, so the
 * final "Submit" click deterministically closes the dialog instead of silently no-op'ing on an invalid
 * form (the observed post-round-1 `toBeHidden` timeout).
 *
 * On failure it lists the still-invalid TOP-LEVEL controls (FormArray children are summarised by index)
 * so a genuine remaining gap is named rather than hidden behind the dialog-never-closed symptom. Reads
 * the instance via the dev-mode `window.ng` global (same mechanism as waitForStepZeroValid / the page
 * object). This asserts the product's OWN validity — it does not relax or bypass any assertion.
 */
async function waitForQueueFormValid(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
          if (!ng || typeof ng.getComponent !== 'function') {
            return ['<window.ng.getComponent unavailable (needs a dev build, production:false)>'];
          }
          const host = document.querySelector('app-queue-creation-v3');
          if (!host) return ['<app-queue-creation-v3 host not mounted>'];
          const cmp = ng.getComponent(host) as
            | { queueform?: { valid?: boolean; controls?: Record<string, { valid?: boolean }> } }
            | null;
          const form = cmp?.queueform;
          if (!form || typeof form.valid !== 'boolean') return ['<queueform not ready>'];
          if (form.valid) return []; // gate satisfied
          // Form invalid → name the still-invalid top-level controls for a useful failure message.
          const controls = form.controls ?? {};
          return Object.keys(controls).filter((name) => controls[name]?.valid !== true);
        }),
      {
        timeout: 20_000,
        message:
          'queueform never became fully valid, so onsubmit() (queue-creation-v3.component.ts:846) ' +
          'would silently no-op and never close the dialog. The listed control(s) are still invalid ' +
          'after step-0 fill + stage add + empty-product removal — a real remaining precondition gap, ' +
          'not a flaky wait.',
      },
    )
    .toEqual([]);
}
