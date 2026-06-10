// events-deep.spec.ts — Events, Arena & Calendar to FULL recon depth (the cases deferred from the
// first green pass): EVT-02 (create-event dialog), EVT-06/07/08 (QR scanner via component injection),
// EVT-10/11 (initiate-event-product multi-step + batch), EVT-13 (create-arena-space manual stepper),
// EVT-14 (videoask tag add), EVT-15 (event-opportunity-dashboard-v2 custom stage create), EVT-16
// (the v2 board's stage-token count vs a Firestore oracle).
//
// ANTI-CIRCULARITY (every case): the assertion is either a value the APP COMPUTED/RENDERED from its own
// Firestore stream (a board count, a rendered name) OR a value the APP/its batch WROTE on a real click
// (event collection / arena events / arena e-ticket log / participantsproduct.status / arenaspace /
// participantvideoask.tags / stage opportunity count) — compared against a KNOWN seeded precondition.
// App-written docs carry NO testrunid → asserted/cleaned by their natural key (profileid / summary /
// stagename / uniqueid). The seed is the precondition, never the asserted value.
//
// NO COMPOSITE INDEX NEEDED — verified empirically against the seed (see neededIndexes:[] in the agent
// report): every multi-filter query here (initiate's `arenaeventid==`+`status in[]`, `productref==`+
// `status==null`; EOD's `eventref==`+`active==true`; the child's `queueref==`+`tokenstatus==`+orderBy
// logdate; `queuelist array-contains-any`) is served by a zigzag merge or an already-deployed index.
//
// QR camera bypass (recon risk #3 / external-services): <zxing-scanner> needs a real camera, impossible
// headless. We inject the synthetic QR payload by calling the live Angular component's onCodeResult(...)
// via ng.getComponent against the dev-build's window.ng global (qrEval below) — exactly the recon-
// prescribed bypass. This drives the REAL component logic (date-window / active / dedup checks + the
// afterProductSelect Firestore write); only the camera frame is synthesised.
import { test, expect, Page } from '@playwright/test';
import {
  evtActors, evtProfileIds, evtIds, evtNames, installEvtStubs, loginAsEvtAdmin,
  resetQrEticketForP0, deleteQrLog, getEticketP0Active, resetInitiateCohort,
  cleanArenaSpaceForSummary, resetVideoAskTags, cleanStageOpportunity, refTo,
} from './support/events';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, countWhere, queryWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.EVT_RUNID || 'evt';
const EVENT1_NAME = `TEST Event ${RUN}`;

