// purchase.spec.ts — Journey & Products PARTICIPANT screens (purchase + journey-support RENDER) plus a
// route-mount smoke. REAL Angular screens, ANTI-CIRCULAR assertions, test-project Firestore only.
//
// Recon: e2e/recon-allcomp/journey-products.md (JP-05, JP-07; dashboards = render smoke).
// WATSON (GROUP NOTES, R-02): journey-product-purchase + journeyplan lazily getApp("watson"), which the
// test build never initialises → the init THROWS (an unhandled rejection / console error tolerated by
// attachJourneyGuard). We do NOT drive any Watson action; we assert ONLY values the app computed from the
// TEST project (the participant name + the journey it resolved from journeyref, and the seeded
// participantjourneyproduct count). The Watson-coupled "Mark as Onboarded" write (JP-08) and the
// onboarding-email-archive write (JP-09) are NOT shipped — see README/blockers (the mark button is gated
// off behind paymentplan!=null which we deliberately keep null, and the OnboardingRemark dialog is a
// 1000-line Watson/email flow). Anti-circularity: seeds are PRECONDITIONS; assertions are app-computed/read.
import { test, expect } from '@playwright/test';
import {
  journeyNames, installJourneyStubs, attachJourneyGuard, loginAsJourneyAdmin, PID,
} from './support/journey';
import { assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { countWhere } from '../queue/support/firestore-admin';

const RUN = process.env.JNY_RUNID || 'jny';

test.describe('Journey & Products — purchase screen (render, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachJourneyGuard(page);
    await installJourneyStubs(page);
  });
  // The participantpurchase screen reads the WATSON prod secondary app (getFirestore(getApp("watson")),
  // journey-product-purchase.component.ts:191 → watsonParticipantPurchase() collection() at :276/:290) for
  // the legacy "Watson Purchases" widget. That app is intentionally NOT initialized in the e2e/test
  // environment (we never wire a cross-project Watson reader), so watsonDatabase is undefined and collection()
  // throws a benign FirebaseError — the screen still renders the Firestore (test-project) purchases we assert.
  // Tolerate ONLY that tightly-anchored class (the screen's own behavior is fully asserted by the body).
  const WATSON_ABSENT = [/Expected first argument to collection\(\) to be a CollectionReference/];
  test.afterEach(() => assertNoFatal(guard, 'journey purchase screen: no fatal console errors / pageerrors', WATSON_ABSENT));

  // ===========================================================================================
  // JP-05 — participantpurchase/:pid renders the participant + their seeded journey purchases
  // ===========================================================================================
  test('JP-05 participantpurchase renders the seeded participant name and journey purchases', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto(`/participantpurchase/${PID}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participantpurchase/, { timeout: 30_000 });

    // [REAL-UI] the component reads profile_data/{pid} and renders the title "Participant Purchase - {name}".
    // profile_data.name is the seeded participant EMAIL (seedAuthChain writes name=email for the auth chain),
    // so the title renders the email — a value the APP read from Firestore (journey-product-purchase.ts:275),
    // never a test write.
    await expect(
      page.getByRole('heading', { name: new RegExp(`Participant Purchase - participant0\\+${RUN}@example\\.com`, 'i') }),
      'JP-05: the title must render the participant the app read from profile_data',
    ).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] fetchPurchase() builds one purchase row per `participantjourneyproduct` doc for this pid and
    // resolves each journeyref to its journey NAME (mapJourney). Each journey purchase renders a "Journey"
    // mat-select whose VALUE is the resolved journey name — the value the APP computed from its Firestore
    // reads. The seeded journey must appear as the selected value.
    const journeySelects = page.getByRole('combobox', { name: /^Journey$/i });
    await expect(
      journeySelects.first(), 'JP-05: a Journey select renders for the seeded journey purchase',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      journeySelects.first(), 'JP-05: the Journey select resolves to the seeded journey name from journeyref',
    ).toContainText(journeyNames.journey1);

    // [ASSERT] the rows the app rendered are backed by the exact set of seeded `participantjourneyproduct`
    // docs: 2 PJP docs exist for this profileid (the value Firestore holds — the app's read source), and the
    // "Journey Status" select (one per journey purchase) renders at least that many times.
    const pjpCount = await countWhere('participantjourneyproduct', [['profileid', '==', PID]]);
    expect(pjpCount, 'JP-05: exactly the 2 seeded journey-purchase docs exist for this participant').toBe(2);
    const journeyStatusSelects = page.getByRole('combobox', { name: /Journey Status/i });
    await expect(
      journeyStatusSelects.first(), 'JP-05: a Journey Status control renders for the seeded journey purchase',
    ).toBeVisible({ timeout: 30_000 });
    expect(
      await journeyStatusSelects.count(),
      'JP-05: the app renders one Journey-Status control per seeded journey purchase (>=2)',
    ).toBeGreaterThanOrEqual(pjpCount);
  });
});

// ===========================================================================================
// JP-07 — journeysupport/:pid render. NOTE: this screen does NOT use afterEach assertNoFatal.
// journeyplan.component.ts:167 (`data["detailpage.workshopStartDate"].toDate()`) is an UNGUARDED
// pre-existing app bug in the unrelated "upcoming workshops" widget: it queries `workshopconfiguration
// where detailpage.workshopStartDate >= monthStart` and 3 SHARED-PROJECT docs seeded by the WORKSHOPS
// suite (wshop_W_dash/active/inactive) match that nested-key query but carry NO `detailpage.workshopStartDate`
// value, so `.toDate()` throws "Cannot read properties of undefined (reading 'toDate')". That fires in a
// fire-and-forget getDocs().then() that only populates the upcoming-workshop chips — the Journey Support
// screen still renders the participant + onboarding state we assert. Gating JP-07 on assertNoFatal would
// fail it for a cross-suite-data artifact OUTSIDE the journey flow, so we assert the FUNCTIONAL render
// instead (the brief allows a render case to skip assertNoFatal). See blockers (B-3).
// ===========================================================================================
test.describe('Journey & Products — journey support (render; cross-suite workshop-widget bug tolerated)', () => {
  test.beforeEach(async ({ page }) => { await installJourneyStubs(page); });

  test('JP-07 journeysupport renders the participant initiated journey and the not-yet-onboarded state', async ({ page }) => {
    await loginAsJourneyAdmin(page);
    await page.goto(`/journeysupport/${PID}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/journeysupport/, { timeout: 30_000 });

    // [REAL-UI] the Journey Support screen mounts (reads participant metadata/{pid} for the header).
    // NOTE: we do NOT assert the participant NAME — a deployed *_to_pmd Cloud Function on the test project
    // asynchronously rewrites `participant metadata.name` from profile_data (to the email), racing our seed,
    // so the rendered name flips between our seeded name and the email depending on CF timing. The
    // journey-name + onboarding-state assertions below are CF-STABLE (sourced from the `journey` collection
    // and the participantjourneyproduct doc, which the CF leaves untouched).
    await expect(
      page.getByRole('heading', { name: /Journey Support/i }),
      'JP-07: the Journey Support screen mounts and renders its heading',
    ).toBeVisible({ timeout: 30_000 });

    // The "Participant Onboarding" card resolves the journey name from journeyref.id via mapjourneyname —
    // the value the APP computed from its Firestore read of the seeded initiated participantjourneyproduct
    // (CF-stable: journeyref + the `journey` catalog are not touched by the metadata-sync CF).
    await expect(
      page.getByText(journeyNames.journey1, { exact: false }).first(),
      'JP-07: the onboarding card renders the seeded journey name resolved from journeyref',
    ).toBeVisible({ timeout: 30_000 });

    // [ASSERT] seeded preconditions: onboarded=false + paymentplan=null → the app renders the "Payment plan
    // not updated — cannot onboard yet" blocked state (journeyplan.html:514-518), NOT the mark-onboard button.
    // This is the app's COMPUTED display derived from the seeded PJP (not a test write).
    await expect(
      page.getByText(/cannot onboard yet/i),
      'JP-07: the app computes the not-yet-onboardable state from the seeded paymentplan=null',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: /Mark as Onboarded/i }),
      'JP-07: the mark-onboarded button must NOT render while paymentplan is null',
    ).toHaveCount(0);
  });
});

// ===========================================================================================
// Route-mount smoke — every seeded Journey & Products route mounts for the super-role admin (the
// data-driven authGuard admits, no bounce to /login). Proves the dashboard route-grants seeded. The
// dashboards (productinitiated-dashboard) and the empty-by-default participantproduct screen are covered
// here as render-without-bounce rather than as data cases (their counts are month-windowed / filter-gated
// and would be fragile oracles). assertNoFatal is intentionally NOT called on the smoke (some of these
// screens fire the by-design Watson init failure / the cross-suite workshop-widget .toDate() bug); the
// bounce check is the assertion.
// ===========================================================================================
test.describe('Journey & Products — route-mount smoke (guard admits super-role admin)', () => {
  const STATIC_ROUTES = [
    '/addjourney', '/addproduct', '/addpackage', '/journeyproductmap', '/deliverysequence',
    '/participantproduct', '/productinitiated-dashboard',
  ];
  const PID_ROUTES = ['/participantpurchase', '/journeysupport', '/participantdeliverysequence'];

  test('every seeded journey route mounts (no /login bounce)', async ({ page }) => {
    await installJourneyStubs(page);
    await loginAsJourneyAdmin(page);
    const bounced: string[] = [];
    for (const route of STATIC_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      // NOT networkidle: the app keeps Firestore long-polls open + the prod firewall fulfils blocked CF
      // calls, so the network never idles (it would eat the whole timeout). A short settle lets the guard +
      // lazy chunk resolve the redirect; the bounce check is the assertion.
      await page.waitForTimeout(1500);
      if (/\/login/.test(page.url())) bounced.push(`${route} -> ${page.url()}`);
    }
    for (const base of PID_ROUTES) {
      await page.goto(`${base}/${PID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      if (/\/login/.test(page.url())) bounced.push(`${base}/:pid -> ${page.url()}`);
    }
    expect(bounced, `routes that bounced to /login (missing dashboard grant): ${bounced.join(', ')}`).toHaveLength(0);
  });
});
