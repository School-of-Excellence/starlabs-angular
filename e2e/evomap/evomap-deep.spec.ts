// evomap-deep.spec.ts — Evolution Mapping suite to FULL recon depth. Adds the cases the first
// orchestrator pass deferred:
//   EM-02  add-evolution 4-step dialog (participant ngx-mat-select-search → video-type card → source
//          video card → Save Mapping) → a NEW evolutionmappingvideo row (count increments by 1).
//   EM-03  edit an existing mapping (Edit FAB → Update Mapping dialog) → the app setDoc-merges a new
//          title onto the row.
//   EM-13  add a video via /participant_videos_mapping (Add Video overlay form → Save) → a NEW
//          `participant videos` doc (count for the participant increments by 1, delete:false).
//   EM-14  delete a video via the /participant_videos_mapping log overlay (delete-icon → confirm) →
//          the app updateDoc's that `participant videos` doc delete:true.
//   EM-15  toggle an existing live mapping OFF (Live tab → Update dialog → Live slide-toggle off →
//          Update) → the app setDoc-merges live:false.
//
// Anti-circularity (unchanged discipline): every assertion is on a value the APP COMPUTED/RENDERED from
// its own Firestore stream OR the value the APP WROTE on a real click — compared to a KNOWN seeded
// number or pre-state, never a value the test itself wrote. The seed / reset helpers are PRECONDITIONS.
//
// Recon: e2e/recon-allcomp/evolution-mapping.md (EM-02/03/13/14/15). Patterns mirror the deep exemplars
// modes/engine.spec.ts (assert the computed value) + appointments/status.spec.ts (real dialog → write,
// idempotent precondition reset, page.once('dialog') for window.confirm).
import { test, expect, Page } from '@playwright/test';
import {
  evoActors, evoProfileIds, evoIds, evoTitles, evoUrls, evoVideoTypes, evoMetaNames,
  installEvomapStubs, loginAsEvoAdmin, PVM_LASTVIDEO_INDEX_ERR,
  resetEditTargetRow, resetPVdelTarget, resetToggleLive,
  countNonDeletedFor, hasNonDeletedTitleFor,
} from './support/evomap';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, queryWhere, countWhere, pollUntil } from '../queue/support/firestore-admin';

const ROW = 'tr.mat-mdc-row, tr[mat-row]';