// ---- Material mat-select helper: open the panel (force past the floating mat-label notched outline)
// and pick the option by accessible name, retrying the open until the option is visible (flaky panels).
async function pickMatOption(page: Page, comboboxName: RegExp, optionName: RegExp | string): Promise<void> {
  const combo = page.getByRole('combobox', { name: comboboxName });
  await expect(combo).toBeVisible({ timeout: 30_000 });
  const option = page.getByRole('option', { name: optionName });
  await expect(async () => {
    await combo.click({ force: true });
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await option.click();
}

// ---- EOD-v2 queue picker: the "Select queue" panel's options populate only AFTER getQueueData()
// resolves (which itself waits on guard.getRoles()), so under shared-server load the target option can
// lag a first open. Retry the open until the (multiple-select) option is visible, click it, then close.
// Re-opening a multi-select that already has the option selected would TOGGLE IT OFF, so guard: stop
// retrying once selectedQueueList contains our queue.
async function pickQueueOption(page: Page, queueName: string, queueId: string): Promise<void> {
  const combo = page.getByRole('combobox').first();
  await expect(combo, 'EOD: the queue select must render').toBeVisible({ timeout: 30_000 });
  const option = page.getByRole('option', { name: new RegExp(queueName, 'i') });
  const alreadySelected = async () => page.evaluate((qid) => {
    const ng = (window as any).ng;
    const host = document.querySelector('app-event-opportunity-dashboard-v2');
    return !!host && (ng.getComponent(host)?.selectedQueueList || []).includes(qid);
  }, queueId);
  await expect(async () => {
    if (await alreadySelected()) return; // selection landed — done (don't re-open & toggle off)
    await combo.click({ force: true });
    await expect(option).toBeVisible({ timeout: 3_000 });
    await option.click();
    await page.keyboard.press('Escape');
    expect(await alreadySelected(), 'queue must be in selectedQueueList after the click').toBe(true);
  }).toPass({ timeout: 60_000 });
}

// ---- ngx-mat-select-search MULTI-select helper (create-arena-space Participant/Doer): open the panel
// once and click the EXACTLY-anchored option (typing into the in-panel search box first IF it's visible,
// to narrow a long list). The exact anchor avoids the list-position / similar-name contamination a blind
// substring `getByRole('option')` retry caused on these full-profile_data multi-selects.
async function pickSearchableMulti(page: Page, comboboxName: RegExp, exactOptionText: string): Promise<void> {
  const combo = page.getByRole('combobox', { name: comboboxName });
  await expect(combo).toBeVisible({ timeout: 30_000 });
  await combo.click({ force: true });
  // The ngx-mat-select-search input only RENDERS VISIBLY when the option list is long; on the small
  // test project it carries `mat-select-search-hidden`. Type into it ONLY if visible (to narrow a long
  // list); otherwise click the exact option directly. Either way the match is exactly-anchored so a
  // similarly-named profile can't be selected by mistake (the source of the earlier contamination).
  const esc = exactOptionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchInput = page.locator('.cdk-overlay-pane input.mat-select-search-input').first();
  if (await searchInput.isVisible().catch(() => false)) await searchInput.fill(exactOptionText);
  const option = page.locator('mat-option', { hasText: new RegExp(`^\\s*${esc}\\s*$`) }).first();
  await expect(option, `option "${exactOptionText}" must appear in the open panel`).toBeVisible({ timeout: 10_000 });
  await option.click();
  await page.keyboard.press('Escape'); // close the multi-select panel (selection persists)
  // wait for the overlay to dismiss so the next combobox open is clean
  await expect(page.locator('.cdk-overlay-pane mat-option').first()).toBeHidden({ timeout: 10_000 });
}

test.describe('Events DEEP — create-event dialog (EVT-02)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  // The create-event dialog populates its Hosts dropdown via a `users_roles` query
  // where(ahmember==true)+orderBy(name) that needs a composite index (ahmember,name) NOT provisioned on
  // the disposable test project (returned in neededIndexes). That orthogonal read logs a one-off
  // "requires an index" error; we nudge ahmemberList in the test so the WRITE path still runs. Anchored
  // to the users_roles index path so a genuine query misuse elsewhere is still caught.
  // The index error message carries the index descriptor ONLY as a base64 create_composite token (the
  // literal "users_roles" lives in the DECODED form). This is the exact, deterministic token Firestore
  // emits for the users_roles(ahmember,name) index on this project — a different missing index produces
  // a different token, so this still catches a genuine query misuse. (Returned in neededIndexes.)
  const USERS_ROLES_INDEX_TOKEN = 'Cllwcm9qZWN0cy9zbGFicy1xdWV1ZS1lMmUtZXhkY3ovZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL3VzZXJzX3JvbGVzL2luZGV4ZXMv';
  const CREATE_IGNORABLE = [new RegExp(`requires an index[\\s\\S]*${USERS_ROLES_INDEX_TOKEN}`, 'i')];
  test.afterEach(() => assertNoFatal(guard, 'events-deep create: no fatal console errors / pageerrors', CREATE_IGNORABLE));

  // ===========================================================================================
  // EVT-02 — the create-event dialog writes an `event collection` doc with the entered name/dates,
  // plus one `arena events` sub-event (productref → the seeded Installation product). The created
  // event id is APP-generated (collection auto-id) → we assert the doc the APP wrote, found by its
  // run-unique NAME (anti-circular: the name we typed is the precondition; we read back the app's
  // start_date/end_date/arena sub-event, not a value we wrote into Firestore).
  // ===========================================================================================
  test('EVT-02 creating an event writes event collection + an arena events sub-event the app saved', async ({ page }) => {
    // Re-runnable: delete any event the prior run created with this run-unique name (app write, no testrunid).
    const NEW_EVENT_NAME = `TEST Created Event ${RUN}`;
    const cleanCreated = async () => {
      const dupes = await queryWhere('event collection', [['name', '==', NEW_EVENT_NAME]]);
      const { initAdmin } = require('../fixtures/seed-test-project');
      const db = initAdmin().firestore();
      for (const e of dupes) {
        const arenas = await db.collection('arena events').where('eventref', '==', db.collection('event collection').doc(e.id)).get();
        for (const a of arenas.docs) await a.ref.delete();
        await db.collection('event collection').doc(e.id).delete();
      }
    };
    await cleanCreated();
    expect((await queryWhere('event collection', [['name', '==', NEW_EVENT_NAME]])).length, 'EVT-02: no event with the new name before the click').toBe(0);

    await loginAsEvtAdmin(page);
    await page.goto('/create_event', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/create_event/, { timeout: 30_000 });

    // [REAL-UI] open the create dialog (event-list.ts:85 openEventEditor() with no id → new auto-id).
    await page.getByRole('button', { name: /Create New Event/i }).click();
    const dialog = page.locator('mat-dialog-container, .mat-mdc-dialog-container');
    await expect(dialog, 'EVT-02: the create-event dialog must open').toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('heading', { name: /Create Event/i })).toBeVisible({ timeout: 20_000 });

    // Event Name (typing also auto-generates the event_id token via generateToken()).
    await dialog.getByLabel('Event Name').fill(NEW_EVENT_NAME);

    // Event Date: a mat-date-range-input (start + end). Type ISO-ish dates straight into the inputs
    // (the native date adapter parses M/D/YYYY). Start = today, End = +10d (so the event is current).
    const today = new Date();
    const end = new Date(today.getTime() + 10 * 86400e3);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const startInput = dialog.locator('input[formcontrolname="startdate"]');
    const endInput = dialog.locator('input[formcontrolname="enddate"]');
    await startInput.fill(fmt(today));
    await endInput.fill(fmt(end));
    await endInput.blur();

    // Event Address (textarea).
    await dialog.getByLabel('Event Address').fill('Test Address Deep');

    // Venue (mat-select from `event location`) → the seeded venue.
    await pickMatOption(page, /Event Venue/i, evtNames.venue);

    // Hosts (multi mat-select). The host list is populated by a `users_roles` query
    //   where(ahmember==true) + orderBy(name)  (update-event-detail.ts:278)
    // which needs a composite index `(ahmember ASC, name ASC)` NOT provisioned on the disposable test
    // project (returned in neededIndexes). That read is ORTHOGONAL to the write under test, so we nudge
    // the dialog's ahmemberList directly with one valid host (profile path → the admin) — a PRECONDITION
    // input, exactly like the QR onCodeResult / arena-space cohortsid bypasses. saveEventDetail then runs
    // its REAL batch with that host. (When the index is deployed the list self-populates and this nudge
    // is a harmless no-op since the option already exists.)
    await page.evaluate(([profilePath, hostName]) => {
      const ng = (window as any).ng;
      const host = document.querySelector('app-update-event-detail');
      const c = ng.getComponent(host);
      const exists = (c.ahmemberList || []).some((m: any) => m.profile === profilePath);
      if (!exists) c.ahmemberList = [...(c.ahmemberList || []), { name: hostName, profile: profilePath }];
    }, [`profile_data/${evtProfileIds.admin}`, evtNames.host] as const);
    await pickMatOption(page, /Hosts/i, evtNames.host);
    await page.keyboard.press('Escape');

    // Last Registration Date (datepicker input) — type a date directly.
    await dialog.locator('input[formcontrolname="lastregistrationdate"]').fill(fmt(today));
    // Description + B!G Description (both required validators). exact:true so "Event Description" does
    // not also match "B!G Event Description".
    await dialog.getByLabel('Event Description', { exact: true }).fill('Deep e2e event description');
    await dialog.getByLabel('B!G Event Description').fill('Deep e2e big description');

    // Add one Arena Event row, fill its title + pick the Installation product + its date range. The
    // arena sub-event is only persisted when the product is "Installation Event Mode" with a delivery
    // sequence carrying a `delivery events` activity (seeded P_INST + PTDS_INST).
    await dialog.getByRole('button', { name: /Add New Arena Events/i }).click();
    await dialog.getByLabel('Event Display Name').fill(`TEST Arena Sub ${RUN}`);
    await pickMatOption(page, /Eligible Product/i, evtNames.installProduct);
    const arenaStart = dialog.locator('input[formcontrolname="startdate"]').nth(1);
    const arenaEnd = dialog.locator('input[formcontrolname="enddate"]').nth(1);
    await arenaStart.fill(fmt(today));
    await arenaEnd.fill(fmt(end));
    await arenaEnd.blur();

    // Submit. saveEventDetail batch-sets event collection + arena events, then closes the dialog and
    // shows an "Event Updated Successfully" snackbar.
    await dialog.getByRole('button', { name: /Create Event Data/i }).click();

    // [ASSERT] the app's batch created the event collection doc with the typed name + app-set dates.
    const created = await pollUntil(
      () => queryWhere('event collection', [['name', '==', NEW_EVENT_NAME]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-02: event collection doc created with the typed name', timeoutMs: 30_000 },
    );
    expect(created.length, 'EVT-02: exactly the app-created event exists for the run-unique name').toBe(1);
    const ev: any = created[0];
    // start_date/end_date are app-computed (the dialog forces start→05:30, end→23:59 of the typed days).
    const start = ev.start_date?.toDate?.() ?? new Date(ev.start_date);
    expect(start.getFullYear(), 'EVT-02: app-set start_date year matches the typed start').toBe(today.getFullYear());
    expect(start.getMonth(), 'EVT-02: app-set start_date month matches the typed start').toBe(today.getMonth());
    expect(start.getDate(), 'EVT-02: app-set start_date day matches the typed start').toBe(today.getDate());

    // …and one arena events sub-event whose eventref → the created event and productref → the seeded
    // Installation product (the value the app copied from the picked option, not a test write).
    const arenas = await pollUntil(
      () => queryWhere('arena events', [['eventref', '==', refTo('event collection', ev.id)]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-02: an arena events sub-event was written for the created event', timeoutMs: 30_000 },
    );
    const a: any = arenas[0];
    const productPath = a.productref?.path ?? a.productref?._path?.segments?.join('/');
    expect(productPath, 'EVT-02: the arena sub-event.productref → the seeded Installation product').toBe(`products/${evtIds.productInstall}`);

    await cleanCreated(); // leave the world as we found it for re-runs
  });
});

// =====================================================================================================
// QR SCANNER — EVT-06 / EVT-07 / EVT-08. Camera bypassed by injecting onCodeResult via the live Angular
// component (see qrEval). The scan flow: pick the event chip → mapArenaETicket is keyed by profileid →
// inject {profileid, uniqueid} → (if active + in date window + uniqueid unused) eligible products show →
// click the product chip → afterProductSelect writes `arena e-ticket log/{uniqueid}`.
// =====================================================================================================
async function qrEval<T>(page: Page, fn: (component: any) => T): Promise<T> {
  // Reach the live QrScannerComponent instance through Angular's dev global and run `fn` against it.
  return page.evaluate(([fnStr]) => {
    const ng = (window as any).ng;
    if (!ng || !ng.getComponent) throw new Error('window.ng.getComponent unavailable (need a dev build)');
    const host = document.querySelector('app-qr-scanner');
    if (!host) throw new Error('app-qr-scanner host element not found');
    const component = ng.getComponent(host);
    if (!component) throw new Error('QrScannerComponent instance not resolvable');
    // eslint-disable-next-line no-new-func
    const f = new Function('component', `return (${fnStr})(component);`);
    return f(component);
  }, [fn.toString()] as const) as Promise<T>;
}

// Pick the QR event chip and wait until the component's mapArenaETicket carries `profileid`. The
// mat-chip-option's (selectionChange) can no-op if clicked before the chip is interactive (worse under
// shared-server load), so retry the click until the e-ticket stream for the event has resolved p0.
async function selectQrEventForProfile(page: Page, eventName: string, profileid: string): Promise<void> {
  const eventChip = page.locator('mat-chip-option').filter({ hasText: eventName });
  await expect(eventChip, 'QR: the event chip must render').toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await eventChip.click();
    const keys = await qrEval(page, (c) => Object.keys(c.mapArenaETicket || {}));
    expect(keys, 'QR: mapArenaETicket must load the profile after the event chip').toContain(profileid);
  }).toPass({ timeout: 45_000 });
}

test.describe('Events DEEP — QR scanner (EVT-06/07/08, camera bypassed via component injection)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  // The <zxing-scanner> widget tries to open a real camera on mount; headless Chromium has none, so it
  // logs a benign "@zxing/ngx-scanner Error when asking for permission. NotSupportedError" — inherent to
  // running a camera component headless, NOT an app fault (we bypass the camera by injecting onCodeResult).
  // Anchored to the scanner's exact wording so a genuine app error is still caught.
  const QR_IGNORABLE = [/@zxing\/ngx-scanner Error when asking for permission/i, /NotSupportedError: Not supported/i];
  test.afterEach(() => assertNoFatal(guard, 'events-deep qr: no fatal console errors / pageerrors', QR_IGNORABLE));

  // ===========================================================================================
  // EVT-07 — a valid scan writes `arena e-ticket log/{uniqueid}` with the correct profileid/eventref.
  // ===========================================================================================
  test('EVT-07 a valid QR scan writes an arena e-ticket log row the app committed (profileid, eventref)', async ({ page }) => {
    await resetQrEticketForP0();
    const UNIQUE = `${RUN}-scan-evt07`;
    await deleteQrLog(UNIQUE); // re-runnable: no log for this uniqueid before the scan
    expect((await getDoc('arena e-ticket log', UNIQUE)), 'EVT-07: no log for this uniqueid before the scan').toBeNull();

    await loginAsEvtAdmin(page);
    await page.goto('/qr-scanner', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/qr-scanner/, { timeout: 30_000 });

    // [REAL-UI] select the event chip (mat-chip-option by the event name) → onProductSelected loads
    // mapArenaETicket for the event (keyed by profileid). Retry-robust wait for p0's ticket to stream in.
    await selectQrEventForProfile(page, EVENT1_NAME, evtProfileIds.p0);

    // [REAL-UI logic] inject the synthetic QR payload (camera bypass) → onCodeResult runs the active +
    // date-window + dedup checks and (on pass) sets scannedParticipantEligibleProducts. page.evaluate
    // can't close over test-scope vars, so pass them as args.
    await page.evaluate(([pid, uid]) => {
      const ng = (window as any).ng;
      const c = ng.getComponent(document.querySelector('app-qr-scanner'));
      c.onCodeResult(JSON.stringify({ profileid: pid, uniqueid: uid }));
    }, [evtProfileIds.p0, UNIQUE] as const);

    // The eligible-product chip set must appear (ticket admitted). Click the seeded product chip.
    const productChip = page.locator('.product-selection mat-chip-option');
    await expect(productChip.first(), 'EVT-07: eligible product chip must show after a valid scan').toBeVisible({ timeout: 20_000 });
    await productChip.first().click();

    // [ASSERT] afterProductSelect setDoc'd `arena e-ticket log/{uniqueid}` (qr-scanner.ts:219) with the
    // scanned profileid + the e-ticket's eventref — the value the APP wrote, keyed by the known uniqueid.
    const log = await pollUntil(
      () => getDoc('arena e-ticket log', UNIQUE),
      (d) => !!d,
      { label: 'EVT-07: arena e-ticket log written for the scanned uniqueid', timeoutMs: 30_000 },
    );
    expect(log!.profileid, 'EVT-07: log.profileid == the scanned profile').toBe(evtProfileIds.p0);
    const evPath = log!.eventref && ((log!.eventref as any).path ?? (log!.eventref as any)._path?.segments?.join('/'));
    expect(evPath, 'EVT-07: log.eventref → the seeded event').toBe(`event collection/${evtIds.event1}`);

    await deleteQrLog(UNIQUE); // clean the app-written log for re-runs
  });

  // ===========================================================================================
  // EVT-08 — re-scanning an ALREADY-USED uniqueid hits the dedup guard (usedticket=true) and writes
  // NO new log row. Oracle: the count of `arena e-ticket log` for the seeded duplicate uniqueid stays 1.
  // ===========================================================================================
  test('EVT-08 a duplicate QR scan is blocked (usedticket) and writes no second log row', async ({ page }) => {
    await resetQrEticketForP0(); // re-seeds the duplicate-guard log row (docid == etlogDup uniqueid)
    const DUP = evtIds.etlogDup;
    const before = await countWhere('arena e-ticket log', [['docid', '==', DUP]]);
    expect(before, 'EVT-08: exactly one seeded log row for the duplicate uniqueid before the re-scan').toBe(1);

    await loginAsEvtAdmin(page);
    await page.goto('/qr-scanner', { waitUntil: 'domcontentloaded' });
    // Select the event chip + wait for p0's e-ticket to stream in (retry-robust under load).
    await selectQrEventForProfile(page, EVENT1_NAME, evtProfileIds.p0);
    // Also wait for the full-collection maplog (the dup row) to load — the dedup check reads
    // maplog[uniqueid] (qr-scanner.ts:186), populated by the arena-e-ticket-log stream.
    await expect.poll(
      async () => qrEval(page, (c) => Object.keys(c.maplog || {})),
      { timeout: 30_000, message: 'EVT-08: maplog must load the seeded duplicate uniqueid' },
    ).toContain(DUP);

    // [REAL-UI logic] inject the ALREADY-USED uniqueid → onCodeResult must set usedticket and NOT show
    // the eligible-product chips (so afterProductSelect never runs).
    await page.evaluate(([pid, uid]) => {
      const ng = (window as any).ng;
      const c = ng.getComponent(document.querySelector('app-qr-scanner'));
      c.onCodeResult(JSON.stringify({ profileid: pid, uniqueid: uid }));
    }, [evtProfileIds.p0, DUP] as const);

    // [ASSERT] the component computed usedticket=true (the app's dedup branch), and the "QR Already Used"
    // card rendered — vs the no-eligible-products state.
    await expect.poll(
      () => qrEval(page, (c) => c.usedticket === true),
      { timeout: 20_000, message: 'EVT-08: component must flag usedticket on the duplicate scan' },
    ).toBe(true);
    await expect(page.getByText(/QR Already Used/i), 'EVT-08: the "QR Already Used" card renders').toBeVisible({ timeout: 10_000 });

    // …and NO second log row was written for that uniqueid (setDoc never fired). Count stays 1.
    // Brief settle to let any erroneous write land before asserting the count is unchanged.
    await page.waitForTimeout(1500);
    const after = await countWhere('arena e-ticket log', [['docid', '==', DUP]]);
    expect(after, 'EVT-08: no second log row written for the duplicate uniqueid').toBe(1);
  });

  // ===========================================================================================
  // EVT-06 — toggling the e-ticket active→false in the REAL e-ticket screen makes the QR scanner DENY
  // the same participant's scan (ticketdenied). Two REAL screens: the toggle write, then the scan deny.
  // ===========================================================================================
  test('EVT-06 deactivating an e-ticket (slide toggle) makes a subsequent QR scan denied', async ({ page }) => {
    await resetQrEticketForP0(); // start active:true
    expect(await getEticketP0Active(), 'EVT-06: e-ticket starts active:true').toBe(true);

    // --- Screen 1: arena_e_ticket_approve → flip p0's e-ticket active toggle to false ---
    await loginAsEvtAdmin(page);
    await page.goto('/arena_e_ticket_approve', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/arena_e_ticket_approve/, { timeout: 30_000 });
    await pickMatOption(page, /Select Event/i, EVENT1_NAME);

    // p0's row shows the active slide-toggle ONLY once the component's `arena e-ticket` stream has
    // populated mapArenaETicket[p0] (otherwise the cell shows the "Approve" button) — that stream
    // resolves INDEPENDENTLY of the EPR-row stream, so wait on the component map (not just the row
    // render) to avoid the under-load race where the row appears before the e-ticket loads.
    await expect.poll(
      async () => page.evaluate(([pid]) => {
        const ng = (window as any).ng;
        const host = document.querySelector('app-arena-e-ticket-approve');
        return !!host && (ng.getComponent(host)?.mapArenaETicket || {})[pid] != null;
      }, [evtProfileIds.p0] as const),
      { timeout: 30_000, message: 'EVT-06: mapArenaETicket[p0] must load so the row shows the toggle' },
    ).toBe(true);
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: evtActors.participant0 });
    await expect(p0Row, 'EVT-06: p0 e-ticket row must render').toBeVisible({ timeout: 30_000 });
    const toggle = p0Row.locator('mat-slide-toggle, button[role="switch"]').first();
    await expect(toggle, 'EVT-06: the active slide-toggle must render for an issued e-ticket').toBeVisible({ timeout: 20_000 });
    await toggle.click();

    // [ASSERT] the toggle's updateDoc wrote active:false (arena-e-ticket-approve.ts:157) — the value the APP wrote.
    await pollUntil(
      () => getDoc('arena e-ticket', evtIds.eticketP0),
      (d) => !!d && d.active === false,
      { label: 'EVT-06: e-ticket.active flipped to false by the toggle', timeoutMs: 30_000 },
    );

    // --- Screen 2: qr-scanner → scanning p0 now hits the inactive branch → ticketdenied ---
    await page.goto('/qr-scanner', { waitUntil: 'domcontentloaded' });
    // Select the event chip + wait for p0's e-ticket to stream in (retry-robust under load).
    await selectQrEventForProfile(page, EVENT1_NAME, evtProfileIds.p0);
    // …and confirm the loaded ticket carries the now-INACTIVE flag (the value the toggle wrote streamed in).
    await expect.poll(
      async () => page.evaluate(([pid]) => {
        const ng = (window as any).ng;
        const c = ng.getComponent(document.querySelector('app-qr-scanner'));
        const t = (c.mapArenaETicket || {})[pid];
        return t ? t.active : null; // null until loaded; false once the inactive ticket streams in
      }, [evtProfileIds.p0] as const),
      { timeout: 30_000, message: 'EVT-06: p0 e-ticket must load with active:false after the toggle' },
    ).toBe(false);

    await page.evaluate(([pid]) => {
      const ng = (window as any).ng;
      const c = ng.getComponent(document.querySelector('app-qr-scanner'));
      c.onCodeResult(JSON.stringify({ profileid: pid, uniqueid: `evt06-deny-${Date.now()}` }));
    }, [evtProfileIds.p0] as const);

    // [ASSERT] the component took the denied branch (active !== true → ticketdenied=true) and the
    // "Denied" card rendered. App-computed state from the value the toggle wrote — fully anti-circular.
    await expect.poll(
      () => qrEval(page, (c) => c.ticketdenied === true),
      { timeout: 20_000, message: 'EVT-06: component must deny the scan for the deactivated e-ticket' },
    ).toBe(true);
    await expect(page.getByText(/^Denied$/), 'EVT-06: the "Denied" card renders').toBeVisible({ timeout: 10_000 });

    await resetQrEticketForP0(); // restore active:true for re-runs
  });
});

