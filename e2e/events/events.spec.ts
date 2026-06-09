// events.spec.ts — Events, Arena & Calendar: event-list render + participation-approve mark-attended
// + attendance-log count + layers render + a route-mount smoke. These exercise REAL screens with
// ANTI-CIRCULAR assertions and need NO composite index (single-field equality queries only).
//
// Recon: e2e/recon-allcomp/events-arena.md (EVT-01 / EVT-03 / EVT-04 / EVT-09 / EVT-12).
// Anti-circularity: every assertion is either a value the APP RENDERED from its own Firestore stream
// (the event name / layer title / participant count the component computed) OR a value the APP WROTE
// on a real click (the EPR status / deliverable status / events_profiles doc the markAsAttended batch
// committed) — vs a KNOWN seeded precondition. The seed is the precondition, never the asserted value.
import { test, expect } from '@playwright/test';
import {
  evtActors, evtIds, installEvtStubs, loginAsEvtAdmin, resetEprApproved, refTo,
} from './support/events';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, queryWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.EVT_RUNID || 'evt';
const EVENT_NAME = `TEST Event ${RUN}`;

test.describe('Events — list / approve / attendance-log / layers (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EVT-01 — create_event list renders the seeded event the component streamed from Firestore
  // ===========================================================================================
  test('EVT-01 create_event list renders the app-streamed seeded event (name + venue)', async ({ page }) => {
    await loginAsEvtAdmin(page);
    await page.goto('/create_event', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/create_event/, { timeout: 30_000 });

    // [REAL-UI] EventListComponent streams `event collection` ordered by start_date desc and renders a
    // MatTable row per event (event-list.component.ts:62). Find the row the APP built for the seeded
    // event by its unique seeded name, then assert the venue cell the component also rendered.
    const row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: EVENT_NAME });
    await expect(row, 'EVT-01: the seeded event row must render').toBeVisible({ timeout: 30_000 });
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    expect(rowText, `EVT-01: the row must show the seeded venue. Row="${rowText}"`).toContain(`TEST Venue ${RUN}`);
  });

  // ===========================================================================================
  // EVT-03/04 — mark attendance: EPR → "attended" + deliverable → "completed" + events_profiles +1
  // ===========================================================================================
  test('EVT-03/04 marking a participant attended flips the EPR to "attended", the deliverable to "completed", and writes events_profiles', async ({ page }) => {
    // Precondition (anti-circular): EPR0 starts "approved" (so it appears in the Mark-Attendence tab)
    // and the linked deliverable D0 starts "ongoing". Idempotent for re-runs.
    await resetEprApproved();
    expect((await getDoc('event participation request', evtIds.epr0))!.status, 'EVT-04: EPR0 starts approved').toBe('approved');
    expect((await getDoc('deliverables', evtIds.d0))!.status, 'EVT-04: deliverable D0 starts ongoing').toBe('ongoing');

    await loginAsEvtAdmin(page);
    await page.goto('/event_participation_approve', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/event_participation_approve/, { timeout: 30_000 });

    // [REAL-UI] select the seeded event (mat-select → option by name). The component then queries
    // `event participation request` where eventref==selected and buckets rows by status; the approved
    // EPR0 lands in BOTH the "Approved" and "Mark Attendence" tabs (status in [approved,unattended]).
    const eventSelect = page.getByRole('combobox', { name: /Select an Event/i });
    await expect(eventSelect, 'EVT-04: the event select must render').toBeVisible({ timeout: 30_000 });
    // force: the floating <mat-label> notched-outline overlays the combobox trigger and intercepts a
    // normal click; force dispatches the click that opens the mat-select panel.
    await eventSelect.click({ force: true });
    await page.getByRole('option', { name: EVENT_NAME }).click();

    // Switch to the "Mark Attendence" tab (the only tab whose selection drives a COMMITTED write —
    // recon risk #1: the Requested-tab approve path has its batch.commit() commented out). The approved
    // EPR0 row appears in BOTH the "Approved" and "Mark Attendence" tabs, so scope the row lookup to the
    // ACTIVE tab panel (Material keeps inactive tab bodies in the DOM, hidden) to avoid matching the
    // hidden Approved-tab copy.
    await page.getByRole('tab', { name: /Mark Attendence/i }).click();
    const activePanel = page.locator('.mat-mdc-tab-body-active');
    await expect(activePanel, 'EVT-04: the Mark Attendence tab panel must activate').toBeVisible({ timeout: 20_000 });

    // [REAL-UI] select participant0's row checkbox (row client-name == the seeded profile name == email).
    const p0Row = activePanel.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: evtActors.participant0 });
    await expect(p0Row, 'EVT-04: participant0 approved row must render in Mark Attendence').toBeVisible({ timeout: 30_000 });
    await p0Row.locator('mat-checkbox, input[type="checkbox"]').first().click();

    // markAsAttended() opens a window.confirm — accept it, then click "Mark as Attended" (anchored so it
    // does not match the sibling "Mark as Not Attended"; scoped to the active panel). The button renders
    // only once the row checkbox makes attendanceselection non-empty.
    page.once('dialog', (d) => d.accept());
    await activePanel.getByRole('button', { name: /^Mark as Attended$/i }).click();

    // [ASSERT] the app's writeBatch flipped the EPR status to "attended"
    // (event-participation-approve.component.ts:252) — the value the PRODUCT wrote, polled.
    await pollUntil(
      () => getDoc('event participation request', evtIds.epr0),
      (d) => !!d && d.status === 'attended',
      { label: 'EVT-04: EPR0 → status "attended"', timeoutMs: 30_000 },
    );
    // …and the linked deliverable (fileref array-contains the EPR ref) flipped to "completed" (:278).
    await pollUntil(
      () => getDoc('deliverables', evtIds.d0),
      (d) => !!d && d.status === 'completed',
      { label: 'EVT-04: deliverable D0 → status "completed"', timeoutMs: 30_000 },
    );
    // …and a new events_profiles doc was created with eventrequest → the EPR0 ref (:255). Asserted by
    // querying for the app-written doc by that ref (reset cleared any prior run's), not by reading back
    // a value the test wrote — the doc did not exist before the click.
    const profiles = await pollUntil(
      () => queryWhere('events_profiles', [['eventrequest', '==', refTo('event participation request', evtIds.epr0)]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-04: events_profiles doc created for EPR0', timeoutMs: 30_000 },
    );
    expect(profiles.length, 'EVT-04: the app created an events_profiles doc for EPR0').toBeGreaterThanOrEqual(1);
  });

  // ===========================================================================================
  // EVT-09 — event attendance log renders the unique-participant count the component computed
  // ===========================================================================================
  test('EVT-09 attendance log renders the app-computed unique-participant count (== Firestore log oracle)', async ({ page }) => {
    await loginAsEvtAdmin(page);
    await page.goto('/event_attendance_log', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/event_attendance_log/, { timeout: 30_000 });

    // Oracle (independent computation): distinct profileids in `arena e-ticket log` for this event.
    const logCount = await countWhere('arena e-ticket log', [['eventref', '==', refTo('event collection', evtIds.event1)]]);
    expect(logCount, 'EVT-09: seeded e-ticket log row must exist').toBeGreaterThanOrEqual(1);

    // [REAL-UI] select the seeded event; the component streams `arena e-ticket log` where eventref==X
    // and renders "Total Log: N, Unique Participant: M" from the distinct profileids it computed
    // (event-attendance-log.component.ts:154 uniqueParticipantList). Use a search-enabled mat-select.
    const eventSelect = page.getByRole('combobox', { name: /Select Event/i });
    await expect(eventSelect, 'EVT-09: the event select must render').toBeVisible({ timeout: 30_000 });
    await eventSelect.click({ force: true });
    await page.getByRole('option', { name: EVENT_NAME }).click();

    // [ASSERT] the app rendered the unique-participant count it computed from its own stream. We seeded
    // exactly one log row (one distinct profileid), so the board must show "Unique Participant: 1".
    const summary = page.getByText(/Unique Participant:/i);
    await expect(summary, 'EVT-09: the log-summary line must render').toBeVisible({ timeout: 30_000 });
    await expect(summary).toContainText(`Unique Participant: ${logCount}`, { timeout: 20_000 });
  });

  // ===========================================================================================
  // EVT-12 — layers screen renders the seeded arenalayers row the component streamed for the event
  // ===========================================================================================
  test('EVT-12 layers-screen renders the seeded arenalayers row (title) after event selection', async ({ page }) => {
    await loginAsEvtAdmin(page);
    await page.goto('/layers-screen', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/layers-screen/, { timeout: 30_000 });

    // [REAL-UI] select the seeded event; onEventSelected resolves the logged-in roles then subscribes to
    // `arenalayers` where eventref==X and renders rows ordered by sequence (layers-screen.component.ts:100).
    const eventSelect = page.getByRole('combobox', { name: /Select Event/i });
    await expect(eventSelect, 'EVT-12: the event select must render').toBeVisible({ timeout: 30_000 });
    await eventSelect.click({ force: true });
    await page.getByRole('option', { name: EVENT_NAME }).click();

    // [ASSERT] the seeded layer's title renders in the table row the component built from its stream.
    const layerRow = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: `TEST Layer ${RUN}` });
    await expect(layerRow, 'EVT-12: the seeded arenalayers row must render').toBeVisible({ timeout: 30_000 });
  });
});

// ===========================================================================================
// Route-mount smoke — every event route mounts for the super-role admin (guard admits, no bounce to
// /login). Proves the dashboard route-grants seeded. Skips assertNoFatal (a few screens log benign
// stream/permission noise on cold mount) and only asserts the route does not redirect to /login.
// ===========================================================================================
test.describe('Events — route-mount smoke (guard admits super-role admin)', () => {
  const ROUTES = [
    '/create_event', '/event_participation_approve', '/arena_e_ticket_approve', '/qr-scanner',
    '/event_attendance_log', '/videoask-display', '/arena_space', '/layers-screen',
    '/eventopportunitydashboard', '/initiateeventproduct',
  ];
  test('every seeded event route mounts (no /login bounce)', async ({ page }) => {
    await installEvtStubs(page);
    await loginAsEvtAdmin(page);
    const bounced: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // Bounded settle — NOT networkidle (qr-scanner camera / videoask iframe / live Firestore
      // streams never go idle and would hang the test). The guard's /login redirect, if any, fires
      // by domcontentloaded; 800ms covers the lazy-chunk + guard microtask.
      await page.waitForTimeout(800);
      const url = page.url();
      if (/\/login/.test(url)) bounced.push(`${route} -> ${url}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
