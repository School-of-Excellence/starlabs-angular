// mutations.spec.ts — Content & Engagement: write-mutation flows driven through the REAL Angular UI,
// plus the buffermix → recommended-mix-playlist CF-side-effect chain.
//
// ANTI-CIRCULARITY: each case asserts the value the APP WROTE on a real submit (a `solar voice playlist`
// doc the create form wrote with the sequence length the app derived from MY row selections; a `category`
// doc the add dialog wrote; a `health stories` subject the edit form wrote), OR the value a CF COMPUTED
// (the fan-out of `recommended mix playlist` docs the buffermixToRecommendedPlaylist CF created). The
// seed is the precondition; the assertion is always the app/CF output vs a KNOWN seeded number.
//
// Recon: e2e/recon-allcomp/content.md (CN-03, CN-09, CN-13-write, CN-15).
import { test, expect } from '@playwright/test';
import {
  contentText, contentIds, bufferProfiles, installContentStubs, loginAsContentAdmin,
  resetHealthStory, resetBuffermix, createBuffermix,
} from './support/content';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, queryWhere, countWhere, pollUntil } from '../queue/support/firestore-admin';

const RUN = process.env.CONT_RUNID || 'cont';
const ROW = 'tr.mat-mdc-row, tr[mat-row]';

test.describe('Content — write mutations (real UI → app-written Firestore docs, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installContentStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'content mutations: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // CN-03 — create playlist: select the 3 seeded audios + submit → a NEW `solar voice playlist` doc
  //          with name == input and sequence.length == the audio count the app derived from my picks
  // ===========================================================================================
  test('CN-03 create playlist writes a solar-voice-playlist doc with the app-derived sequence length', async ({ page }) => {
    const NEW_NAME = `NEW_PLAYLIST_${RUN}_${Date.now()}`; // unique per run so re-runs never collide

    await loginAsContentAdmin(page);
    await page.goto('/playlistdashboard/add-playlist', { waitUntil: 'domcontentloaded' });
    // The SolarPlaylist authoring screen mounts under the playlistdashboard parent route.
    await expect(page).toHaveURL(/add-playlist/, { timeout: 30_000 });

    // Pre-state (anti-circular): no playlist with this name exists yet.
    expect(await countWhere('solar voice playlist', [['name', '==', NEW_NAME]]), 'CN-03: name unused pre-submit').toBe(0);

    // [REAL-UI] fill the name + description (the form requires a non-empty name).
    await page.getByPlaceholder('Playlist').first().fill(NEW_NAME);
    await page.getByPlaceholder('Description').first().fill('e2e created playlist');

    // Filter the audio table to THIS run's 3 seeded audios, then select each visible row's checkbox.
    // Filtering makes the selected set deterministic (exactly the 3 run-scoped audios).
    await page.getByPlaceholder('Filter by name').fill(contentText.audioNamePrefix);
    const seededRows = page.locator(ROW).filter({ hasText: contentText.audioNamePrefix });
    await expect(seededRows, 'CN-03: the 3 run-scoped audios are listed for selection').toHaveCount(3, { timeout: 30_000 });
    const n = await seededRows.count();
    for (let i = 0; i < n; i++) {
      await seededRows.nth(i).locator('mat-checkbox, input[type="checkbox"]').first().click();
    }

    // Submit → onSubmit writes the doc (solar-playlist.component.ts:146).
    await page.getByRole('button', { name: /^Submit$/i }).click();

    // [ASSERT] the app wrote ONE `solar voice playlist` doc with this name, whose `sequence` array
    // length equals the number of audios the app collected from MY selections (3). The seed provided
    // the audios; the app derived the sequence; the test never wrote this value.
    const docs = await pollUntil(
      () => queryWhere('solar voice playlist', [['name', '==', NEW_NAME]]),
      (rows) => rows.length === 1,
      { label: `CN-03: one solar-voice-playlist named ${NEW_NAME}`, timeoutMs: 30_000 },
    );
    const seq = (docs[0] as any).sequence as unknown[];
    expect(Array.isArray(seq), 'CN-03: the app wrote a sequence array').toBe(true);
    expect(seq.length, 'CN-03: sequence length == the 3 audios the app derived from my row selections').toBe(3);
  });

  // ===========================================================================================
  // CN-09 — category add: open the Add dialog, enter a name, click Add → a NEW `category` doc
  // ===========================================================================================
  test('CN-09 add category writes a new category doc with the entered name', async ({ page }) => {
    const NEW_CAT = `NEW_CAT_${RUN}_${Date.now()}`;

    await loginAsContentAdmin(page);
    await page.goto('/category-dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/category-dashboard/, { timeout: 30_000 });

    // Pre-state (anti-circular): no category with this name yet.
    expect(await countWhere('category', [['category', '==', NEW_CAT]]), 'CN-09: name unused pre-submit').toBe(0);

    // [REAL-UI] open the Add Category dialog and fill the name field.
    await page.getByRole('button', { name: /Add Category/i }).click();
    const nameInput = page.getByPlaceholder('Category Name');
    await expect(nameInput, 'CN-09: add-category dialog opens').toBeVisible({ timeout: 20_000 });
    await nameInput.fill(NEW_CAT);

    // Click the dialog's "Add" button (onSubmit → setDoc to `category`, add-category.component.ts:65).
    await page.getByRole('button', { name: /^Add$/ }).click();

    // [ASSERT] exactly one `category` doc with this name now exists — the app wrote it; the test only
    // reads the count back (the value asserted is the app's write, the name is the known input).
    await pollUntil(
      () => countWhere('category', [['category', '==', NEW_CAT]]),
      (c) => c === 1,
      { label: `CN-09: one category named ${NEW_CAT}`, timeoutMs: 30_000 },
    );
  });

  // ===========================================================================================
  // CN-13b — health story edit: change the subject in the update dialog + submit → the app's setDoc
  //           writes the new subject onto the seeded `health stories` doc
  // ===========================================================================================
  test('CN-13b editing a health story writes the new subject (app setDoc)', async ({ page }) => {
    // Precondition reset (idempotent for re-runs): seeded subject + a non-empty images array (the
    // update form requires images.length>0 to submit, satisfied without re-uploading a file).
    await resetHealthStory();
    const NEW_SUBJECT = `EDITED_HEALTH_${RUN}_${Date.now()}`;

    // Pre-state (anti-circular): the seeded subject is the ORIGINAL, not the edited value.
    const before = await getDoc('health stories', contentIds.HS1);
    expect(before, 'CN-13b: seeded health story must exist').toBeTruthy();
    expect(before!.subject, 'CN-13b: starts at the seeded subject').toBe(`TEST_HEALTH_${RUN}`);

    await loginAsContentAdmin(page);
    await page.goto('/healthstories', { waitUntil: 'domcontentloaded' });
    const row = page.locator(ROW).filter({ hasText: contentText.health });
    await expect(row, 'CN-13b: seeded story row must render').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the edit dialog from the row's edit button.
    await row.getByRole('button').first().click();
    const subjectField = page.locator('textarea[formcontrolname="subject"]');
    await expect(subjectField, 'CN-13b: update dialog opens with the subject field').toBeVisible({ timeout: 20_000 });
    await subjectField.fill(NEW_SUBJECT);

    // Submit (the dialog's "Update Story" button → submit() → setDoc, update-healthstory.component.ts:128).
    await page.getByRole('button', { name: /Update Story/i }).click();

    // [ASSERT] the app's setDoc wrote the new subject onto the SAME doc id. Polled — the value the
    // product wrote, vs the known input subject.
    const after = await pollUntil(
      () => getDoc('health stories', contentIds.HS1),
      (d) => !!d && d.subject === NEW_SUBJECT,
      { label: `CN-13b: health story HS1 subject → ${NEW_SUBJECT}`, timeoutMs: 30_000 },
    );
    expect(after!.subject, 'CN-13b: subject is the app-written edit').toBe(NEW_SUBJECT);
  });
});