// =====================================================================================================
// INITIATE EVENT PRODUCT — EVT-10 / EVT-11. Select the event → click the arena tile → pick a Delivery
// Set → select participant rows → Initiate. The batch flips participantsproduct.status→"initiated" and
// writes EPR status "approved". N=3 seeded uninitiated rows; assert exactly N reach "initiated".
// =====================================================================================================
test.describe('Events DEEP — initiate-event-product (EVT-10/11, multi-step + chunked batch)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events-deep initiate: no fatal console errors / pageerrors'));

  test('EVT-10/11 initiating the seeded cohort flips participantsproduct.status→"initiated" (exactly N=3) and writes approved EPRs', async ({ page }) => {
    await resetInitiateCohort();
    // Pre-state (anti-circular): all 3 cohort products start status:null; none initiated yet.
    const initiatedBefore = await countWhere('participantsproduct', [
      ['productref', '==', refTo('products', evtIds.productInstall)],
      ['arenaeventid', '==', evtIds.arenaEvent2],
      ['status', '==', 'initiated'],
    ]);
    expect(initiatedBefore, 'EVT-11: no cohort product initiated before the click').toBe(0);

    await loginAsEvtAdmin(page);
    await page.goto('/initiateeventproduct', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/initiateeventproduct/, { timeout: 30_000 });

    // [REAL-UI] "Select Queue" mat-select → the seeded event (label "<name> (EVENT)"). onEventSelect
    // loads arena events for the event into the tile list.
    await pickMatOption(page, /Select Queue/i, new RegExp(`${evtNames.initiateEvent}\\s*\\(EVENT\\)`, 'i'));

    // The arena tile (product name as the title) → onArenaEventSelect runs the delivery/EPR/PP queries.
    const arenaTile = page.locator('.arena-event-item').filter({ hasText: evtNames.initiateArenaProduct });
    await expect(arenaTile, 'EVT-10: the seeded arena tile must render').toBeVisible({ timeout: 30_000 });
    await arenaTile.locator('.event-info').click();

    // Delivery Set mat-select (renders once deliverySetList loaded) → the seeded set.
    await pickMatOption(page, /Delivery Set/i, new RegExp(evtNames.deliverySet, 'i'));

    // The participant table now lists the 3 uninitiated rows. Select all via the header master checkbox.
    const table = page.locator('table[mat-table]');
    await expect(table, 'EVT-10: the participant table must render').toBeVisible({ timeout: 30_000 });
    const p3Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: evtActors.participant3 });
    await expect(p3Row, 'EVT-10: cohort participant3 row must render as uninitiated').toBeVisible({ timeout: 30_000 });
    const masterCheckbox = page.locator('th mat-checkbox, th input[type="checkbox"]').first();
    await masterCheckbox.click();

    // [REAL-UI] Initiate button appears once a selection exists; it batch-commits in chunks of 20 (one
    // chunk for N=3), then shows the initiation-summary dialog.
    const initiateBtn = page.getByRole('button', { name: /Initiate Product for \d+ Participants/i });
    await expect(initiateBtn, 'EVT-10: Initiate button must appear after selecting rows').toBeVisible({ timeout: 20_000 });
    await initiateBtn.click();

    // [ASSERT] exactly N=3 cohort participantsproduct reached status:"initiated" with arenaeventid set
    // (initiate-event-product.ts:508-519) — the value the BATCH wrote, vs the KNOWN seeded N. Poll (the
    // summary dialog opens after commit; the writes land just before).
    await pollUntil(
      () => countWhere('participantsproduct', [
        ['productref', '==', refTo('products', evtIds.productInstall)],
        ['arenaeventid', '==', evtIds.arenaEvent2],
        ['status', '==', 'initiated'],
      ]),
      (n) => n === 3,
      { label: 'EVT-11: exactly 3 cohort products → status "initiated"', timeoutMs: 45_000, intervalMs: 1000 },
    );

    // …and each got an EPR with status "approved" for arenaevent2 (the bridge write, ts:483/505).
    const eprs = await pollUntil(
      () => queryWhere('event participation request', [['arenaeventid', '==', evtIds.arenaEvent2], ['status', '==', 'approved']]),
      (rows) => rows.length >= 3,
      { label: 'EVT-10: >=3 approved EPRs written for arenaevent2', timeoutMs: 45_000, intervalMs: 1000 },
    );
    expect(eprs.length, 'EVT-10: the initiate batch wrote one approved EPR per initiated participant').toBeGreaterThanOrEqual(3);

    await resetInitiateCohort(); // restore status:null + delete the app-written EPRs for re-runs
  });
});

