// catalog.spec.ts — Journey & Products CATALOG authoring (Product Designer routes). These cases drive
// REAL Angular screens with ANTI-CIRCULAR assertions and touch ONLY the test project's Firestore (no
// Watson / no SalesCRM): addjourney render + dialog-add, addproduct render, journeyproductmap render +
// dialog-map. No composite index needed (collection reads / single-field equality only).
//
// Recon: e2e/recon-allcomp/journey-products.md (JP-01..JP-04, JP-17).
// Anti-circularity: every render case asserts a value the APP rendered from its own collectionData/
// collectionSnapshots Firestore stream against the KNOWN seeded docs; every write case asserts the doc
// COUNT the APP wrote (countWhere over the app's own write), vs the count before the action — never a
// value the test wrote. Seeds are PRECONDITIONS only.
import { test, expect } from '@playwright/test';
import {
  journeyNames, journeyIds, installJourneyStubs, attachJourneyGuard, loginAsJourneyAdmin,
  deleteCatalogDoc, deleteDocsByField,
} from './support/journey';
import { assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { countWhere, queryWhere } from '../queue/support/firestore-admin';

const RUN = process.env.JNY_RUNID || 'jny';

// A unique journey name the JP-02 dialog creates. Carries the run id so cleanup is unambiguous and the
// "after" count (countWhere by this name) is exactly the app's own write.
const NEW_JOURNEY_NAME = `JP02 Added Journey ${RUN}`;

test.describe('Journey & Products — catalog authoring (real UI, anti-circular, test-project only)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachJourneyGuard(page);
    await installJourneyStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'journey catalog: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // JP-01 — /addjourney renders the seeded journeys from its collectionData(journey) stream
  // ===========================================================================================
  test('JP-01 addjourney renders the seeded journey catalog (both seeded journeys appear)', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto('/addjourney', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/addjourney/, { timeout: 30_000 });

    // [REAL-UI] the component subscribes to collectionData(query(journey, orderBy('sequence'))) and renders
    // a MatTable row per journey. Both seeded journeys must render as rows the app built from that stream.
    const row1 = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.journey1 });
    const row2 = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.journey2 });
    await expect(row1, 'JP-01: seeded journey 1 row must render').toBeVisible({ timeout: 30_000 });
    await expect(row2, 'JP-01: seeded journey 2 row must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the two rendered rows correspond to the two seeded `journey` docs (the app's render is
    // backed by Firestore, not by a test write): exactly 2 journey docs carry this run's testrunid tag.
    const seededCount = await countWhere('journey', [['testrunid', '==', RUN]]);
    expect(seededCount, 'JP-01: exactly the 2 seeded journeys exist for this run').toBe(2);
  });

  // ===========================================================================================
  // JP-02 — adding a journey via the dialog WRITES a `journey` doc the table then re-renders
  // ===========================================================================================
  test('JP-02 adding a journey via the dialog increments the catalog and renders the new row', async ({ page }) => {
    // Precondition reset (anti-circular): remove any prior JP-02 journey so the count starts at 0 and the
    // assertion is purely the doc the APP creates on Submit. NOT the asserted value — a precondition.
    await deleteDocsByField('journey', 'journey', NEW_JOURNEY_NAME);
    const before = await countWhere('journey', [['journey', '==', NEW_JOURNEY_NAME]]);
    expect(before, 'JP-02: the new journey must not exist before the dialog Submit').toBe(0);

    await loginAsJourneyAdmin(page);
    await page.goto('/addjourney', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/addjourney/, { timeout: 30_000 });

    // [REAL-UI] open the "Add journey" dialog, fill the required Journey name, Submit. JourneyEntryComponent
    // .onformsubmit() does setDoc(doc('journey'), {id, journey, sequence, atcmodel:null, ...}).
    await page.getByRole('button', { name: /Add journey/i }).click();
    const nameInput = page.getByRole('textbox', { name: /Journey/i }).first();
    await expect(nameInput, 'JP-02: the journey-name field must appear in the dialog').toBeVisible({ timeout: 20_000 });
    await nameInput.fill(NEW_JOURNEY_NAME);
    // The Submit button is enabled once `journey` is non-empty (the only required control).
    await page.getByRole('button', { name: /^Submit$/i }).click();

    // [ASSERT] the app's setDoc created exactly one `journey` doc with this name (value the PRODUCT wrote,
    // vs the known 0 before) — polled because the dialog write + close is async.
    await expect
      .poll(() => countWhere('journey', [['journey', '==', NEW_JOURNEY_NAME]]),
        { message: 'JP-02: the dialog Submit must create exactly one new journey doc', timeout: 30_000 })
      .toBe(1);

    // …and the table the component re-rendered from its live stream now shows the new row.
    const newRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: NEW_JOURNEY_NAME });
    await expect(newRow, 'JP-02: the new journey row must render in the catalog table').toBeVisible({ timeout: 30_000 });

    // Cleanup so re-runs (and other agents' catalog views) stay clean. Not an assertion.
    await deleteDocsByField('journey', 'journey', NEW_JOURNEY_NAME);
  });

  // ===========================================================================================
  // JP-03 — /addproduct renders the seeded products from its collectionData(products) stream
  // ===========================================================================================
  test('JP-03 addproduct renders the seeded products (name + mode columns)', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto('/addproduct', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/addproduct/, { timeout: 30_000 });

    // [REAL-UI] add-product subscribes to collectionData(query(products, orderBy('product')), {idField:'id'})
    // and renders a MatTable row per product. Both seeded products must render.
    const row1 = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.product1 });
    const row2 = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.product2 });
    await expect(row1, 'JP-03: seeded product 1 row must render').toBeVisible({ timeout: 30_000 });
    await expect(row2, 'JP-03: seeded product 2 row must render').toBeVisible({ timeout: 30_000 });

    // [ASSERT] the rendered rows are backed by Firestore: exactly the 2 seeded `products` docs for this run.
    const seededCount = await countWhere('products', [['testrunid', '==', RUN]]);
    expect(seededCount, 'JP-03: exactly the 2 seeded products exist for this run').toBe(2);
  });

  // ===========================================================================================
  // JP-17 — /journeyproductmap renders the SEEDED journey↔product mapping (path-keyed name lookup)
  // ===========================================================================================
  test('JP-17 journeyproductmap renders the seeded journey-to-product mapping row', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto('/journeyproductmap', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/journeyproductmap/, { timeout: 30_000 });

    // [REAL-UI] the component subscribes to collectionSnapshots('journey-to-product') and, per row, resolves
    // the journey display name from a path-keyed map it built from collectionSnapshots('journey')
    // (mapJourney[row.journey]). The seeded mapping (J1 -> [P1]) must render journey 1's NAME and product 1's
    // NAME — both values the app COMPUTED from its Firestore streams (not a test write).
    const mappedRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.journey1 });
    await expect(mappedRow, 'JP-17: the seeded mapping row (journey 1) must render').toBeVisible({ timeout: 30_000 });
    await expect(mappedRow, 'JP-17: the mapped product name resolves via the products path-map').toContainText(journeyNames.product1);
  });

  // ===========================================================================================
  // JP-04 — mapping a fresh journey↔product via the dialog WRITES a journey-to-product doc
  // ===========================================================================================
  test('JP-04 mapping a journey to a product via the dialog creates a journey-to-product doc and renders it', async ({ page }) => {
    // The journey-ref doc id we map to (journey 2, seeded UNMAPPED). The app stores journey-to-product.journey
    // as a DocumentReference; we identify the created mapping by ref.id === J2 (avoids ref-equality-in-query).
    const j2id = journeyIds.J2;
    const mappingsForJ2 = async () => (await queryWhere('journey-to-product'))
      .filter((d) => (d['journey'] as { id?: string })?.id === j2id).length;

    // Precondition reset (anti-circular): remove any prior J2 mapping (auto-id, created by an earlier run's
    // dialog — NOT testrunid-tagged). The assertion is the doc the APP's setDoc creates, vs 0 before.
    for (const d of (await queryWhere('journey-to-product'))) {
      if ((d['journey'] as { id?: string })?.id === j2id) await deleteCatalogDoc('journey-to-product', d.id);
    }
    expect(await mappingsForJ2(), 'JP-04: no J2 mapping must exist before the dialog Submit').toBe(0);

    await loginAsJourneyAdmin(page);
    await page.goto('/journeyproductmap', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/journeyproductmap/, { timeout: 30_000 });

    // [REAL-UI] open the "Map Journey & Product" dialog. Pick journey 2 (single mat-select) + product 2
    // (multi mat-select), then Submit. updateJourneyProduct() does setDoc(doc('journey-to-product'),
    // {journey: ref(J2), product: [ref(P2)], journeyrequiredjourneycoach:false}).
    const dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: /Map Journey & Product/i }).click();
    await expect(dialog, 'JP-04: the mapping dialog must open').toBeVisible({ timeout: 20_000 });

    // The dialog has exactly two mat-selects: [0]=Journey, [1]=Products. Drive each by its dialog-scoped
    // index and click options inside the OPEN cdk overlay listbox (scoping avoids matching the table /
    // paginator / the other select's options — the source builds journeyList from an unordered snapshot, so
    // there are many journeys; a page-wide getByRole('option') is ambiguous). The floating <mat-label>
    // intercepts a plain trigger click, so force it (Material gotcha).
    const selects = dialog.getByRole('combobox');
    await selects.nth(0).click({ force: true });
    await page.getByRole('listbox').getByRole('option', { name: journeyNames.journey2, exact: true }).click();
    // J2 is seeded UNMAPPED → the "Already exists" validation must NOT appear (proves J2 was selected, not J1).
    await expect(selects.nth(0), 'JP-04: the Journey select shows journey 2 after picking it').toContainText(journeyNames.journey2);
    await expect(dialog.getByText(/Already.*exists/i), 'JP-04: journey 2 is unmapped — no exists error').toHaveCount(0);
    // The single-select panel closes on pick — wait for the journey listbox to detach before opening Products
    // (a leftover overlay backdrop would intercept the next trigger click).
    await expect(page.getByRole('listbox'), 'JP-04: journey panel closed after selection').toHaveCount(0);

    // Products multi-select — open the panel (the mat-select trigger toggles the listbox; force bypasses the
    // floating <mat-label>), wait for the listbox, pick product 2, then Escape to close the panel so it does
    // not cover the Submit button.
    await selects.nth(1).click({ force: true });
    const productListbox = page.getByRole('listbox');
    await expect(productListbox, 'JP-04: the Products panel must open').toBeVisible({ timeout: 15_000 });
    await productListbox.getByRole('option', { name: new RegExp(`^${journeyNames.product2}$`) }).click();
    await page.keyboard.press('Escape');

    await dialog.getByRole('button', { name: /^Submit$/i }).click();

    // [ASSERT] exactly one journey-to-product doc now references journey 2 (the doc the PRODUCT wrote), vs 0
    // before. Polled (dialog write + close is async).
    await expect
      .poll(mappingsForJ2,
        { message: 'JP-04: the dialog Submit must create exactly one journey-to-product doc for journey 2', timeout: 30_000 })
      .toBe(1);

    // …and the new mapping renders journey 2's name in the table the component re-rendered from its stream.
    const newRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: journeyNames.journey2 });
    await expect(newRow, 'JP-04: the new mapping row (journey 2) must render').toBeVisible({ timeout: 30_000 });

    // Cleanup so re-runs stay clean.
    for (const d of (await queryWhere('journey-to-product'))) {
      if ((d['journey'] as { id?: string })?.id === j2id) await deleteCatalogDoc('journey-to-product', d.id);
    }
  });
});
