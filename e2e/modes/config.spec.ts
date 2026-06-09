// config.spec.ts — Product Mode Config: save a NEW config + extend an EXISTING config (real
// edit-dialog → Firestore write).
//
// Recon: e2e/recon-allcomp/product-modes.md (PM-04, PM-05). The /productmodeconfig screen renders one
// mat-expansion-panel per product (orderBy 'product'); expanding it shows each modeflow mode as a
// clickable .modetitle that opens the ProductModeConfigupdateComponent dialog. Save writes
// setDoc('product mode config', docid, { …, widgets, lastupdate: serverTimestamp() }, {merge:true})
// (product-mode-configupdate.component.ts:280-287).
//
// Anti-circularity: PM-04 seeds NO config for (P2, Performance Mode) → asserts the doc the APP created
// has lastupdate!=null + widgets.length==1 (the app wrote both). PM-05 seeds 2 widgets → asserts the
// APP merged to 3. The seed is the precondition, never the asserted value. NO ATC widget is used
// (PM-04 selects 'cycleofevolution', a non-reference, non-ATC widget — keeps the ATC branch dead).
import { test, expect } from '@playwright/test';
import {
  installModeStubs, loginAsModeAdmin, modeIds, productNames,
  resetP2IntegConfig, resetP2PerfConfigAbsent,
} from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { queryWhere, getDoc, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.MODE_RUNID || 'mode';

/** Open the (product, mode) edit dialog: expand the product's panel, then click the mode title. */
async function openConfigDialog(page, productName: string, modeName: string): Promise<void> {
  // The product appears as a mat-expansion-panel whose header text is the product name. Expand it.
  const panel = page.locator('mat-expansion-panel').filter({ hasText: productName });
  await expect(panel, `config dialog: product panel "${productName}" must render`).toBeVisible({ timeout: 30_000 });
  await panel.locator('mat-expansion-panel-header').click();
  // Once expanded, the modeflow modes render as .modetitle divs; click the one for this mode.
  const modeTitle = panel.locator('.modetitle', { hasText: new RegExp(`^\\s*${modeName}\\s*$`) });
  await expect(modeTitle, `config dialog: mode "${modeName}" must render in the expanded panel`).toBeVisible({ timeout: 15_000 });
  await modeTitle.click();
  // The dialog opens with a "Configuring Mode :" subheader.
  await expect(page.getByText('Configuring Mode :'), 'config dialog must open').toBeVisible({ timeout: 20_000 });
}

/** Pick a widget type in the Nth (0-based) widget card's mat-select (handles the ngx search option). */
async function pickWidget(page, cardIndex: number, widgetTitle: string): Promise<void> {
  const card = page.locator('.widget-card').nth(cardIndex);
  await expect(card, `widget card #${cardIndex} must render`).toBeVisible({ timeout: 15_000 });
  // Click the select TRIGGER (.mat-mdc-select-trigger) — clicking the <mat-select> host does not toggle
  // the overlay open (verified against the live DOM). The trigger opens a CDK overlay listbox.
  await card.locator('.mat-mdc-select-trigger').click();
  // The opened overlay lists a leading ngx-mat-select-search option (empty text) then the widgetList
  // titles (sorted alphabetically by returnWidget()). Click the option whose text is the widget title.
  const option = page.locator('mat-option', { hasText: new RegExp(widgetTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
  await expect(option, `widget option "${widgetTitle}" must appear in the opened overlay`).toBeVisible({ timeout: 10_000 });
  await option.click();
  // The overlay closes on selection; confirm the value landed (trigger text now shows the title).
  await expect(card.locator('.mat-mdc-select-trigger'), `widget card #${cardIndex} shows the selected widget`).toContainText(widgetTitle, { timeout: 10_000 });
}

// The config edit-dialog (maxHeight 90vh) grows taller than a 720px window once it holds 2-3 widgets,
// pushing its footer (the Configure button) below the fold where a real user click can't land. A taller
// viewport keeps the whole dialog — footer included — on screen so the genuine Angular click handler fires.
test.use({ viewport: { width: 1280, height: 1600 } });

test.describe('Modes — Product Mode Config (real edit-dialog → Firestore write, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'product mode config: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // PM-04 — saving a NEW config writes the doc with a server timestamp + the one widget added
  // ===========================================================================================
  test('PM-04 saving a new product-mode config writes lastupdate + widgets.length==1', async ({ page }) => {
    // Precondition (anti-circular): NO config exists for (P2, Performance Mode). The post-state query
    // (by mode=='Performance Mode', then filtered to P2 by ref id) confirms the app created it.
    await resetP2PerfConfigAbsent();
    const before = (await queryWhere('product mode config', [['mode', '==', 'Performance Mode']]))
      .filter((r) => refId(r.productref) === modeIds.P2);
    expect(before.length, 'PM-04: (P2, Performance Mode) has NO config before the save').toBe(0);

    await loginAsModeAdmin(page);
    await page.goto('/productmodeconfig', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/productmodeconfig/, { timeout: 30_000 });

    await openConfigDialog(page, productNames.P2, 'Performance Mode');

    // [REAL-UI] ngOnInit added one empty widget. Select a NON-reference, non-ATC widget so the form is
    // valid immediately (no Reference multiselect required) — "Start Cycle of Evolution" (cycleofevolution).
    await pickWidget(page, 0, 'Start Cycle of Evolution');

    // The Configure button enables once the form is valid; click it to save. (The tall viewport set on
    // this describe block keeps the dialog footer on-screen so the real Angular click handler fires.)
    const configure = page.locator('.configure-btn');
    await expect(configure, 'PM-04: Configure must enable after a widget is selected').toBeEnabled({ timeout: 10_000 });
    await configure.click();

    // [ASSERT] the app's setDoc created a (P2, Performance Mode) doc with lastupdate (serverTimestamp)
    // and exactly the one widget we added (title computed by the app from widgetList). Polled — the value
    // the PRODUCT wrote, not the test. We can't pass a ref in the where() helper, so read all (P2) configs
    // and find the Performance Mode one.
    const saved = await pollUntil(
      () => queryWhere('product mode config', [['mode', '==', 'Performance Mode']]),
      (rows) => rows.some((r) => refId(r.productref) === modeIds.P2 && Array.isArray(r.widgets) && r.widgets.length === 1 && r.lastupdate != null),
      { label: 'PM-04: (P2, Performance Mode) config saved with 1 widget + lastupdate', timeoutMs: 30_000 },
    );
    const doc = saved.find((r) => refId(r.productref) === modeIds.P2)!;
    expect(doc.lastupdate, 'PM-04: lastupdate must be written by the app (serverTimestamp)').toBeTruthy();
    expect((doc.widgets as unknown[]).length, 'PM-04: exactly one widget persisted').toBe(1);
    expect((doc.widgets as Record<string, unknown>[])[0].title, 'PM-04: app stamped the widget title from widgetList').toBe('Start Cycle of Evolution');
  });

  // ===========================================================================================
  // PM-05 — extending an EXISTING config (2 widgets) by adding one writes widgets.length==3
  // ===========================================================================================
  test('PM-05 adding a widget to an existing config writes widgets.length==3 (app-merged)', async ({ page }) => {
    // Precondition (anti-circular): (P2, Integration Mode) has EXACTLY 2 seeded widgets.
    await resetP2IntegConfig(modeIds.PMC_P2_INTEG);
    const before = await getDoc('product mode config', modeIds.PMC_P2_INTEG);
    expect((before!.widgets as unknown[]).length, 'PM-05: starts with 2 seeded widgets').toBe(2);

    await loginAsModeAdmin(page);
    await page.goto('/productmodeconfig', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/productmodeconfig/, { timeout: 30_000 });

    await openConfigDialog(page, productNames.P2, 'Integration Mode');
    // The dialog pre-populates 2 widget cards. Add a 3rd via the right-panel "Add" button.
    await expect(page.locator('.widget-card'), 'PM-05: two seeded widgets must pre-populate').toHaveCount(2, { timeout: 15_000 });
    await page.locator('.right-panel .add-btn').click();
    await expect(page.locator('.widget-card'), 'PM-05: a third widget card appears after Add').toHaveCount(3, { timeout: 10_000 });
    // Select a widget type for the new (3rd) card so the form stays valid.
    await pickWidget(page, 2, 'Start Cycle of Evolution');

    const configure = page.locator('.configure-btn');
    await expect(configure, 'PM-05: Configure must be enabled with all widgets valid').toBeEnabled({ timeout: 10_000 });
    await configure.click();

    // [ASSERT] the app's setDoc(merge) wrote the 3-widget array to the SAME doc id. Polled.
    const after = await pollUntil(
      () => getDoc('product mode config', modeIds.PMC_P2_INTEG),
      (d) => !!d && Array.isArray(d.widgets) && (d.widgets as unknown[]).length === 3,
      { label: 'PM-05: (P2, Integration Mode) config → 3 widgets', timeoutMs: 30_000 },
    );
    expect((after!.widgets as unknown[]).length, 'PM-05: the app merged the added widget → 3 total').toBe(3);
    expect(after!.lastupdate, 'PM-05: lastupdate refreshed by the app').toBeTruthy();
  });
});

/** A `productref` read back from Firestore admin is a DocumentReference-shaped object; its id is the
 *  last path segment. The admin layer returns the raw value, so normalise to the doc id string. */
function refId(ref: unknown): string | undefined {
  if (!ref) return undefined;
  const r = ref as { id?: string; path?: string; _path?: { segments?: string[] } };
  if (typeof r.id === 'string') return r.id;
  if (typeof r.path === 'string') return r.path.split('/').pop();
  const segs = r._path?.segments;
  if (Array.isArray(segs) && segs.length) return segs[segs.length - 1];
  return undefined;
}