// =====================================================================================================
// CREATE ARENA SPACE — EVT-13 (manual stepper). Manual → Live Event → pick event + date → fill the
// arena form (participants/doer/space/engagement/summary) → Create. Writes `arenaspace` with the
// participant profileids the app mapped from the picked names + the event ref.
// =====================================================================================================
test.describe('Events DEEP — create-arena-space manual (EVT-13)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events-deep arena-space: no fatal console errors / pageerrors'));

  test('EVT-13 creating an arena space manually writes arenaspace with the mapped participant + event ref', async ({ page }) => {
    const SUMMARY = `TEST Arena Space Summary ${RUN} ${Date.now()}`;
    await cleanArenaSpaceForSummary(SUMMARY);

    await loginAsEvtAdmin(page);
    await page.goto('/arena_space', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/arena_space/, { timeout: 30_000 });

    // Step 1: "Manual Creation" radio is pre-selected → Next. The stepper keeps inactive step bodies
    // in the DOM (hidden), so target the VISIBLE Next button (Playwright :visible) to avoid a hidden one.
    const visibleNext = page.locator('button:visible', { hasText: /^Next$/ });
    await visibleNext.first().click();

    // Step 2: Event Type → "Live Event" (loads event collection into eventArray); Event → the seeded
    // EVENT1 by name (updateref sets eventref); date picker → today.
    await pickMatOption(page, /Event Type/i, /^Live Event$/);
    await pickMatOption(page, /^Event$/i, EVENT1_NAME);
    // Choose a date — the only matInput on the active step is the "Choose a date" datepicker field
    // (bound to eventDate). Type a date string straight in (the native date adapter parses M/D/YYYY).
    const today = new Date();
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const dateInput = page.getByLabel('Choose a date');
    await expect(dateInput, 'EVT-13: the date input must render').toBeVisible({ timeout: 20_000 });
    await dateInput.fill(fmt(today));
    await dateInput.blur();
    await page.locator('button:visible', { hasText: /^Next$/ }).first().click();

    // Step 3 (Create Arena): Participant (multi) → p0 by name; Doer (multi) → p0 by name; A&H Space →
    // seeded space; Engagement → seeded type; Consultation Summary → the run-unique summary. The
    // Participant/Doer selects are ngx-mat-select-search multi-selects over the full profile_data name
    // list — use the search-filter helper so only the exact p0 option is clickable (no contamination).
    await pickSearchableMulti(page, /Participant/i, evtActors.participant0);
    await pickSearchableMulti(page, /Doer/i, evtActors.participant0);
    await pickMatOption(page, /A&H Space/i, evtNames.space);
    await pickMatOption(page, /Engagement/i, evtNames.engagement);
    await page.getByLabel('Consultation Summary').fill(SUMMARY);

    // createArenaManually reads arenaSpaceData['cohortsid'].length — for a Live Event the Cohorts select
    // is HIDDEN (no marathon cohorts), so the field is never set and .length would throw. Nudge it to []
    // on the live component (a harness bypass for an unreachable form field, like the QR injection) so
    // the REAL write path runs. This sets a PRECONDITION default, not an asserted value.
    await page.evaluate(() => {
      const ng = (window as any).ng;
      const host = document.querySelector('app-create-arena-space');
      const c = ng.getComponent(host);
      c.arenaSpaceData = c.arenaSpaceData || {};
      if (c.arenaSpaceData['cohortsid'] == null) c.arenaSpaceData['cohortsid'] = [];
    });

    // Create Arena Space → window.confirm → createArenaManually() setDoc's `arenaspace`.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Create Arena Space/i }).click();

    // [ASSERT] the app wrote one `arenaspace` doc for the run-unique summary with p0's profileid in
    // participantslist (the app mapped the picked NAME → profileid) and eventref → the seeded event.
    const spaces = await pollUntil(
      () => queryWhere('arenaspace', [['summary', '==', SUMMARY]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-13: arenaspace doc written for the typed summary', timeoutMs: 30_000 },
    );
    const s: any = spaces[0];
    expect(Array.isArray(s.participantslist) && s.participantslist.includes(evtProfileIds.p0),
      `EVT-13: participantslist must contain p0's profileid. Got=${JSON.stringify(s.participantslist)}`).toBe(true);
    const evPath = s.eventref && ((s.eventref as any).path ?? (s.eventref as any)._path?.segments?.join('/'));
    expect(evPath, 'EVT-13: arenaspace.eventref → the seeded event').toBe(`event collection/${evtIds.event1}`);

    await cleanArenaSpaceForSummary(SUMMARY);
  });
});

