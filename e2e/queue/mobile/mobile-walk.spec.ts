// @ts-nocheck
/**
 * mobile-walk.spec.ts — drive each variation's participant entry→terminal with REAL Flutter taps for
 * the self-moves and the REAL Angular board for operator/auto hops. The mobile analogue of the
 * lyl-first-cycle.spec.ts walk: same oracle (flow-model), same guards (assertions.ts), same anti-
 * circularity (assert PRODUCT output). The ONLY change: SELF hops are real taps in `breakthroughs`
 * (flutter drive walk_test.dart), not participant-sim writes.
 *
 * Scope: 1 representative participant per variation (the handoff's "real mobile coverage of every
 * flow"). Set VARIATIONS=<id|name,...> to run a subset; default = all 9.
 */
import { test, expect } from '@playwright/test';
import { QueueBoardPage } from '../pages/queue-board.page';
import { loginAsOperator } from '../support/auth';
import { QUEUE_NAME } from '../support/actors';
import {
  buildTargets, buildAllJourneyTargets, driveBoardHop, driveFlutterSelfRun, resetToken, assertAfterHop,
  attachAndAuditFrames, clearMobileScreenshots, ensureSimBuildPrereqs, TERMINAL, MODEL,
} from './walk-lib';
const { assertTerminalReached } = require('../../lib/assertions');

const ONLY = process.env.VARIATIONS ? process.env.VARIATIONS.split(',').map((s) => s.trim()) : undefined;
// Default: 9 representative journeys (1 primary path/variation). ALL_PATHS=1 → every forward journey
// (72 paths), participants assigned to cover all paths + all 50 seeded users (~82 walks).
const TARGETS = process.env.ALL_PATHS === '1' ? buildAllJourneyTargets(ONLY) : buildTargets(ONLY);

test.describe('REAL-mobile participant walk (Flutter taps for self-moves + real Angular board)', () => {
  // One-time: apply the iOS-sim stub overrides + clear the stale Generated.xcconfig + pub get (stock 3.44).
  test.beforeAll(() => { ensureSimBuildPrereqs(); });

  for (const t of TARGETS) {
    const opHops = t.hops.filter((h) => h.kind !== 'SELF').length;
    const selfHops = t.hops.filter((h) => h.kind === 'SELF').length;
    test(`${t.name} — entry→${t.terminal}: ${selfHops} REAL Flutter self-move(s) + ${opHops} board hop(s)`, async ({ page }, testInfo) => {
      test.setTimeout(25 * 60_000); // flutter drives boot the app each run — generous budget

      clearMobileScreenshots();
      // Fresh-participant precondition: clean log, park at the variation entry (re-runnable).
      await resetToken(t.tokenId, t.firstStage);

      // Degenerate single-stage variation (V9 uP! Prep Hold): no hops — assert the parked terminal,
      // then boot the REAL app to capture the parked stage as imaging proof (parity with the other 8).
      if (t.hops.length === 0) {
        await assertTerminalReached(t.tokenId, t.vid, { terminal: t.terminal });
        await driveFlutterSelfRun(t, 0, t.label);
        await attachAndAuditFrames(testInfo, t.label, 1); // 1 parked-terminal frame
        return;
      }

      // Drive the REAL operator board ONCE (auth + queue select) — reused for every OP/AUTO hop.
      await loginAsOperator(page);
      const board = new QueueBoardPage(page);
      await board.selectQueue(QUEUE_NAME);

      let logged = 0;      // PRODUCT-logged transitions so far (entry hop never logged)
      let minNonSelf = 0;  // board (operator/auto) hops — movedby != 'self'; proves non-circularity
      let i = 0;

      while (i < t.hops.length) {
        if (t.hops[i].kind === 'SELF') {
          // Group consecutive SELF hops → ONE flutter drive (the app advances through each form, so a
          // single boot taps the whole run). The drive writes ALL the run's rows, so we assert ONCE
          // after it (the guards check the FULL trail — every intermediate hop is still validated).
          let j = i;
          while (j < t.hops.length && t.hops[j].kind === 'SELF') j++;
          const runLen = j - i;
          await driveFlutterSelfRun(t, runLen, t.label);
          logged += runLen;
          await assertAfterHop(t.tokenId, t.vid, logged, minNonSelf);
          i = j;
        } else {
          // OP / AUTO → REAL board move (movedby = operator profileid), board-computed count-drift.
          // The hop also captures the participant's REAL card on the REAL board at the source stage
          // (imaging proof of the operator hop; the count-drift assertion is the numeric proof).
          await driveBoardHop(board, t.profileid, t.hops[i], { label: t.label, seq: i });
          minNonSelf += 1;
          logged += 1;
          await assertAfterHop(t.tokenId, t.vid, logged, minNonSelf);
          i += 1;
        }
      }

      // TERMINAL: the token rests on Completed AND Completed has zero scoped out-edges (true terminal).
      if (t.terminal === TERMINAL) {
        await assertTerminalReached(t.tokenId, t.vid, { terminal: TERMINAL, oracle: MODEL });
      }
      // Final tally: every transition logged; the board (non-self) subset proves it's not sim-only.
      const expectedNonSelf = t.hops.filter((h) => h.kind !== 'SELF').length;
      const { assertEveryMoveLogged } = require('../../lib/assertions');
      await assertEveryMoveLogged(t.tokenId, t.hops.length, { minNonSelf: expectedNonSelf });

      // L1 guard: every walk should produce 3 mobile frames per self-move (card/form/after) + 1 board
      // frame per operator hop. Missing/blank beyond the cushion fails (see attachAndAuditFrames).
      await attachAndAuditFrames(testInfo, t.label, 3 * selfHops + opHops);
    });
  }
});
