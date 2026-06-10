// participant-evolution.spec.ts — Evolution Mapping participant self-service (/participantevolution).
// The participant sees the video grid ONLY when their liveevolutionmapping.live==true (app-gated), and
// on "Mark as Completed" the APP advances the queue_token and writes a `queue stage log` row. Every
// assertion is on a value the APP RENDERED from its Firestore stream or WROTE on a real click — vs a
// KNOWN seeded number — never a value the test wrote. The seed/token reset is a precondition only.
//
// Recon: e2e/recon-allcomp/evolution-mapping.md (EM-08/09/10/11).
import { test, expect } from '@playwright/test';
import {
  evoActors, evoProfileIds, evoIds, EVO_STAGE, NEXT_STAGE,
  installEvomapStubs, loginAsEvoParticipant,
  setP0Live, resetParticipantToken, stageLogsThrough,
} from './support/evomap';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from '../queue/support/console-guard';
import { getDoc, pollUntil } from '../queue/support/firestore-admin';

// Build the participant deep-link the component consumes (queueid matches token.queueref.id == QGEN).
const evoUrl = (stage = EVO_STAGE) => `/participantevolution?queueid=${evoIds.QGEN}&stagename=${encodeURIComponent(stage)}`;

test.describe('Evolution Mapping — participant self-service (real UI, anti-circular)', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => {
    guard = attachConsoleGuard(page);
    await installEvomapStubs(page);
  });
  test.afterEach(() => assertNoFatal(guard, 'participant-evolution: no fatal console errors / pageerrors'));

  // ===========================================================================================
  // EM-08 — the video grid renders only when liveevolutionmapping.live == true (app-gated)
  // ===========================================================================================
  test('EM-08 video grid renders when live:true and is absent when live:false (app *ngIf gate)', async ({ page }) => {
    // Positive precondition: p0 live:true with 2 videos.
    await setP0Live(true);
    await resetParticipantToken();

    await loginAsEvoParticipant(page);
    await page.goto(evoUrl(), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participantevolution/, { timeout: 30_000 });

    // [REAL-UI] the component renders the .video-grid (one .video-item per videolist entry) only inside
    // the *ngIf="liveEvolutionMapping[0].live" block. Two seeded urls → two video items.
    const grid = page.locator('.video-grid');
    await expect(grid, 'EM-08+: the video grid must render when live:true').toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.video-grid .video-item'),
      'EM-08+: one video item per seeded videolist url (2)').toHaveCount(2, { timeout: 15_000 });

    // Negative: flip the SAME participant's live doc to false, reload → the grid (and the whole evolution
    // container, also gated on live) must be ABSENT. This is the APP's render decision, not a test inject.
    await setP0Live(false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Wait for the loading bar to clear (queryCount>=2 flips loading=false), then the grid must be gone.
    await expect(page.locator('mat-progress-bar')).toHaveCount(0, { timeout: 30_000 }).catch(() => {});
    await expect(page.locator('.video-grid'),
      'EM-08-: the video grid must be absent when live:false').toHaveCount(0, { timeout: 15_000 });

    // Restore for downstream cases.
    await setP0Live(true);
  });

  // ===========================================================================================
  // EM-11 — "Mark as Completed" is gated: absent when live:false (double-gate, UI-only)
  // ===========================================================================================
  test('EM-11 "Mark as Completed" is absent when live:false (app gate, no Firestore assertion)', async ({ page }) => {
    await setP0Live(false);
    await resetParticipantToken();

    await loginAsEvoParticipant(page);
    await page.goto(evoUrl(), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/participantevolution/, { timeout: 30_000 });
    await expect(page.locator('mat-progress-bar')).toHaveCount(0, { timeout: 30_000 }).catch(() => {});

    // [ASSERT] the completion button lives inside the live-gated block → absent when live:false.
    await expect(page.getByRole('button', { name: /Mark as Completed/i }),
      'EM-11: the completion button must not exist when live:false').toHaveCount(0, { timeout: 10_000 });

    await setP0Live(true); // restore
  });

  // ===========================================================================================
  // EM-09 — checking the watched box + Mark as Completed writes a `queue stage log` row (app-written)
  // EM-10 — …and advances queue_token.currentstage to the app-computed nextStage (from the variation)
  // ===========================================================================================
  test('EM-09/10 completion writes a stage-log row (movedthrough=evolution mapping) and advances the token', async ({ page }) => {
    // Preconditions: p0 live:true; token reset to currentstage=EVO_STAGE (Approved/Active); prior log cleared.
    await setP0Live(true);
    await resetParticipantToken();
    // Pre-state (anti-circular): the token is at EVO_STAGE and there is NO evolution-mapping log row yet.
    const before = await getDoc('queue_token', evoIds.TOKEN);
    expect(before!.currentstage, 'EM-10: token starts at the evolution stage').toBe(EVO_STAGE);
    const logsBefore = await stageLogsThrough(evoIds.TOKEN, 'evolution mapping');
    expect(logsBefore.length, 'EM-09: no evolution-mapping log row before completion').toBe(0);

    await loginAsEvoParticipant(page);
    await page.goto(evoUrl(), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.video-grid'), 'EM-09: grid must render so the gate is satisfied').toBeVisible({ timeout: 30_000 });

    // [REAL-UI] check "I have watched both Pre and Post videos" → the completion button activates.
    const watched = page.getByText('I have watched both Pre and Post videos');
    await expect(watched, 'EM-09: the watched-confirmation checkbox must render').toBeVisible({ timeout: 15_000 });
    await watched.click();
    const completeBtn = page.getByRole('button', { name: /Mark as Completed/i });
    await expect(completeBtn, 'EM-09: the completion button activates once the box is checked').toBeVisible({ timeout: 15_000 });
    await completeBtn.click();

    // [ASSERT EM-09] the app setDoc'd exactly one `queue stage log` row for this token with
    // movedthrough=='evolution mapping' (participant-evolution-mapping.ts:255-259) — the value the PRODUCT
    // wrote, not the precondition. Poll until the single new row lands.
    const logs = await pollUntil(
      () => stageLogsThrough(evoIds.TOKEN, 'evolution mapping'),
      (rows) => rows.length === 1,
      { label: 'EM-09: exactly one evolution-mapping stage-log row for the token', timeoutMs: 30_000 },
    );
    expect(logs[0].movedby, 'EM-09: the log records the participant as movedby').toBe(evoProfileIds.p0);
    expect(logs[0].currentstage, 'EM-09: the log snapshot carries the advanced stage').toBe(NEXT_STAGE);

    // [ASSERT EM-10] the app updateDoc'd queue_token.currentstage to the nextStage it COMPUTED from the
    // seeded variation stages[] (element after EVO_STAGE == NEXT_STAGE) — not the stagename the test passed.
    const after = await pollUntil(
      () => getDoc('queue_token', evoIds.TOKEN),
      (d) => !!d && d.currentstage === NEXT_STAGE,
      { label: `EM-10: token currentstage -> ${NEXT_STAGE}`, timeoutMs: 30_000 },
    );
    expect(after!.previousstage, 'EM-10: previousstage records the completed evolution stage').toBe(EVO_STAGE);
    expect(after!.stagestatus, 'EM-10: the app set stagestatus Approved on advance').toBe('Approved');
  });
});