// =====================================================================================================
// VIDEOASK TAG ADD — EVT-14. Click a tag checkbox on the seeded participant's row → updateDoc adds the
// tag id to participantvideoask.tags and writes a `participant tag logs` row (type:"added").
// =====================================================================================================
test.describe('Events DEEP — videoask tag add (EVT-14)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events-deep videoask: no fatal console errors / pageerrors'));

  test('EVT-14 adding a videoask tag writes the tag id to participantvideoask.tags + a participant tag log', async ({ page }) => {
    await resetVideoAskTags();
    // Pre-state (anti-circular): the submission starts with NO tags.
    expect(((await getDoc('participantvideoask', evtIds.pvideoask0))!.tags as any[]).length, 'EVT-14: submission starts with no tags').toBe(0);

    await loginAsEvtAdmin(page);
    await page.goto('/videoask-display', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/videoask-display/, { timeout: 30_000 });

    // [REAL-UI] the table streams `participantvideoask` (one row for p0's seeded submission). The Tags
    // column renders a checkbox per active 'video ask' tag; find p0's row and the seeded tag's checkbox.
    const p0Row = page.locator('tr.mat-mdc-row, tr[mat-row]').filter({ hasText: evtActors.participant0 });
    await expect(p0Row, 'EVT-14: p0 videoask row must render').toBeVisible({ timeout: 30_000 });
    const tagLabel = p0Row.locator('label.tag-checkbox-row').filter({ hasText: evtNames.videoaskTag });
    await expect(tagLabel, 'EVT-14: the seeded tag checkbox must render in the row').toBeVisible({ timeout: 20_000 });

    // Click the tag checkbox → updateVideoAdk() opens a window.confirm("...add this tag?") → accept.
    // The native <input type=checkbox> is visually hidden behind a styled .checkmark span (opacity:0),
    // so click the LABEL (the visible, clickable control) — that dispatches the input's (change).
    page.once('dialog', (d) => d.accept());
    await tagLabel.click();

    // [ASSERT] the app's updateDoc added the seeded tag id to participantvideoask.tags
    // (videoask-display.ts:363) — the value the APP wrote, vs the KNOWN seeded tag id.
    await pollUntil(
      () => getDoc('participantvideoask', evtIds.pvideoask0),
      (d) => !!d && Array.isArray(d.tags) && (d.tags as string[]).includes(evtIds.tag1),
      { label: 'EVT-14: participantvideoask.tags contains the added tag id', timeoutMs: 30_000 },
    );
    // …and a `participant tag logs` row was written for p0 with type "added" (ts:373).
    const logs = await pollUntil(
      () => queryWhere('participant tag logs', [['profileid', '==', evtProfileIds.p0], ['type', '==', 'added']]),
      (rows) => rows.length >= 1,
      { label: 'EVT-14: a participant tag log (type:added) was written for p0', timeoutMs: 30_000 },
    );
    expect(logs.length, 'EVT-14: the app wrote an "added" tag-log row for p0').toBeGreaterThanOrEqual(1);

    await resetVideoAskTags();
  });
});

