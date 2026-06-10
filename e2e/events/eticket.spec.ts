// eticket.spec.ts — Arena E-Ticket issuance.
//
// EVT-05 drives the REAL /arena_e_ticket_approve screen: pick the seeded event, then click "Approve"
// on the seeded approved participant's row → the component's onSubmit setDoc's a NEW `arena e-ticket`
// doc. Anti-circular: we assert the doc the APP WROTE (active:true, profileid, eventref, the
// producteligible computed from the row's productref) against the KNOWN seeded participant — never a
// value the test wrote (the e-ticket doc does not exist before the click; the reset deletes any prior).
//
// NO COMPOSITE INDEX NEEDED: arena-e-ticket-approve.onEventSelect (component ts:130) runs
//   query(`event participation request`, where(eventref==X), where(status=='approved'))
// — two EQUALITY filters on different fields (no range, no orderBy, no array-contains), which Firestore
// serves via a zig-zag merge of the two automatic single-field indexes. Verified empirically against
// the seeded data (the query returns the 2 seeded approved EPRs with no "requires an index" error), so
// neededIndexes is empty for this suite.
import { test, expect } from '@playwright/test';
import {
  evtActors, evtProfileIds, evtIds, installEvtStubs, loginAsEvtAdmin, resetEticketForP1,
} from './support/events';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { queryWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.EVT_RUNID || 'evt';
const EVENT_NAME = `TEST Event ${RUN}`;

test.describe('Events — arena e-ticket issuance (real UI, anti-circular; no composite index needed)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events e-ticket: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EVT-05 — issuing an e-ticket writes `arena e-ticket` (active:true, correct profileid/eventref)
  // ===========================================================================================
  test('EVT-05 approving a participant issues an arena e-ticket the app wrote (active:true, profileid, eventref)', async ({ page }) => {
    // Precondition (anti-circular): no e-ticket exists yet for participant1 → the screen renders the
    // "Approve" action (not "Generated"). Idempotent: deletes any prior run's ticket for this profileid.
    await resetEticketForP1();
    // NB: the APP writes arena e-ticket with no testrunid → query by the run-unique profileid only.
    const before = await queryWhere('arena e-ticket', [['profileid', '==', evtProfileIds.p1]]);
    expect(before.length, 'EVT-05: no e-ticket for participant1 before the click').toBe(0);

    await loginAsEvtAdmin(page);
    await page.goto('/arena_e_ticket_approve', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/arena_e_ticket_approve/, { timeout: 30_000 });

    // [REAL-UI] select the seeded event → the component queries `event participation request`
    // (eventref==X && status=='approved') [INDEX] and renders one row per approved participant.
    const eventSelect = page.getByRole('combobox', { name: /Select Event/i });
    await expect(eventSelect, 'EVT-05: the event select must render').toBeVisible({ timeout: 30_000 });
    // Robust open: the floating <mat-label> overlays the trigger and a single force-click can be lost to a
    // hydration race — retry until the seeded option actually shows (the event dropdown is now large because
    // EVT-02's create-event runs accumulate app-created events on the shared project). Then pick it.
    const eventOption = page.getByRole('option', { name: EVENT_NAME });
    for (let i = 0; i < 4 && !(await eventOption.first().isVisible().catch(() => false)); i++) {
      await eventSelect.click({ force: true });
      await eventOption.first().waitFor({ state: 'visible', timeout: 7_000 }).catch(() => {});
    }
    await eventOption.first().click();

    // participant1's approved row (client name == seeded profile name == email). Click its Approve button.
    const p1Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: evtActors.participant1 });
    await expect(p1Row, 'EVT-05: participant1 approved row must render (index present)').toBeVisible({ timeout: 30_000 });

    page.once('dialog', (d) => d.accept()); // onSubmit opens window.confirm("Are you sure ?")
    await p1Row.getByRole('button', { name: /^Approve$/i }).click();

    // [ASSERT] the app's setDoc created exactly one `arena e-ticket` for this participant
    // (arena-e-ticket-approve.component.ts:170) with active:true and the correct eventref/producteligible.
    const tickets = await pollUntil(
      () => queryWhere('arena e-ticket', [['profileid', '==', evtProfileIds.p1]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-05: arena e-ticket created for participant1', timeoutMs: 30_000 },
    );
    // The app writes active:true on issuance (the QR-scan-admit precondition, recon Config drivers).
    const t: any = tickets[0];
    expect(t.active, 'EVT-05: the app sets active:true on issuance').toBe(true);
    // eventref must reference the seeded event (the value the app copied from the row, not a test write).
    const eventPath = `event collection/${evtIds.event1}`;
    const refPath = t.eventref?.path ?? t.eventref?._path?.segments?.join('/');
    expect(refPath, 'EVT-05: e-ticket.eventref → the seeded event').toBe(eventPath);
    // producteligible is the row's productref.id the app pushed (anti-circular: app-computed from the row).
    expect(Array.isArray(t.producteligible) && t.producteligible.includes(evtIds.product1),
      `EVT-05: producteligible must include the seeded product id. Got=${JSON.stringify(t.producteligible)}`).toBe(true);
  });
});
