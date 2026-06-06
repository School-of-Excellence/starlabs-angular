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

import { test, expect } from '@playwright/test';
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

    // 4. Step 1 "Product Mapping" — add ONE stage (advancing off step 0 runs the validation gate;
    //    if any step-0 field were missing the chip grid would never appear and this would fail).
    await creation.addOneStage('Welcome');

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
