// journey-deep.spec.ts — Journey & Products to FULL recon depth: the WRITE-mutation + CF/side-effect
// cases the first pass deferred (recon e2e/recon-allcomp/journey-products.md JP-06/08/09/10 + the
// product-delivery / deliverysequence authoring + formtemplate render). REAL Angular screens, REAL
// Material dialogs, ANTI-CIRCULAR assertions, TEST-PROJECT Firestore only — NO Watson / NO SalesCRM
// write is ever driven (R-02/R-03; the prod firewall is belt+suspenders for the breakthroughapprovedleads
// HTTP CF on reject).
//
// Anti-circularity contract (every case): the seeds are PRECONDITIONS; the asserted value is the doc the
// APP's own writeBatch/updateDoc/setDoc minted (read back by its NATURAL KEY — app writes carry NO
// testrunid), or a value the app COMPUTED/RENDERED — never a value the test wrote into Firestore.
//
// Cases:
//   JP-06   purchase save → participantjourneyproduct(journeystatus 'initiated') + journeyproductpurchase
//           + participantsproduct created for a CLEAN-slate participant (0 -> the app's writeBatch).
//   JP-08   Mark-as-Onboarded dialog → participantjourneyproduct.onboarded flips false -> true.
//   JP-09   same dialog + "Send Onboarding Email" → one `email archive` doc created for the profileid.
//   JP-10   Sales-lead Reject dialog → salesleads.status -> 'Rejected' (test-project-only).
//   JP-AUTH deliverysequence authoring → a productToDeliverySequence doc the app's setDoc wrote.
//   JP-PD   product-delivery list renders ONE row per productToDeliverySequence doc + the seeded mapping's
//           product name (app-computed path->name); regression guard for the in-place-mutation list bug.
//   JP-EDIT deliverysequence EDIT (?data=PDS1) mounts: the constructor getDoc ref->path walk is null-safe
//           for a mapping with NO deliverysequence (the seeded jny_PDS1) — the form populates with no fatal
//           (regression guard for the unguarded edit-path getDoc throw, sibling to the JP-PD list bug).
//   JP-16   formtemplate(?id=DF1) renders the form the app BUILT from the seeded `delivery forms` formarray.
import { test, expect, Page } from '@playwright/test';
import {
  journeyNames, journeyIds, installJourneyStubs, attachJourneyGuard, loginAsJourneyAdmin,
  PID_ONB, PID_PURCHASE,
  resetOnboardPjp, resetSalesLeadPending, cleanAppPurchaseWrites, cleanProductDeliveryFor,
  ensureEmailTemplate,
} from './support/journey';
import { assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, queryWhere } from '../queue/support/firestore-admin';

const RUN = process.env.JNY_RUNID || 'jny';

/** A near-future date string in M/D/YYYY (the format the Material date adapter accepts — see
 *  queue/authoring.spec.ts futureDate). */
function dateStr(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400e3);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Open a Material mat-select by accessible name and click the option — retried because the floating
 *  <mat-label> notched-outline intercepts the first trigger click and the panel open is async (the
 *  proven events-deep / appointments pattern). `scope` narrows the option search to one overlay. */
