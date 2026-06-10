// templates.spec.ts — Email-template + One-Way-template LIST renders (REAL-UI, anti-circular).
//
// Recon: e2e/recon-allcomp/comms-notifications.md (CN-02 / CN-14).
// Anti-circularity: each case asserts a row the APP RENDERED from its OWN getDocs query
//   (email templates orderBy('date') / onewaytemplates orderBy('createddate')) — plus a derived value
//   the component COMPUTED from the seeded fields (the email status chip text getStatusText() → "Approved"
//   for templatevalidated:true). The seed is the precondition; the rendered row + computed label are the
//   app's. Neither query needs a composite index (single-field orderBy only).
//
// SCOPE NOTE: the email SEND broadcast + Postmark template-validation flows (recon CN-04/CN-05/CN-13) and
// the one-way CHANNEL broadcast (CN-15) write to a cross-project / Postmark boundary and/or drive a heavy
// ngx-editor create form with an async name validator + confirm() dialogs. They are left as TODO + recorded
// as blockers rather than shipped flaky. These LIST-render cases prove the screens mount and query.
import { test, expect } from '@playwright/test';
import { installCommsStubs, loginAsCommsAdmin } from './support/comms';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';

const RUN = process.env.COMM_RUNID || 'comm';

test.describe('Comms — template list renders (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installCommsStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'comms templates: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CN-02 — /email-templates list renders the seeded approved template with its computed status
  // ===========================================================================================
  test('CN-02 email-templates list renders the approved template as "Approved"/"Validated"', async ({ page }) => {
    await loginAsCommsAdmin(page);
    await page.goto('/email-templates', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/email-templates/, { timeout: 30_000 });

    // [REAL-UI] viewMode defaults to 'list'; ngOnInit → loadExistingTemplates() runs
    // getDocs(email templates, orderBy('date','desc')) and renders a MatTable. The approved template row
    // (unique name) must appear, and getStatusText() computed "Approved" from templatevalidated:true.
    const approvedRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Approved Email ${RUN}` });
    await expect(approvedRow, 'CN-02: the seeded approved email template row must render').toBeVisible({ timeout: 30_000 });

    const rowText = (await approvedRow.innerText()).replace(/\s+/g, ' ');
    // The component maps templatevalidated:true → status chip "Approved" + validation label "Validated"
    // (getStatusText, html:216/239) — values the app COMPUTED from the seeded boolean, not seeded strings.
    expect(rowText, `CN-02: status chip must read the app-computed "Approved". Row="${rowText}"`).toContain('Approved');
    // The validation label renders uppercase ("VALIDATED") via the component's status pipe — match case-insensitively.
    expect(rowText, 'CN-02: validation label must read the app-computed "Validated"').toMatch(/validated/i);

    // The pending template renders too, with the app computing "Pending" — corroborates the column is a
    // real per-row computation (not a constant), without asserting on the send selector (out of scope).
    const pendingRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Pending Email ${RUN}` });
    await expect(pendingRow, 'CN-02: the seeded pending email template row must render').toBeVisible({ timeout: 30_000 });
    expect((await pendingRow.innerText())).toContain('Pending');
  });

  // ===========================================================================================
  // CN-14 — /onewaytemplates list renders the seeded one-way template (app's loadTemplates query)
  // ===========================================================================================
  test('CN-14 onewaytemplates list renders the seeded template', async ({ page }) => {
    await loginAsCommsAdmin(page);
    await page.goto('/onewaytemplates', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/onewaytemplates/, { timeout: 30_000 });

    // [REAL-UI] viewMode defaults to 'list'; ngOnInit → loadTemplates() runs
    // getDocs(onewaytemplates, orderBy('createddate','desc')).filter(!delete) and renders a MatTable. The
    // seeded template (unique name) must appear in the .template-name cell the app rendered.
    const name = page.locator('.template-name', { hasText: `Seeded Oneway ${RUN}` });
    await expect(name, 'CN-14: the seeded one-way template must render in the list').toBeVisible({ timeout: 30_000 });

    // Its category cell is the app rendering the seeded field on the same row (a non-tautological signal).
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `Seeded Oneway ${RUN}` });
    expect((await row.innerText())).toContain('Test');
  });
});