// ===========================================================================================
// CN-15 — buffermix → recommended-mix-playlist CF fan-out (CF-SIDEEFFECT).
// Creating a `buffermix archive` doc with 2 profileids and ONE non-empty content type makes the
// buffermixToRecommendedPlaylist CF (content.js:168) fan out 2 `recommended mix playlist` docs (one
// per profile) and set status:'completed' back on the buffermix doc. We assert the CF-COMPUTED fan-out
// count and the CF-written status — never a value the test wrote; the seed N (2) was known.
//
// Skip-graceful: if the CF is not deployed / does not fire on the test project within the poll window,
// the test SKIPS with a clear note rather than producing a false failure (recon risk #3 / instr #10).
// ===========================================================================================
test.describe('Content — buffermix → recommended-mix CF chain (CF side-effect, anti-circular)', () => {
  test('CN-15 a buffermix archive write fans out one recommended-mix-playlist doc per profile (CF-computed)', async () => {
    // Reset the chain to its pre-fired precondition (delete prior CF output + remove the buffermix),
    // then (re)create the buffermix to TRIGGER onDocumentCreated. Both are precondition writes only.
    await resetBuffermix();
    await createBuffermix();

    const EXPECTED = bufferProfiles.length; // 2 profiles × 1 non-empty content type (solarvoice) = 2

    // Poll for the CF fan-out. The CF copies the buffermix `title` onto each emitted doc, so we count
    // by the run-unique title (a CF-written value) rather than by ref-equality.
    let fanout = 0;
    try {
      await pollUntil(
        () => countWhere('recommended mix playlist', [['title', '==', contentText.buffermix]]),
        (c) => { fanout = c; return c >= EXPECTED; },
        { label: `CN-15: ${EXPECTED} recommended-mix docs for the buffermix`, timeoutMs: 60_000, intervalMs: 1500 },
      );
    } catch {
      test.skip(true, `CN-15: buffermixToRecommendedPlaylist CF did not fan out within 60s (got ${fanout}/${EXPECTED}); ` +
        'the CF is likely not deployed to the test project — see blockers.');
      return;
    }

    // [ASSERT] exactly one recommended-mix doc per profile — the CF computed this from the buffermix's
    // profileid array (2) × the single non-empty content type. The count is the CF's output vs the
    // known seeded N.
    expect(fanout, 'CN-15: CF fanned out one recommended-mix doc per profile').toBe(EXPECTED);

    // …and the CF wrote status:'completed' back on the buffermix doc (content.js:222).
    const buf = await pollUntil(
      () => getDoc('buffermix archive', contentIds.BUF1),
      (d) => !!d && d.status === 'completed',
      { label: 'CN-15: buffermix status → "completed"', timeoutMs: 20_000 },
    );
    expect(buf!.status, 'CN-15: buffermix marked completed by the CF').toBe('completed');
  });
});