async function pickMatOption(
  page: Page, combo: ReturnType<Page['getByRole']>, optionName: RegExp | string,
): Promise<void> {
  await expect(combo).toBeVisible({ timeout: 30_000 });
  const option = page.getByRole('listbox').getByRole('option', { name: optionName });
  await expect(async () => {
    await combo.click({ force: true });
    await expect(option.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await option.first().click();
  // wait for the panel/backdrop to detach so the next trigger click isn't intercepted.
  await expect(page.getByRole('listbox')).toHaveCount(0, { timeout: 10_000 });
}

// ===========================================================================================
// JP-06 — Purchase save (participantpurchase/:pid). Drives the REAL purchase form end-to-end:
// add a journey purchase, pick the seeded journey (auto-populates the mapped product from
// journey-to-product), fill subscription dates + the product's package + minimum payment, Review,
// add the required change-note, Update. The app's updateProduct() writeBatch then mints a
// participantjourneyproduct (journeystatus 'initiated'), a journeyproductpurchase, and a
// participantsproduct — all keyed by the clean-slate profileid. Anti-circular: count 0 -> 1 the app wrote.
// ===========================================================================================
test.describe('Journey DEEP — purchase save (real purchase form → writeBatch)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachJourneyGuard(page);
    await installJourneyStubs(page);
  });
  // participantpurchase reads the Watson prod secondary app (uninitialized in the test env) for the legacy
  // Watson-purchases widget → benign collection(undefined) FirebaseError; the screen still renders + the
  // writeBatch we assert still fires. Tolerate ONLY that anchored class (see purchase.spec.ts for the full why).
  const WATSON_ABSENT = [/Expected first argument to collection\(\) to be a CollectionReference/];
  test.afterEach(() => assertNoFatal(guard, 'journey-deep purchase save: no fatal console errors / pageerrors', WATSON_ABSENT));

  test('JP-06 saving a new journey purchase creates participantjourneyproduct + journeyproductpurchase + participantsproduct (journeystatus initiated)', async ({ page }) => {
    // Precondition reset (anti-circular): p2 is a clean-slate participant; sweep any app-written purchase
    // docs a prior run minted so the counts start at 0. NOT the asserted value.
    await cleanAppPurchaseWrites(PID_PURCHASE);
    expect(await countWhere('participantjourneyproduct', [['profileid', '==', PID_PURCHASE]]),
      'JP-06: no journey-product doc must exist before the save').toBe(0);
    expect(await countWhere('journeyproductpurchase', [['profileid', '==', PID_PURCHASE]]),
      'JP-06: no purchase doc must exist before the save').toBe(0);

    await loginAsJourneyAdmin(page);
    await page.goto(`/participantpurchase/${PID_PURCHASE}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participantpurchase/, { timeout: 30_000 });
    // The clean-slate form renders its title (the app read profile_data.name) and an empty purchase list.
    // The page has two "Participant Purchase" headings (the h5 title + the h6 section label); the title
    // carries " - <name>", so anchor on the dash to disambiguate (strict-mode safe).
    await expect(page.getByRole('heading', { name: /Participant Purchase\s*-/i }),
      'JP-06: the purchase screen title renders').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] add a journey purchase row.
    await page.getByRole('button', { name: /Add Purchase/i }).click();
    // The "Participant Purchase" section renders the editable Journey select (combobox name "Journey").
    const journeySelect = page.getByRole('combobox', { name: /^Journey$/i }).first();
    // Pick the seeded journey 1 — onJourneyChange auto-populates the mapped product (journey-to-product J1->[P1]).
    await pickMatOption(page, journeySelect, new RegExp(`^${journeyNames.journey1}$`));
    await expect(journeySelect, 'JP-06: the Journey select shows the seeded journey').toContainText(journeyNames.journey1);

    // Subscription Start / End (journey-level required keys). The inputs are matInput + matDatepicker
    // bound by ngModel; target by their floating <mat-label> text. Type M/D/YYYY then blur to parse.
    const subStart = page.getByRole('textbox', { name: /Subscription Start/i }).first();
    const subEnd = page.getByRole('textbox', { name: /Subscription End/i }).first();
    await subStart.fill(dateStr(0)); await subStart.blur();
    await subEnd.fill(dateStr(90)); await subEnd.blur();

    // Journey Status → "Initiated". The app stores `journeystatus` as the lowercased option the user picks
    // (journey-product-purchase.html:47 → option.toLowerCase()); leaving it unset writes null. Picking it
    // here means the WRITE the app commits carries 'initiated' (the value the PRODUCT persisted via
    // writeBatch from the chosen option — not a value the test wrote straight into Firestore).
    const statusSelect = page.getByRole('combobox', { name: /Journey Status/i }).first();
    await pickMatOption(page, statusSelect, /^Initiated$/);

    // The auto-populated product row needs its Package + Minimum Payment (requiredProductKey). Product is
    // pre-selected (the mapped P1); pick the package and confirm the minimum payment is filled.
    const packageSelect = page.getByRole('combobox', { name: /^Package$/i }).first();
    await pickMatOption(page, packageSelect, new RegExp(`^${journeyNames.package1}$`));
    const minPay = page.getByRole('spinbutton', { name: /Minimum Payment/i }).first();
    await minPay.fill('100');

    // [REAL-UI] Review → the diff table renders; the new journey purchase is "Added" and requires a note.
    await page.getByRole('button', { name: /Review Purchase/i }).click();
    const journeyNote = page.locator('input.row-note').first();
    await expect(journeyNote, 'JP-06: the review note input must render for the added purchase').toBeVisible({ timeout: 20_000 });
    await journeyNote.fill(`JP-06 e2e initial purchase ${RUN}`);

    // Update Purchase → updateProduct() writeBatch commits the three docs, then the screen navigates back.
    await page.getByRole('button', { name: /Update Purchase/i }).click();

    // [ASSERT] the PRIMARY anti-circular oracle: the app's writeBatch MINTED the three purchase docs that did
    // not exist before (0 -> 1), keyed by the clean-slate profileid — docs the product created, found by
    // natural key. The journeystatus value is the product's lowercased transform of the option we chose
    // (the standard drive-UI → assert-app-write pattern); the doc EXISTENCE + the journeyref the app resolved
    // are the parts the test could not have fabricated.
    await expect.poll(
      () => countWhere('participantjourneyproduct', [['profileid', '==', PID_PURCHASE]]),
      { message: 'JP-06: the save must create exactly one participantjourneyproduct', timeout: 30_000 },
    ).toBe(1);
    const pjps = await queryWhere('participantjourneyproduct', [['profileid', '==', PID_PURCHASE]]);
    expect(pjps[0]['journeystatus'], 'JP-06: the new PJP carries journeystatus initiated (app-written)')
      .toBe('initiated');
    expect((pjps[0]['journeyref'] as { id?: string })?.id, 'JP-06: the new PJP points at the seeded journey')
      .toBe(journeyIds.J1);

    // …and the matching journeyproductpurchase + at least one participantsproduct the batch wrote.
    expect(await countWhere('journeyproductpurchase', [['profileid', '==', PID_PURCHASE]]),
      'JP-06: the save must create the journeyproductpurchase record').toBe(1);
    expect(await countWhere('participantsproduct', [['profileid', '==', PID_PURCHASE]]),
      'JP-06: the save must create >=1 participantsproduct enrollment').toBeGreaterThanOrEqual(1);

    // Cleanup so re-runs (and JP-* render cases) stay clean. Not an assertion.
    await cleanAppPurchaseWrites(PID_PURCHASE);
  });
});

// ===========================================================================================
// JP-08 / JP-09 — Journey Support → the REAL "Mark as Onboarded" dialog (OnboardingRemarkComponent).
// The dialog is gated to render only when paymentplan != null (seeded truthy on PJP_ONB).
// JP-08 asserts the participantjourneyproduct.onboarded flip; JP-09 asserts the `email archive` doc the
// dialog's createEmailArchive() wrote. journeysupport's "upcoming workshops" widget has a known
// cross-suite .toDate() bug (purchase.spec.ts B-3) so these do NOT use assertNoFatal — they assert the
// functional Firestore side-effect instead (the brief allows this for the workshop-widget artifact).
// ===========================================================================================
test.describe('Journey DEEP — mark onboarded + onboarding email archive (real dialog → writes)', () => {
  test.beforeEach(async ({ page }) => { await installJourneyStubs(page); });

  test('JP-08 marking onboarded flips participantjourneyproduct.onboarded to true', async ({ page }) => {
    // Precondition reset (anti-circular): PJP_ONB back to onboarded:false (paymentplan kept truthy so the
    // button still renders). The asserted value is the app's updateDoc output, never this reset.
    await resetOnboardPjp(journeyIds.PJP_ONB, PID_ONB);
    expect((await getDoc('participantjourneyproduct', journeyIds.PJP_ONB))!.onboarded,
      'JP-08: PJP starts NOT onboarded').toBe(false);

    await loginAsJourneyAdmin(page);
    await page.goto(`/journeysupport/${PID_ONB}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/journeysupport/, { timeout: 30_000 });

    // [REAL-UI] the onboarding card resolves the journey name and (paymentplan truthy) renders the button.
    await expect(page.getByText(journeyNames.journey1, { exact: false }).first(),
      'JP-08: the onboarding card renders the seeded journey').toBeVisible({ timeout: 30_000 });
    const markBtn = page.getByRole('button', { name: /Mark as Onboarded/i });
    await expect(markBtn, 'JP-08: the mark-onboarded button renders when paymentplan is set').toBeVisible({ timeout: 30_000 });

    // window.confirm fires inside onSubmit() ("Are you sure the Participant is Onboarded") — auto-accept.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await markBtn.click();

    // The dialog opens (header "Onboard Remark"). The Submit button is gated by validateOnboard(), whose
    // final line enables it iff `referral` is set → click the Referral "No" chip, then Submit.
    await expect(page.getByText('Onboard Remark'), 'JP-08: the onboard dialog opens').toBeVisible({ timeout: 20_000 });
    const dialog = page.getByRole('dialog');
    // Pick a Referral chip (mat-chip-option). "No" avoids the salesleads referral=yes branch.
    await dialog.getByRole('option', { name: /^No$/ }).click();
    const submit = dialog.getByRole('button', { name: /^Submit$/i });
    await expect(submit, 'JP-08: Submit enables once Referral is chosen').toBeEnabled({ timeout: 10_000 });
    await submit.click();

    // [ASSERT] journeyplan.markOnboarded()'s updateDoc(participantjourneyproduct/{docid}, value) set
    // onboarded:true — the value the APP computed in OnboardingRemark.onSubmit() (line 873), NOT a test
    // write (the precondition was explicitly false).
    await expect.poll(
      async () => (await getDoc('participantjourneyproduct', journeyIds.PJP_ONB))?.onboarded,
      { message: 'JP-08: the dialog Submit must flip onboarded to true', timeout: 30_000 },
    ).toBe(true);

    // Cleanup so a re-run starts from onboarded:false again.
    await resetOnboardPjp(journeyIds.PJP_ONB, PID_ONB);
  });

  test('JP-09 submitting with "Send Onboarding Email" creates an email archive doc for the participant', async ({ page }) => {
    // Precondition: reset the onboard PJP and delete any prior email-archive doc for this profileid so the
    // count starts at 0 (the archive doc carries profileid as an ARRAY → array-contains). JP-09 reuses the
    // single deterministic onboard PJP (PJP_ONB) — the dialog acts on journeyplan's participantJourneyData.
    await resetOnboardPjp(journeyIds.PJP_ONB, PID_ONB);
    await cleanAppPurchaseWrites(PID_ONB); // also sweeps the email archive (array-contains profileid)
    // `email templates` is a shared global collection — re-assert the active template so a concurrent
    // suite's teardown can't leave the dialog's template dropdown empty (the JP-09 race we hit once).
    await ensureEmailTemplate();
    expect(await countWhere('email archive', [['profileid', 'array-contains', PID_ONB]]),
      'JP-09: no email-archive doc must exist before submit').toBe(0);

    await loginAsJourneyAdmin(page);
    await page.goto(`/journeysupport/${PID_ONB}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/journeysupport/, { timeout: 30_000 });

    const markBtn = page.getByRole('button', { name: /Mark as Onboarded/i });
    await expect(markBtn).toBeVisible({ timeout: 30_000 });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await markBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(page.getByText('Onboard Remark'), 'JP-09: the onboard dialog opens').toBeVisible({ timeout: 20_000 });

    // [REAL-UI] the right panel loads `email templates` where active==true. Select the seeded template via
    // its custom search dropdown (not a mat-select): focus the input, then click the dropdown item.
    const tmplInput = dialog.locator('input.custom-search-input');
    await expect(tmplInput, 'JP-09: the template search input renders').toBeVisible({ timeout: 20_000 });
    await tmplInput.click();
    await tmplInput.fill(journeyNames.emailTemplate);
    const tmplItem = dialog.locator('.custom-dropdown-item').filter({ hasText: journeyNames.emailTemplate });
    await expect(tmplItem, 'JP-09: the seeded template appears in the dropdown').toBeVisible({ timeout: 15_000 });
    await tmplItem.click();
    // The composer renders once a template is selected (proves selectedTemplate is set).
    await expect(dialog.getByText('New Message'), 'JP-09: the email composer renders for the selected template')
      .toBeVisible({ timeout: 15_000 });

    // Check "Send Onboarding Email on Submit" → onSubmit() calls createEmailArchive() before closing.
    await dialog.getByText(/Send Onboarding Email on Submit/i).click();
    // Enable Submit (Referral) and submit.
    await dialog.getByRole('option', { name: /^No$/ }).click();
    const submit = dialog.getByRole('button', { name: /^Submit$/i });
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();

    // [ASSERT] createEmailArchive() wrote exactly one `email archive` doc carrying this profileid (the doc
    // the PRODUCT's setDoc minted — profileid stored as [profileid], type 'onboarding'). 0 -> 1.
    const archive = await (async () => {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const docs = await queryWhere('email archive', [['profileid', 'array-contains', PID_ONB]]);
        if (docs.length >= 1) return docs;
        if (Date.now() >= deadline) return docs;
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
    expect(archive.length, 'JP-09: the submit must create exactly one email-archive doc').toBe(1);
    expect(archive[0]['type'], 'JP-09: the archive doc is an onboarding email').toBe('onboarding');
    expect(archive[0]['status'], 'JP-09: the archive doc is queued to send').toBe('send');

    // Cleanup so re-runs start from 0 again.
    await cleanAppPurchaseWrites(PID_ONB);
    await resetOnboardPjp(journeyIds.PJP_ONB, PID_ONB);
  });
});

// ===========================================================================================
// JP-10 — Sales-lead Reject (salesleads). The Reject button (status null) opens the UpdateDialog (a
// notes textarea + Submit); saleslead.rejectSale() then updateDoc(salesleads/{docid},
// {status:'Rejected', rejectnotes}). This is TEST-PROJECT ONLY — no Watson, no salescrm; the
// breakthroughapprovedleads HTTP CF it fires next is short-circuited by the prod firewall. Anti-circular:
// the seeded lead's status is null (precondition); we assert the 'Rejected' value the app's updateDoc wrote.
// ===========================================================================================
test.describe('Journey DEEP — sales-lead reject (real dialog → status write, test-project only)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachJourneyGuard(page);
    await installJourneyStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'journey-deep sales reject: no fatal console errors / pageerrors'));

  test('JP-10 rejecting a pending sales lead writes salesleads.status = Rejected', async ({ page }) => {
    // Precondition reset (anti-circular): the seeded lead back to status null (pending). The asserted
    // value is the 'Rejected' the app's updateDoc writes, never this reset.
    await resetSalesLeadPending(journeyIds.SL1);
    expect((await getDoc('salesleads', journeyIds.SL1))!.status, 'JP-10: the lead starts pending (status null)').toBeNull();

    await loginAsJourneyAdmin(page);
    await page.goto('/salesleads', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/salesleads/, { timeout: 30_000 });

    // [REAL-UI] the salesleads stream renders a row per lead. Narrow the table to the seeded lead via the
    // Search box (MatTableDataSource.filter — substring across fields) so the row is page-stable even if
    // the shared project later carries more leads, then click its Reject button (rendered while status null).
    await page.getByRole('textbox', { name: /Search/i }).fill(journeyNames.salesLead);
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.salesLead });
    await expect(row, 'JP-10: the seeded pending lead row must render').toBeVisible({ timeout: 30_000 });
    await row.getByRole('button', { name: /^Reject$/i }).click();

    // The UpdateDialog opens (a textarea + Submit). Type a reject reason, Submit.
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('textarea'), 'JP-10: the reject-notes dialog opens').toBeVisible({ timeout: 20_000 });
    await dialog.locator('textarea').fill(`JP-10 e2e reject reason ${RUN}`);
    await dialog.getByRole('button', { name: /^Submit$/i }).click();

    // [ASSERT] rejectSale()'s updateDoc set status:'Rejected' + the rejectnotes — the value the APP wrote
    // (the precondition was null). Polled (dialog close + write is async).
    const after = await (async () => {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const d = await getDoc('salesleads', journeyIds.SL1);
        if (d?.status === 'Rejected') return d;
        if (Date.now() >= deadline) return d;
        await new Promise((r) => setTimeout(r, 800));
      }
    })();
    expect(after?.status, 'JP-10: the reject must write status Rejected').toBe('Rejected');
    expect(after?.rejectnotes, 'JP-10: a reject reason must be recorded').toContain('JP-10 e2e reject reason');

    // Cleanup → pending again for re-runs.
    await resetSalesLeadPending(journeyIds.SL1);
  });
});

// ===========================================================================================
// JP-AUTH + JP-PD + JP-EDIT — Product-delivery authoring, list & edit. JP-AUTH drives the deliverysequence
// authoring form (Product Designer): pick a product, fill a delivery type + one activity (from the seeded
// delivery catalogs) + label + description, Submit → setDoc(productToDeliverySequence/{auto-id}). JP-PD
// asserts the product-delivery LIST renders ONE data row per productToDeliverySequence doc + the seeded
// mapping's product name (app resolves product.path -> name) with no fatal console error. JP-EDIT opens the
// SAME authoring form in EDIT mode (?data=<mapping id>) on the seeded jny_PDS1 mapping — whose single
// delivery option has NO deliverysequence — to guard the constructor getDoc ref->path walk that used to
// throw "Cannot read properties of undefined" on exactly that shape (the sibling of the JP-PD list bug).
// ===========================================================================================
// NOTE (was B-PD, now FIXED): the /productdelivery list's collectionSnapshots('productToDeliverySequence')
// handler used to MUTATE each emitted doc in place (snapdata['product'] = snapdata['product']['path']),
// so a re-emit re-ran ['path'] on the now-string value (and a mapping with no deliverysequence hit
// `.length` on undefined) → "Cannot read properties of undefined", collapsing the MatTable to ZERO rows
// plus a fatal console error. product-delivery.component.ts now builds a FRESH per-emit view-model, so
// JP-PD GUARDS the fix: it attaches a console guard and asserts the rows render (count == doc count) with
// no fatal. JP-AUTH (the authoring WRITE) keeps the by-design Watson/SalesCRM-tolerant posture.
test.describe('Journey DEEP — product-delivery authoring + list (list renders after the in-place-mutation fix)', () => {
  test.beforeEach(async ({ page }) => {
    await installJourneyStubs(page);
  });

  test('JP-PD product-delivery list renders one data row per productToDeliverySequence doc (app path->name, no fatal)', async ({ page }) => {
    // Guard the regression directly: pre-fix the list collapsed to ZERO rows AND emitted a fatal console
    // error on /productdelivery. Attach BEFORE navigation so the guard sees the (now-absent) throw.
    const guard = attachJourneyGuard(page);

    // The admin-SDK count of mapping docs is the oracle for the rendered row count. The suite's
    // teardown+reseed leaves exactly the seeded PDS1 mapping (P1); JP-AUTH (next, and self-cleaning) has
    // not run yet, so this is a single mapping — well within one paginator page (default page size 50).
    const docCount = await countWhere('productToDeliverySequence');
    expect(docCount, 'JP-PD: the seeded productToDeliverySequence mapping must exist before the render').toBeGreaterThanOrEqual(1);

    await loginAsJourneyAdmin(page);
    await page.goto('/productdelivery', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/productdelivery/, { timeout: 30_000 });

    // [REAL-UI] the screen mounts for the seeded super-role admin (the data-driven authGuard admits — proves
    // the /productdelivery dashboard grant seeded) and renders its heading + the "Map Products & Delivery
    // Activities" button that routes to the deliverysequence AUTHORING screen JP-AUTH drives.
    await expect(page.getByRole('heading', { name: /Products & Delivery Activities Map/i }),
      'JP-PD: the product-delivery screen mounts (route grant admits the admin)').toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Map Products & Delivery Activities/i }),
      'JP-PD: the authoring entry button renders').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the MatTable renders exactly ONE data row per mapping doc — the core regression guard
    // (pre-fix this was 0; only the header tr survived). `.mat-mdc-row` excludes the header row. Polled
    // because the productToDeliverySequence stream settles async after the screen mounts.
    const dataRows = page.locator('table[mat-table] tr.mat-mdc-row, table[mat-table] tr[mat-row]');
    await expect.poll(() => dataRows.count(),
      { message: 'JP-PD: the list must render one row per productToDeliverySequence doc (not zero)', timeout: 30_000 },
    ).toBe(docCount);

    // [ASSERT] anti-circular: the row shows the seeded mapping's PRODUCT NAME — a value the APP COMPUTED
    // (it read products/P1 into mapProduct and resolved the stored product.path -> name via the template's
    // {{mapProduct[row.product]}}), never a value the test wrote into the DOM.
    await expect(page.locator('table[mat-table]').getByText(journeyNames.product1, { exact: false }).first(),
      'JP-PD: the row shows the app-resolved product name (product.path -> mapProduct[name])').toBeVisible({ timeout: 30_000 });

    // [ASSERT] no fatal console error / pageerror — the in-place-mutation throw the list used to emit on the
    // /productdelivery route is gone (the second symptom the fix removes).
    assertNoFatal(guard, 'JP-PD: /productdelivery renders the list with no fatal console error (mutation bug fixed)');
  });

  test('JP-AUTH deliverysequence authoring writes a productToDeliverySequence doc the list then shows', async ({ page }) => {
    // Precondition reset (anti-circular): delete any prior authoring write for product P2 (auto-id, no
    // testrunid) so we assert exactly the doc THIS save mints. P2 is seeded UNMAPPED in
    // productToDeliverySequence (only P1/PDS1 is), so it appears in the authoring "nonexisting" product list.
    await cleanProductDeliveryFor(journeyIds.P2);
    const mappingsForP2 = async () => (await queryWhere('productToDeliverySequence'))
      .filter((d) => (d['product'] as { id?: string })?.id === journeyIds.P2 && (d as { testrunid?: string }).testrunid !== RUN).length;
    expect(await mappingsForP2(), 'JP-AUTH: no P2 authoring doc before the Submit').toBe(0);

    await loginAsJourneyAdmin(page);
    await page.goto('/deliverysequence', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/deliverysequence/, { timeout: 30_000 });

    // [REAL-UI] Product select (nonexistingproductlist — products without a sequence yet). Pick product 2.
    const productSelect = page.getByRole('combobox', { name: /^Product$/i }).first();
    await pickMatOption(page, productSelect, new RegExp(`^${journeyNames.product2}$`));

    // Delivery Type is a plain text matInput (not a select). Fill it.
    await page.getByRole('textbox', { name: /Delivery Type/i }).first().fill('online');

    // Delivery Activities select — options come from the merged delivery catalogs (appointmenttype/
    // delivery forms/…). Pick the seeded Form activity (rendered as "<formname> (Form)").
    const activitySelect = page.getByRole('combobox', { name: /Delivery Activities/i }).first();
    await pickMatOption(page, activitySelect, new RegExp(`${journeyNames.deliveryForm}`));

    // Label + Description (both required by the template).
    await page.getByRole('textbox', { name: /^Label$/i }).first().fill(`JP-AUTH label ${RUN}`);
    await page.getByRole('textbox', { name: /^Description$/i }).first().fill(`JP-AUTH desc ${RUN}`);

    // window.confirm("are you sure want to submit") fires in onproducttodeliverysubmit() — auto-accept.
    page.on('dialog', (d) => d.accept().catch(() => {}));
    await page.getByRole('button', { name: /^Submit$/i }).click();

    // [ASSERT] the app's setDoc minted exactly one productToDeliverySequence doc referencing product 2 (the
    // doc the PRODUCT wrote, vs 0 before). The component navigates to /productdelivery on success.
    await expect.poll(mappingsForP2,
      { message: 'JP-AUTH: the Submit must create one productToDeliverySequence doc for product 2', timeout: 30_000 },
    ).toBe(1);
    // The created doc carries the product ref + the deliveryoptions[deliverytype + deliverysequence[activity]]
    // the app assembled — assert the deliverytype the app persisted (a value the app wrote from our typed
    // precondition, round-tripped through the setDoc; the doc id + ref resolution are the app's work).
    const created = (await queryWhere('productToDeliverySequence'))
      .find((d) => (d['product'] as { id?: string })?.id === journeyIds.P2 && (d as { testrunid?: string }).testrunid !== RUN);
    expect(created, 'JP-AUTH: the new mapping doc exists').toBeTruthy();
    const opts = (created!['deliveryoptions'] as Array<{ deliverytype?: string }>) || [];
    expect(opts.length, 'JP-AUTH: the saved doc has one delivery option').toBeGreaterThanOrEqual(1);
    expect(opts[0]?.deliverytype, 'JP-AUTH: the delivery type round-trips into the saved doc').toBe('online');

    // Cleanup so re-runs (and the product-delivery render) stay clean.
    await cleanProductDeliveryFor(journeyIds.P2);
  });

  test('JP-EDIT editing a mapping with no deliverysequence mounts the authoring form (null-safe getDoc, no fatal)', async ({ page }) => {
    // Regression guard for the deliverysequence EDIT path (sibling of the JP-PD list bug). The constructor's
    // getDoc(?data=<id>) branch converts the stored Firestore refs -> path strings for the two-way-bound
    // form. Pre-fix it walked deliveryoptions[].deliverysequence[].activity with NO null-guard, so the
    // seeded jny_PDS1 (deliveryoptions:[{deliverytype:'Standard Delivery'}] — a delivery option with NO
    // deliverysequence) threw "Cannot read properties of undefined (reading 'length')" inside the getDoc
    // .then(), stranding the authoring form. This case is READ-ONLY (it never Submits) so the shared seeded
    // PDS1 baseline JP-PD counts is left untouched. Attach the guard BEFORE navigation so it sees the throw.
    const guard = attachJourneyGuard(page);

    // [PRECONDITION] the seeded baseline mapping exists and reproduces the exact no-deliverysequence shape
    // that used to throw — read back here to DOCUMENT the repro (anti-circular: this is the precondition,
    // never the asserted value; the assertion is that the APP mounts + populates the form with no fatal).
    const seededMapping = await getDoc('productToDeliverySequence', journeyIds.PDS1);
    expect(seededMapping, 'JP-EDIT: the seeded productToDeliverySequence mapping (jny_PDS1) must exist').toBeTruthy();
    const seededOpts = (seededMapping!['deliveryoptions'] as Array<{ deliverysequence?: unknown[] }>) || [];
    expect(seededOpts[0]?.deliverysequence,
      'JP-EDIT: the seeded mapping reproduces the no-deliverysequence shape that used to throw').toBeUndefined();

    await loginAsJourneyAdmin(page);
    // Navigate to the EDIT path (?data=<mapping id>) — the constructor getDoc branch that used to throw.
    await page.goto(`/deliverysequence?data=${journeyIds.PDS1}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/deliverysequence/, { timeout: 30_000 });

    // [ASSERT] the authoring form MOUNTS and the getDoc populated the two-way-bound model from the seeded
    // doc: the Delivery Type input carries the app-read 'Standard Delivery' value (the app rendered the
    // seeded deliveryoptions[0].deliverytype into the [(ngModel)] input) and the Submit button renders.
    const deliveryType = page.getByRole('textbox', { name: /Delivery Type/i }).first();
    await expect(deliveryType, 'JP-EDIT: the edit form mounts with the app-populated seeded delivery option')
      .toHaveValue('Standard Delivery', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Submit$/i }),
      'JP-EDIT: the authoring form Submit button renders').toBeVisible({ timeout: 30_000 });

    // [ASSERT] no fatal console error / pageerror — the unguarded ref->path walk's "Cannot read properties
    // of undefined" throw on the no-deliverysequence mapping is gone. This is the PRIMARY regression
    // discriminator: pre-fix the getDoc .then() threw mid-walk; post-fix it completes cleanly.
    assertNoFatal(guard, 'JP-EDIT: /deliverysequence?data edit-mode getDoc mounts with no fatal (null-safe ref->path)');
  });
});