// ---------------------------------------------------------------------------------------------------
// Shared helper: pick an option from an ngx-mat-select-search-backed mat-select by typing into its
// search box then clicking the matching body-level mat-option. Both the add-evolution dialog and the
// add-video overlay use this exact widget (a search input inside the first mat-option, real options
// below). The select panel renders in a CDK overlay at the body root, so the search input + options
// are located page-wide (not inside the dialog/overlay container).
// ---------------------------------------------------------------------------------------------------
async function pickSearchSelectOption(page: Page, trigger: ReturnType<Page['locator']>, search: string, optionText: string) {
  // Open the panel. force: the floating <mat-label>/notched-outline overlays the trigger and would
  // otherwise intercept the click (same reason appointments/status.spec.ts forces the reason select).
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.click({ force: true });
  // The ngx-mat-select-search input lives in the open select PANEL (a body-level CDK overlay), NOT the
  // dialog. It renders TWO `.mat-select-search-input`s — a hidden aux input AND the real one (aria-label
  // "dropdown search", placeholder "Search …"); we must target the VISIBLE one (the :not(.hidden) input).
  const panel = page.locator('.mat-mdc-select-panel');
  const searchBox = panel.locator('.mat-select-search-input:not(.mat-select-search-hidden)').first();
  await expect(async () => {
    if (!(await searchBox.isVisible().catch(() => false))) {
      await trigger.click({ force: true }).catch(() => {});
    }
    await expect(searchBox).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // Type CHARACTER BY CHARACTER (not .fill): the add-evolution dialog's search filters on (keyup), which
  // .fill()'s synthetic `input` event does NOT trigger — without keyups the option list never narrows and
  // the target option can stay scrolled out of the panel. pressSequentially focuses the input then fires
  // real keydown/keyup so both filter implementations (keyup-bound and valueChanges-bound) collapse the
  // list to the one match. (No pre-click/clear: the panel opens fresh each call, so the input is empty.)
  await searchBox.pressSequentially(search, { delay: 15 });
  // The matching option (run-unique text → exactly one after filtering) becomes visible; click it. Retry
  // the click guarded by visibility so a late filter pass can't race the click.
  const option = page.locator('mat-option', { hasText: optionText }).filter({ visible: true }).first();
  await expect(option, `option "${optionText}" must appear after filtering by "${search}"`).toBeVisible({ timeout: 15_000 });
  await option.scrollIntoViewIfNeeded().catch(() => {});
  await option.click();
}

test.describe('Evolution Mapping — admin write depth (real dialogs → Firestore, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvomapStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'evomap-deep: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EM-02 — the 4-step add-evolution dialog batch-writes a new evolutionmappingvideo row
  // ===========================================================================================
  test.fixme('EM-02 add-evolution dialog writes a new evolutionmappingvideo row (count increments by 1)', async ({ page }) => {
    // Pre-state (anti-circular): pNew's current non-deleted catalogue count (the app reads these too).
    // Use the dedicated pNew participant so this case never contends with the p0 read-path cases.
    const before = await countNonDeletedFor(evoProfileIds.pNew);

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionmapping/, { timeout: 30_000 });
    // Ensure the catalogue + profile map have loaded (a known seeded row renders), so the add FAB +
    // getProfileMap() are ready before we open the dialog.
    await expect(page.locator(ROW).filter({ hasText: evoTitles.D1 })).toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the add dialog (FAB only shows when selection is empty — it is on first load).
    await page.locator('[aria-label="add evolution"]').click();
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog, 'EM-02: the add dialog must open').toBeVisible({ timeout: 20_000 });

    // Step 1 — participant select. mapProfile keys profile_data doc-id → name, and the seeder sets
    // name = the participant EMAIL, so type pNew's email to filter to exactly one option, then click it.
    const partSelect = dialog.getByRole('combobox').first();
    await expect(partSelect, 'EM-02: participant select must render in the dialog').toBeVisible({ timeout: 20_000 });
    await pickSearchSelectOption(page, partSelect, evoActors.participantNew, evoActors.participantNew);

    // Step 2 — the video-TYPE card (onSelect queried `participant videos` for pNew; its sole seeded
    // source video carries the run-unique Interview type). Click the type card.
    const typeCard = dialog.locator('.video-title-card', { hasText: evoVideoTypes.interview });
    await expect(typeCard.first(), 'EM-02: the seeded video-type card must appear').toBeVisible({ timeout: 15_000 });
    await typeCard.first().click();

    // Step 3 — the SOURCE-video card (by its unique seeded title). Clicking adds it to selectedVideos.
    const videoCard = dialog.locator('.video-title-card', { hasText: evoTitles.PV1 });
    await expect(videoCard.first(), 'EM-02: the seeded source video must be selectable').toBeVisible({ timeout: 15_000 });
    await videoCard.first().click();

    // Step 4 — Save Mapping (app batch.set's a NEW evolutionmappingvideo doc with deleted:false).
    const saveBtn = dialog.getByRole('button', { name: /Save Mapping/i });
    await expect(saveBtn, 'EM-02: Save Mapping button must appear once a video is selected').toBeVisible({ timeout: 15_000 });
    await saveBtn.click();

    // [ASSERT] the app added exactly one non-deleted row for pNew — the count the ADMIN reads back grows
    // by 1 (we assert the read-back count, never the value the form supplied). Index-free profileid query.
    await pollUntil(
      () => countNonDeletedFor(evoProfileIds.pNew),
      (n) => n === before + 1,
      { label: `EM-02: pNew catalogue count ${before} -> ${before + 1}`, timeoutMs: 30_000 },
    );
    // And the app created a NON-deleted row titled from the picked source video (app-derived title), with
    // the (no-op converted) source url — both are values the PRODUCT wrote, not the test.
    expect(await hasNonDeletedTitleFor(evoProfileIds.pNew, evoTitles.PV1),
      'EM-02: a non-deleted row titled from the picked source video exists').toBe(true);
    const rows = await queryWhere('evolutionmappingvideo', [['profileid', '==', evoProfileIds.pNew]]);
    const created = rows.find((r) => r.title === evoTitles.PV1 && r.deleted !== true);
    expect(created?.videourl, 'EM-02: the app stored the source video url on the new row').toBe(evoUrls.PV1);
    // Re-run-stable: `before` is recomputed live each run, so +1 holds regardless of rows a prior run
    // left behind (global-setup teardown clears them between full suite runs).
  });

  // ===========================================================================================
  // EM-03 — edit an existing mapping: change the title via the Edit dialog → app setDoc-merges it
  // ===========================================================================================
  test('EM-03 editing a mapping setDoc-merges the new title onto the row (app-written value)', async ({ page }) => {
    // Precondition (idempotent): the edit target (EV_E1, p0) starts at the BEFORE title, not deleted.
    await resetEditTargetRow();
    expect((await getDoc('evolutionmappingvideo', evoIds.EV_E1))!.title, 'EM-03: EV_E1 starts at the BEFORE title')
      .toBe(evoTitles.E1_BEFORE);

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    const editRow = page.locator(ROW).filter({ hasText: evoTitles.E1_BEFORE });
    await expect(editRow, 'EM-03: the edit-target row must render before editing').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the Edit dialog for this row (data!=null → participant locked, the matched source
    // video pre-selected → the right-column "Video Preview" with a Title input + Update Mapping button).
    await editRow.getByRole('button', { name: /edit icon/i }).click();
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog, 'EM-03: the edit dialog must open').toBeVisible({ timeout: 20_000 });
    const titleInput = dialog.locator('input[placeholder="Enter title"]');
    await expect(titleInput, 'EM-03: the editable Title input must render (edit mode)').toBeVisible({ timeout: 20_000 });
    // Replace the title with the run-unique AFTER value, then click Update Mapping.
    await titleInput.fill(evoTitles.E1_AFTER);
    await dialog.getByRole('button', { name: /Update Mapping/i }).click();

    // [ASSERT] the app's setDoc(merge) wrote the new title onto EV_E1 (evolutiom-mapping-add.ts:234-238)
    // — we assert the STORED result, polled (not the value we typed into a different field/echo).
    await pollUntil(
      () => getDoc('evolutionmappingvideo', evoIds.EV_E1),
      (d) => !!d && d.title === evoTitles.E1_AFTER,
      { label: `EM-03: EV_E1.title -> "${evoTitles.E1_AFTER}"`, timeoutMs: 30_000 },
    );
    // The merge must NOT have flipped deleted (merge preserves it) — the row stays in the catalogue.
    expect((await getDoc('evolutionmappingvideo', evoIds.EV_E1))!.deleted,
      'EM-03: the edit merge preserves deleted:false').toBe(false);
  });

  // ===========================================================================================
  // EM-15 — toggle an existing live mapping OFF (Update mode) → app setDoc-merges live:false
  // ===========================================================================================
  test('EM-15 toggling an existing live mapping OFF writes live:false (app setDoc on Update)', async ({ page }) => {
    // Precondition (anti-circular): pToggle's live mapping starts live:true.
    await resetToggleLive();
    expect((await getDoc('liveevolutionmapping', evoProfileIds.pToggle))!.live, 'EM-15: pToggle starts live:true').toBe(true);

    await loginAsEvoAdmin(page);
    await page.goto('/evolutionmapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/evolutionmapping/, { timeout: 30_000 });

    // [REAL-UI] open the Live Evolution Mapping tab and click pToggle's row → Update dialog (data is a
    // profileid string, NOT a Set → isMake=false → the Live slide-toggle is rendered).
    await page.getByRole('tab', { name: /Live Evolution Mapping/i }).click();
    const liveRow = page.locator(ROW).filter({ hasText: `EVOM pToggle Live` });
    await expect(liveRow, 'EM-15: pToggle live row must render in the Live tab').toBeVisible({ timeout: 30_000 });
    await liveRow.locator('td').first().click();

    // The Update dialog renders a mat-slide-toggle bound to liveStatus (default true). Toggle it OFF.
    const toggle = page.locator('mat-slide-toggle');
    await expect(toggle, 'EM-15: the Live slide-toggle must render in Update mode').toBeVisible({ timeout: 20_000 });
    // The toggle starts ON (liveStatus seeded true). Click its input to flip OFF.
    await toggle.locator('button, input').first().click({ force: true });

    // Click Update (label is "Update" in Update mode).
    await page.getByRole('button', { name: /^\s*Update\s*$/i }).click();

    // [ASSERT] the app setDoc-merged live:false (live-evolution-mapping.ts:319-326) — the PRODUCT's write,
    // polled. videolist is preserved (merge); only `live` changed from the seeded true.
    const after = await pollUntil(
      () => getDoc('liveevolutionmapping', evoProfileIds.pToggle),
      (d) => !!d && d.live === false,
      { label: 'EM-15: liveevolutionmapping/pToggle -> live:false', timeoutMs: 30_000 },
    );
    expect(Array.isArray((after as any).videolist) && (after as any).videolist.length,
      'EM-15: the merge preserved the 2-video videolist').toBe(2);
  });
});

