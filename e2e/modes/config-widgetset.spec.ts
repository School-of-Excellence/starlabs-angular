// config-widgetset.spec.ts — per-mode widget-set rendering (validated/02-product-modes.md §5).
//
// §5 documents that each (product × mode) configures the widget set the participant sees in the mobile
// app, stored in `product mode config`. This case proves the config screen READS that per-mode widget
// set back faithfully: opening the (P2, Integration Mode) edit dialog must pre-populate exactly the
// widgets the seed configured for that mode, in order, with each widget's human title from widgetList.
//
// This complements (does NOT duplicate) config.spec.ts: PM-04 asserts the title the app STAMPS on save,
// PM-05 asserts the widget COUNT after a merge-add. This asserts the per-mode widget-SET the app renders
// from the stored config — the §5 "widgets per mode" mapping at the screen level.
//
// Anti-circularity: the seed wrote the (P2, Integration Mode) widget set; the screen's job is to read it
// back and render each widget's select with the matching title. We assert the rendered titles equal the
// EXPECTED set derived from the seeded widgetids via the component's own widgetList mapping — i.e. the
// app's read+map+render output, not a value the test typed into the page.
import { test, expect } from '@playwright/test';
import { installModeStubs, loginAsModeAdmin, modeIds, productNames, resetP2IntegConfig } from './support/modes';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

// The seeded (P2, Integration Mode) widget set (seed-modes.js block 5 / resetP2IntegConfig). The titles
// are the widgetList human labels the screen renders for these widgetids (configupdate widgetList).
const EXPECTED_WIDGET_TITLES = ['Start Cycle of Evolution', 'Impact & Non Impact Stats'];

// A taller viewport so the (pre-populated) dialog's widget cards are fully on-screen for visibility
// assertions (matches config.spec.ts's rationale for the edit dialog height).
test.use({ viewport: { width: 1280, height: 1600 } });

test.describe('Modes — per-mode widget-set rendering (validated §5, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installModeStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'product mode widget-set: no fatal console errors / pageerrors'));

  test('PM-WIDGETSET the (P2, Integration Mode) edit dialog renders exactly the seeded per-mode widget set', async ({ page }) => {
    // Precondition: restore the (P2, Integration Mode) config to its seeded 2-widget set so this is
    // re-run-stable even after PM-05 (which adds a 3rd widget) ran in the same suite.
    await resetP2IntegConfig(modeIds.PMC_P2_INTEG);

    await loginAsModeAdmin(page);
    await page.goto('/productmodeconfig', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/productmodeconfig/, { timeout: 30_000 });

    // [REAL-UI] expand the P2 product panel and open the Integration Mode config dialog.
    const panel = page.locator('mat-expansion-panel').filter({ hasText: productNames.P2 });
    await expect(panel, 'widget-set: P2 product panel must render').toBeVisible({ timeout: 30_000 });
    await panel.locator('mat-expansion-panel-header').click();
    const modeTitle = panel.locator('.modetitle', { hasText: /^\s*Integration Mode\s*$/ });
    await expect(modeTitle, 'widget-set: Integration Mode must render in the expanded panel').toBeVisible({ timeout: 15_000 });
    await modeTitle.click();
    await expect(page.getByText('Configuring Mode :'), 'widget-set: the edit dialog must open').toBeVisible({ timeout: 20_000 });

    // [ASSERT] the dialog pre-populated exactly 2 widget cards (the seeded per-mode set size) …
    const cards = page.locator('.widget-card');
    await expect(cards, 'widget-set: the seeded 2-widget set must pre-populate').toHaveCount(EXPECTED_WIDGET_TITLES.length, { timeout: 15_000 });

    // … and each card's select renders the widget's title (the app mapped the stored widgetid →
    // widgetList title and displayed it). Order-preserving: the component patches widgets in array order.
    for (let i = 0; i < EXPECTED_WIDGET_TITLES.length; i++) {
      await expect(
        cards.nth(i).locator('.mat-mdc-select-trigger'),
        `widget-set: card #${i} renders the seeded widget "${EXPECTED_WIDGET_TITLES[i]}"`,
      ).toContainText(EXPECTED_WIDGET_TITLES[i], { timeout: 10_000 });
    }
  });
});