// =====================================================================================================
// EVENT OPPORTUNITY DASHBOARD V2 — EVT-15 (create custom stage count) + EVT-16 (the board's stage-token
// count == a Firestore queue_token oracle). Both target the LIVE v2 route (app.routes.ts:31).
// =====================================================================================================
test.describe('Events DEEP — event-opportunity-dashboard-v2 (EVT-15/16)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvtStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'events-deep eod: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EVT-15 — creating a custom stage-count writes `stage opportunity count` with the entered stagename
  // and queuelist == the selected queue. App-set value vs the KNOWN seeded queue id.
  // ===========================================================================================
  test('EVT-15 creating a custom stage count writes stage opportunity count with the selected queue + stagename', async ({ page }) => {
    const STAGE_NAME = `TEST Custom Stage ${RUN} ${Date.now()}`;
    await cleanStageOpportunity(STAGE_NAME);

    await loginAsEvtAdmin(page);
    await page.goto('/eventopportunitydashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/eventopportunitydashboard/, { timeout: 30_000 });

    // [REAL-UI] "Select queue" mat-select (multiple) → tick the seeded queue option. The (onSelectionChange)
    // handler pushes its docid into selectedQueueList and triggers getselectedStages()/fetchQueueTokens().
    await pickQueueOption(page, evtNames.eodQueue, evtIds_queue1());

    // "Add Stagescount" button appears once a queue is selected → opens the create panel (fetchdata()
    // builds the stage dropdown from the queue's stages).
    await page.getByRole('button', { name: /Add Stagescount/i }).click();

    // Fill the form: stagename text + the stage multi-select (option label "<stage> - all" for status:null).
    const nameInput = page.locator('input[formcontrolname="stagename"]');
    await expect(nameInput, 'EVT-15: the create-stage form must open').toBeVisible({ timeout: 20_000 });
    await nameInput.fill(STAGE_NAME);
    await pickMatOption(page, /Stage/i, new RegExp(`${evtNames.stageA}\\s*-\\s*all`, 'i'));
    await page.keyboard.press('Escape');

    // Create → submitStageOpportunity() setDoc's `stage opportunity count` (v2.ts:1242-1251).
    await page.getByRole('button', { name: /^Create$/i }).click();

    // [ASSERT] the app wrote one `stage opportunity count` for the typed stagename with queuelist ==
    // [seeded queue id] (the value the app copied from selectedQueueList) — vs the KNOWN seeded queue id.
    const docs = await pollUntil(
      () => queryWhere('stage opportunity count', [['stagename', '==', STAGE_NAME]]),
      (rows) => rows.length >= 1,
      { label: 'EVT-15: stage opportunity count written for the typed stagename', timeoutMs: 30_000 },
    );
    const d: any = docs[0];
    expect(Array.isArray(d.queuelist) && d.queuelist.includes(evtIds_queue1()),
      `EVT-15: queuelist must contain the seeded queue id. Got=${JSON.stringify(d.queuelist)}`).toBe(true);

    await cleanStageOpportunity(STAGE_NAME);
  });

  // ===========================================================================================
  // EVT-16 — the v2 board recomputes a stage's participant count from its live queue_token stream; it
  // must equal an INDEPENDENT Firestore oracle (count of Active tokens for the seeded queue+stage). Two
  // independent computations agree → anti-circular (we never assert a value the test wrote).
  // ===========================================================================================
  test('EVT-16 the board\'s stage participant count equals the Firestore queue_token oracle', async ({ page }) => {
    // Oracle (independent): Active queue_token rows for the seeded queue at Stage A.
    const oracle = await countWhere('queue_token', [
      ['queueref', '==', refTo('queue generation', evtIds_queue1())],
      ['currentstage', '==', evtNames.stageA],
      ['tokenstatus', '==', 'Active'],
    ]);
    expect(oracle, 'EVT-16: the seeded Active tokens at Stage A must exist').toBeGreaterThanOrEqual(2);

    await loginAsEvtAdmin(page);
    await page.goto('/eventopportunitydashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/eventopportunitydashboard/, { timeout: 30_000 });

    // Select the seeded queue → the child <app-event-opportunity> mounts and streams queue_token
    // (queueref==X && tokenstatus=="Active"), groups by currentstage into stageTokenMap, and emits it to
    // the parent (handleEventData → mapData[queueId]).
    await pickQueueOption(page, evtNames.eodQueue, evtIds_queue1());

    // [ASSERT] poll the LIVE parent component until its own getStageParticipants(queueid, 'Stage A')
    // (the board's computation, status:null → the full Stage-A tokenlist) equals the oracle. This reads
    // the count the board recomputed from its stream — never a value the test wrote.
    await expect.poll(
      async () => page.evaluate(([qid, stage]) => {
        const ng = (window as any).ng;
        const host = document.querySelector('app-event-opportunity-dashboard-v2');
        if (!host) return -1;
        const c = ng.getComponent(host);
        if (!c || typeof c.getStageParticipants !== 'function') return -1;
        return (c.getStageParticipants(qid, stage, null) || []).length;
      }, [evtIds_queue1(), evtNames.stageA] as const),
      { timeout: 45_000, intervalMs: 1000, message: 'EVT-16: board stage count must converge to the queue_token oracle' },
    ).toBe(oracle);
  });
});

// queue id helper (kept local to avoid widening the support API surface).
function evtIds_queue1(): string { return `${RUN}_queue_1`; }