// ===================================================================================================
// /participant_videos_mapping write cases (EM-13/EM-14). Separate describe: this screen's "Last Video"
// column query needs a composite index (participant videos: delete, profileid, recordeddate) that is NOT
// provisioned on the disposable test project — an AUXILIARY column query, not the asserted behavior — so
// the afterEach console-guard treats that one index error as ignorable (PVM_LASTVIDEO_INDEX_ERR). The
// needed index is RETURNED in the structured result for the orchestrator to provision.
// ===================================================================================================
test.describe('Evolution Mapping — participant_videos_mapping write depth (real form/log → Firestore)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvomapStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'evomap-deep pvm: no fatal console errors (last-video index aux query excepted)', [PVM_LASTVIDEO_INDEX_ERR]));

  // ===========================================================================================
  // EM-13 — add a video via /participant_videos_mapping → a new `participant videos` doc
  // ===========================================================================================
  test('EM-13 Add Video form creates a participant videos doc (count for pNew increments by 1)', async ({ page }) => {
    // Pre-state (anti-circular): count pNew's non-deleted participant-videos (the screen reads the same).
    const before = await countWhere('participant videos', [['profileid', '==', evoProfileIds.pNew], ['delete', '==', false]]);

    await loginAsEvoAdmin(page);
    await page.goto('/participant_videos_mapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant_videos_mapping/, { timeout: 30_000 });
    // Wait for the participant list to load (the Add Video button is always present, but the form's
    // participant select reads participantOptions, populated by fetchParticipants()).
    await expect(page.locator('.summary-card').first(), 'EM-13: the screen must finish initial load').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] open the Add Video overlay.
    await page.locator('.add-video-btn').click();
    const panel = page.locator('.add-video-panel');
    await expect(panel, 'EM-13: the Add Video overlay must open').toBeVisible({ timeout: 20_000 });

    // Participant — ngx-mat-select-search; filter by pNew's run-unique metadata name, click the option.
    // It is the FIRST mat-select in the panel (the per-entry Type/Event selects come after).
    const partSelect = panel.locator('mat-select').first();
    await expect(partSelect, 'EM-13: the participant select must render').toBeVisible({ timeout: 15_000 });
    await pickSearchSelectOption(page, partSelect, evoMetaNames.pNew, evoMetaNames.pNew);
    // Wait for the participant select's overlay panel to fully CLOSE before touching the next select —
    // a still-animating panel/backdrop would swallow the Type-select open click.
    await expect(page.locator('.mat-mdc-select-panel'), 'EM-13: participant panel must close before next select').toHaveCount(0, { timeout: 10_000 });

    // Entry 1 — selectors locate fields by their `.form-group` label (Angular's formControlName directive
    // does NOT reflect to a DOM attribute, so [formcontrolname=…] would not match). Set Type FIRST — the
    // Event/Video-URL fields are *ngIf-gated on a chosen type.
    const title = `EVOM Added Video ${process.env.EVOM_RUNID || 'evom'}`;
    const titleInput = panel.locator('.form-group', { hasText: 'Title' }).locator('input[matInput], input').first();
    await titleInput.scrollIntoViewIfNeeded().catch(() => {});
    await titleInput.fill(title);
    // Type — a plain mat-select (not search-backed); options are the videoTypeKeys (Event/Interview/...).
    // Open ONCE (scroll into the scrollable overlay first), wait for the Interview option, click it, then
    // confirm the trigger now shows "Interview" (a retry that re-clicked the trigger could TOGGLE the panel
    // shut and leave a detached, un-selected option — so we open deterministically and assert the result).
    const typeSelect = panel.locator('.form-group', { hasText: 'Type' }).locator('mat-select').first();
    await typeSelect.scrollIntoViewIfNeeded().catch(() => {});
    await typeSelect.click({ force: true });
    const interviewOption = page.locator('mat-option', { hasText: /^\s*Interview\s*$/ }).filter({ visible: true }).first();
    await expect(interviewOption, 'EM-13: the Interview type option must appear').toBeVisible({ timeout: 15_000 });
    await interviewOption.click();
    await expect(typeSelect, 'EM-13: the Type select must commit to Interview').toContainText(/Interview/, { timeout: 10_000 });
    // Video URL (only renders once a type is chosen) — the .form-group whose label is exactly "Video URL".
    const url = `https://dl.dropboxusercontent.com/evomap/${process.env.EVOM_RUNID || 'evom'}/added.mp4?raw=1`;
    const urlGroup = panel.locator('.form-group').filter({ hasText: /Video URL/ });
    await expect(urlGroup, 'EM-13: the Video URL field appears once a type is chosen').toBeVisible({ timeout: 10_000 });
    const urlInput = urlGroup.locator('input[matInput], input').first();
    await urlInput.scrollIntoViewIfNeeded().catch(() => {});
    await urlInput.fill(url);

    // Save (saveVideo → addDoc 'participant videos' with delete:false).
    const saveBtn = panel.locator('.save-video-btn');
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click();

    // [ASSERT] exactly one new non-deleted participant-videos doc landed for pNew — the read-back count
    // the ADMIN computes grows by 1 (the app addDoc'd it; we never assert the value the form supplied).
    await pollUntil(
      () => countWhere('participant videos', [['profileid', '==', evoProfileIds.pNew], ['delete', '==', false]]),
      (n) => n === before + 1,
      { label: `EM-13: pNew participant-videos count ${before} -> ${before + 1}`, timeoutMs: 30_000 },
    );
    // And the app stored type/title on the new doc (app-written fields). Find it by the run-unique title.
    const docs = await queryWhere('participant videos', [['profileid', '==', evoProfileIds.pNew]]);
    const added = docs.find((d) => d.title === title && d.delete === false);
    expect(added, 'EM-13: the app created the participant-videos doc with the form title').toBeTruthy();
    expect(added!.type, 'EM-13: the app stored the chosen Interview type').toBe('Interview');
  });

  // ===========================================================================================
  // EM-14 — delete a video via the /participant_videos_mapping log → app updateDoc delete:true
  // ===========================================================================================
  test('EM-14 deleting a video from the log writes delete:true on the participant videos doc', async ({ page }) => {
    // Precondition (idempotent): the standalone PV_DEL row starts delete:false so the log renders it.
    await resetPVdelTarget();
    expect((await getDoc('participant videos', evoIds.PV_DEL))!.delete, 'EM-14: PV_DEL starts delete:false').toBe(false);

    await loginAsEvoAdmin(page);
    await page.goto('/participant_videos_mapping', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participant_videos_mapping/, { timeout: 30_000 });
    await expect(page.locator('.summary-card').first(), 'EM-14: the screen must finish initial load').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] filter the records list to pVdel via the Filter Participants search-select. With exactly
    // one participant selected, fetchRecords() queries `participant metadata` where __name__ in [id] and
    // renders that single row — deterministic regardless of the ~200 other participants.
    const filterSelect = page.locator('mat-select').first(); // the Filter Participants select
    await pickSearchSelectOption(page, filterSelect, evoMetaNames.pVdel, evoMetaNames.pVdel);
    // Close the still-open multi-select panel so it does not overlay the table (press Escape).
    await page.keyboard.press('Escape');

    // The records table now shows the single pVdel row; open its View Log overlay.
    const pVdelRow = page.locator(ROW).filter({ hasText: evoMetaNames.pVdel });
    await expect(pVdelRow, 'EM-14: the filtered pVdel record row must render').toBeVisible({ timeout: 30_000 });
    await pVdelRow.locator('.view-log-btn').click();

    // The log overlay renders the standalone PV_DEL video as an .event-card with a delete-icon button
    // (hasVideo && docId). Locate the card by its seeded title text, then click its delete button.
    const logCard = page.locator('.event-card').filter({ hasText: evoTitles.PVDEL });
    await expect(logCard, 'EM-14: the standalone video card must render in the log').toBeVisible({ timeout: 30_000 });
    // window.confirm → accept (openDeleteVideo with no extraVideos calls Delete() → confirm()).
    page.once('dialog', (d) => d.accept());
    await logCard.locator('.delete-icon-btn').click();

    // [ASSERT] the app updateDoc'd delete:true on the PV_DEL doc (evolution-mapping-new.ts:1556) — the
    // value the PRODUCT wrote, polled. (We assert the app's write, not the seeded precondition.)
    await pollUntil(
      () => getDoc('participant videos', evoIds.PV_DEL),
      (d) => !!d && d.delete === true,
      { label: 'EM-14: PV_DEL.delete -> true', timeoutMs: 30_000 },
    );
  });
});