// ===========================================================================================
// JP-16 — formtemplate render. The route reads the `delivery forms` doc (?id=DF1) from the DEFAULT DB
// and builds the reactive form from its `formarray`; the named `firestore-forms` DB (R-07) IS
// provisioned in the test project (probed at authoring time), so the component mounts. Anti-circular:
// the seeded form's short-text field LABEL must render — a value the APP computed from its Firestore read
// of the formarray, not a test write into the DOM.
// ===========================================================================================
test.describe('Journey DEEP — formtemplate render (form built from delivery-forms formarray)', () => {
  // No assertNoFatal: the formtemplate connectivity guard / named-DB lazy init can emit benign console
  // noise; the functional render (the app-built field label) is the assertion.
  test.beforeEach(async ({ page }) => { await installJourneyStubs(page); });

  test('JP-16 formtemplate(?id) renders the form the app built from the seeded delivery-forms formarray', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto(`/formtemplate?id=${journeyIds.DF1}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/formtemplate/, { timeout: 30_000 });

    // [REAL-UI] ngAfterViewInit reads `delivery forms/DF1`, iterates formarray, and adds a FormControl per
    // non-label field. The seeded short-text field's LABEL ("Participant Goal <run>") must render in the
    // form the app BUILT — a value sourced from the Firestore doc (app-computed), never written by the test.
    await expect(page.getByText(journeyNames.formField, { exact: false }).first(),
      'JP-16: the app renders the seeded form field label from the delivery-forms formarray')
      .toBeVisible({ timeout: 30_000 });
  });
});
