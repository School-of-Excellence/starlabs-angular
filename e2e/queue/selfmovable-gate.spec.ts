// @ts-nocheck
/**
 * selfmovable-gate.spec.ts — PLAN P1 #6 (the self-movable vs operator-move GATE), across ALL 9 variations.
 *
 * WHAT THIS PROVES (validated/flow-config.md §5 SELFMOVABLE-GATE; PLAN §6 P1 #6, §3.D):
 *   A regression that flips a compulsory/operator stage to `selfmovable:true` would let a participant
 *   SKIP an operator gate (self-advance past a stage that is supposed to require an operator/specialist
 *   action) — and the happy-path/terminal/loop specs would still pass. This spec closes that gap with,
 *   for every variation:
 *     (1) ORACLE PARITY — each stage's `selfmovable` flag in the flow-model oracle (`flow-model.js`
 *         `build()` — the dependency-free port of the queue-flow-visualizer's routing logic, i.e. the
 *         app's own source-of-truth for the two transition types) EQUALS the seeded config's
 *         `stageproperty[stage].selfmovable`, AND the self-move EDGE structure agrees: a self-movable
 *         stage exposes a `selfmove`+`selfmv:true` out-edge (the participant's self-advance), while a
 *         NON-self-movable stage exposes NONE (the documented V3 `Triple ATC` D4 case is the sole
 *         self-movable-without-self-move-edge exception — flow-config.md §3 D4).
 *     (2) NEGATIVE GATE (a participant cannot skip an operator gate) — for the variation's operator
 *         gate (`Scope Enhancement`, the studio engine; the first non-self-movable stage whose only
 *         forward edge is an OPERATOR `nextstage`), driven through the REAL Angular operator board:
 *           • the operator move-dropdown for a token parked on that gate OFFERS the oracle's operator
 *             forward target (`qm-move-target[data-stage-name=…]`, bare or as a typed sub-column bucket)
 *             — an APP-COMPUTED value, proving there IS a legal operator move out of the gate; and
 *           • PRODUCT REALITY of the dropdown: it is NOT an edge-scoped widget — checkAvailablestages
 *             builds its options from the token's VARIATION stage list (falling back to the queue's full
 *             stages[] when the bare seeded variationid does not match the "<run>_<id>" variation doc id,
 *             component ts:2784-2790). So we assert what is product-truthful: every rendered option is a
 *             real operator-move DESTINATION column (never a fabricated/self-move-only target), and the
 *             gate's scoped operator forward target is among them. We deliberately do NOT assert a
 *             minimal/exact option set — that would contradict the shipped product (anti-circularity:
 *             never relax NOR over-constrain against real app output);
 *           • the gate exposes NO participant self-advance: there is no `selfmv:true` self-move edge out
 *             of it (oracle/app routing), so a participant self-move has NO legal `queue_token` advance —
 *             and the move-dropdown has no self-move affordance at all (a self-move is a client write in
 *             the Flutter app, never a `qm-move-target` click). THIS routing fact + the audit trail below
 *             are where the no-skip GUARANTEE actually lives;
 *           • the PRODUCT's own audit trail (`queue stage log` rows the app/CF/self-move wrote — read
 *             via assertions.ts) contains NO participant self-move (`movedby:'self'`) advancing OUT of
 *             the gate. We do NOT call `participant-sim.advance` to "prove no write" — that helper writes
 *             unconditionally (it is the self-move STAND-IN) and asserting against it would be circular.
 *     (3) V9 (uP! - Prep Hold) special — the sole stage is a non-self-movable PARKING terminal with ZERO
 *         out-edges (no operator button, no self-move): assert `selfmovable:false`, no self-move edge,
 *         zero scoped out-edges (no participant CTA at all), and the seeded token sits there with no
 *         self-move row in its product log.
 *
 * ANTI-CIRCULARITY (the entire point of the rebuild — SHARED CONVENTIONS / assertions.ts header):
 *   • (1) compares two PRODUCT artifacts (the routing oracle vs the seeded config) — neither is a value
 *     this test wrote.
 *   • (2) drives the REAL board and asserts values the APP computed (the move-target options the board
 *     rendered — that they are real operator-move destinations incl. the gate's scoped operator target),
 *     and reads the PRODUCT's own log rows (never a value the test wrote). The operator move-dropdown is
 *     opened READ-ONLY (we assert the operator target exists + every option is a legal destination, then
 *     dismiss with Escape) — the token is NOT committed forward, so shared board state is left clean for
 *     the serialized suite (playwright.queue.config: workers:1).
 *   The token's `currentstage` reset to the gate is a PRECONDITION setup (allowed: it stands in for the
 *   participant having reached the gate), exactly as closed-loop.spec.ts resets to a variation's entry.
 *
 * SOURCES OF TRUTH READ BEFORE WRITING (per SHARED CONVENTIONS / CLAUDE.md):
 *   - e2e/queue/recon/flow-config.md (§0 the 3 edge types, §2 per-variation scoped edges, §3 D1–D4
 *     drift, §5 SELFMOVABLE-GATE) — the routing oracle SOURCE OF TRUTH.
 *   - e2e/lib/flow-model.js (`build`, `outEdgesForVariation`) — the scoped-edge oracle.
 *   - e2e/lib/participant-sim.js (`tokensForVariation`, `currentStage`, `db`) — token reads / self-move
 *     stand-in shape; allowlist-pinned Firestore handle.
 *   - e2e/lib/assertions.ts (`observedTransitions`) — the PRODUCT's recorded {from,to,movedby} trail.
 *   - e2e/queue/support/firestore-admin.ts (`getDoc`) — read-only product-state reads.
 *   - e2e/queue/support/auth.ts (`loginAsOperator`), e2e/queue/support/console-guard.ts (attach in
 *     beforeEach), e2e/queue/pages/queue-board.page.ts (QueueBoardPage), e2e/queue/support/actors.ts
 *     (TESTRUNID, QUEUE_NAME).
 *   - e2e/queue/recon/testids.md (OPERATOR surface: `qm-move-btn`, `qm-move-target[data-stage-name]`,
 *     PRE-EXISTING `data-token-id` on each card). No selector here is invented.
 */
import { test, expect, Page, Locator } from '@playwright/test';
import { QueueBoardPage } from './pages/queue-board.page';
import { loginAsOperator } from './support/auth';
import { attachConsoleGuard, assertNoFatal, ConsoleGuard } from './support/console-guard';
import { TESTRUNID, QUEUE_NAME } from './support/actors';

// CommonJS libs (lib/* are plain CommonJS — require like the other specs do).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cfg = require('../fixtures/sample-queue-config.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { build, outEdgesForVariation } = require('../lib/flow-model');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { observedTransitions } = require('../lib/assertions');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDoc } = require('./support/firestore-admin');

// Documented OPERATOR-surface testids (e2e/queue/recon/testids.md). PRE-EXISTING stable attrs:
// `data-token-id` on each token card (= token.profile_id || token.docid). These are authoritative
// (NOT invented) — used here only for a READ-ONLY inspection of the move-dropdown the board renders.
const SEL = {
  tokenCard: (id: string) => `[data-token-id="${cssEscape(id)}"]`,
  moveBtn: '[data-testid="qm-move-btn"]',
  moveTarget: '[data-testid="qm-move-target"]',
  moveTargetNamed: (name: string) => `[data-testid="qm-move-target"][data-stage-name="${cssEscape(name)}"]`,
  // A split (compulsoryactivity) stage renders ONLY as typed sub-column buckets "<name> (Queued|…)";
  // this prefix-match pins those buckets to exactly `name` (the trailing " (" cannot collide with a
  // longer stage name that merely starts with `name`).
  moveTargetTypedPrefix: (name: string) => `[data-testid="qm-move-target"][data-stage-name^="${cssEscape(`${name} (`)}"]`,
  moveDropdown: '.move-dropdown',
} as const;

function cssEscape(v: string): string {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** The flow-model graph, built ONCE from the seeded config (cheap, reused across all variations). */
const MODEL = build(cfg);

/** The documented self-movable stage whose oracle exposes NO `selfmv:true` self-move edge (D4). */
const SELFMV_WITHOUT_EDGE_EXCEPTIONS = new Set<string>(['Triple ATC']);

/** True iff `stage` (scoped to `vid`) has a participant self-advance edge in the oracle. */
function hasSelfMoveEdge(stage: string, vid: string): boolean {
  return outEdgesForVariation(MODEL, stage, vid).some((e: any) => e.type === 'selfmove' && e.selfmv);
}

/** Scoped operator (`nextstage`) FORWARD targets from `stage` (excludes self-loop / back edges). */
function forwardOperatorTargets(stage: string, vid: string): string[] {
  return outEdgesForVariation(MODEL, stage, vid)
    .filter((e: any) => e.type === 'next' && !e.loop && !e.back)
    .map((e: any) => e.to);
}

/**
 * The variation's operator GATE: the first NON-self-movable stage on its backbone whose only forward
 * edge is an OPERATOR `nextstage` (no `selfmv:true` self-move edge). This is precisely the stage a
 * participant must NOT be able to self-advance past. Returns null for the single-stage V9 (no gate).
 */
function operatorGateFor(vid: string, stages: string[]): { stage: string; targets: string[] } | null {
  for (const s of stages) {
    if ((cfg.stageproperty[s] || {}).selfmovable) continue;       // self-movable → not a gate
    if (hasSelfMoveEdge(s, vid)) continue;                         // has a participant self-advance → not a gate
    const targets = forwardOperatorTargets(s, vid);
    if (targets.length > 0) return { stage: s, targets };          // operator-only forward edge → the gate
  }
  return null;
}

test.describe('SELFMOVABLE-GATE (P1 #6) — self-movable flag parity + operator-gate cannot be skipped, all 9 variations', () => {
  let guard: ConsoleGuard;
  test.beforeEach(async ({ page }) => { guard = attachConsoleGuard(page); });
  test.afterEach(() => { assertNoFatal(guard); });

  for (const v of cfg.queuevariation as { id: string; variationname: string; stages?: string[] }[]) {
    const vid = v.id;
    const stages: string[] = v.stages || [];
    const gate = operatorGateFor(vid, stages);

    test(`V:${v.variationname} — every stage's selfmovable flag matches the flow-model oracle (config parity)`, { tag: '@oracle' }, async () => {
      // (1) ORACLE PARITY — for EVERY stage on this variation's backbone, the routing oracle's
      // selfmovable flag equals the seeded config's, and the self-move EDGE structure agrees with it.
      // Compares two PRODUCT artifacts (oracle vs config) — neither value was written by this test.
      expect(stages.length, `variation ${v.variationname} must declare at least one stage`).toBeGreaterThan(0);

      for (const s of stages) {
        const configFlag = !!(cfg.stageproperty[s] || {}).selfmovable;
        const oracleNode = MODEL.nodeBy[s];
        expect(oracleNode, `oracle is missing a node for stage "${s}" (variation ${v.variationname})`).toBeTruthy();
        const oracleFlag = !!oracleNode.selfmv;

        // 1a. The flag itself: oracle `selfmv` === config `selfmovable`.
        expect(
          oracleFlag,
          `selfmovable parity for "${s}" (variation ${v.variationname}): flow-model oracle selfmv=${oracleFlag} ` +
          `but config selfmovable=${configFlag}. A drift here = a participant gate silently opened/closed.`,
        ).toBe(configFlag);

        // 1b. The edge structure must AGREE with the flag, so the flag is not merely cosmetic:
        //   - self-movable stage  ⇒ exposes a participant self-advance edge (selfmove + selfmv:true),
        //     EXCEPT the documented V3 `Triple ATC` D4 case (selfmovable:true but its only configured
        //     move is an OPERATOR edge — flow-model suppresses the implicit self-move; flow-config §3 D4).
        //   - non-self-movable stage ⇒ exposes NO participant self-advance edge (this IS the gate).
        const edge = hasSelfMoveEdge(s, vid);
        if (configFlag) {
          if (SELFMV_WITHOUT_EDGE_EXCEPTIONS.has(s)) {
            expect(
              edge,
              `"${s}" (variation ${v.variationname}) is the documented D4 exception — selfmovable:true but ` +
              `its only legal exit is an OPERATOR edge, so the oracle must expose NO self-move edge.`,
            ).toBe(false);
          } else {
            expect(
              edge,
              `self-movable stage "${s}" (variation ${v.variationname}) must expose a participant self-move ` +
              `(selfmove + selfmv:true) out-edge in the oracle — the participant's self-advance.`,
            ).toBe(true);
          }
        } else {
          expect(
            edge,
            `NON-self-movable stage "${s}" (variation ${v.variationname}) must expose NO participant ` +
            `self-move edge in the oracle (it is an operator/compulsory gate — a participant cannot self-advance).`,
          ).toBe(false);
        }
      }
    });

    if (gate) {
      test(`V:${v.variationname} — a participant cannot skip the "${gate.stage}" operator gate (REAL board: operator-only forward, no self-advance)`, async ({ page }) => {
        // Resolve THIS variation's seeded token (the walked participant). tokensForVariation returns
        // docs spread with their data (incl. profile_id), sorted by queueposition for determinism.
        const tokens = await sim.tokensForVariation(TESTRUNID, vid);
        expect(tokens.length, `variation ${v.variationname} should have >=1 seeded participant token`).toBeGreaterThan(0);
        const tok = tokens[0];
        const tokenDocId: string = tok.id;
        // The board card carries data-token-id = profile_id || docid (testids.md PRE-EXISTING attrs).
        const cardId: string = tok.profile_id || tok.profileid || tokenDocId;

        // PRECONDITION (allowed setup — stands in for the participant having reached the gate): park the
        // token on the operator gate stage. Not an assertion target; the proof reads APP/PRODUCT output.
        // Also normalize status→'queued' + clear any studio link so a token at this (compulsoryactivity)
        // gate deterministically buckets into the gate's "(Queued)" sub-column (a prior serialized test may
        // have left it 'ready'/'instudio') — the card must render to open its move dropdown.
        await sim.db().collection('queue_token').doc(tokenDocId)
          .update({ currentstage: gate.stage, previousstage: null, status: 'queued', liveassignmentid: null, studioid: null });

        // Drive the REAL Angular operator board.
        await loginAsOperator(page);
        const board = new QueueBoardPage(page);
        await board.selectQueue(QUEUE_NAME);

        // The token card must render on the board (board bucketed it into the gate's column from its
        // live queue_token stream). Poll — collectionData is async (SHARED CONVENTIONS).
        const card = page.locator(SEL.tokenCard(cardId)).first();
        await expect.poll(async () => card.count(), {
          message: `board never rendered token card data-token-id="${cardId}" on the gate "${gate.stage}" ` +
            `for ${v.variationname} (is the queue selected and the queue_token stream loaded?)`,
          timeout: 20_000,
        }).toBeGreaterThan(0);

        // Open this token's move dropdown (READ-ONLY: assert, then dismiss; do NOT commit a move).
        const moveBtn = card.locator(SEL.moveBtn);
        await expect(moveBtn, `Move button for token ${cardId} missing/disabled on the board.`).toBeEnabled({ timeout: 10_000 });
        await moveBtn.click();
        await expect(page.locator(SEL.moveDropdown).first(), 'move-dropdown did not open for the gated token.').toBeVisible({ timeout: 10_000 });

        // (2a) The board OFFERS the oracle's OPERATOR forward target(s) — APP-COMPUTED. This proves there
        // IS a legal operator move out of the gate (the operator can advance the participant). A split
        // stage renders only as typed buckets "<name> (Queued|Waiting|Activity)", a simple stage bare —
        // match either form (component checkAvailablestages, ts:2796-2821).
        for (const target of gate.targets) {
          await expect(
            page.locator(SEL.moveTargetNamed(target)).or(page.locator(SEL.moveTargetTypedPrefix(target))),
            `operator move-dropdown for the gated token must offer the scoped operator target "${target}" ` +
            `(variation ${v.variationname}, gate "${gate.stage}") — the board did not render it (bare or as a typed bucket).`,
          ).toBeVisible({ timeout: 10_000 });
        }

        // (2b) PRODUCT REALITY of the move-dropdown (NOT a scoped-edge widget): the board's
        // checkAvailablestages builds the option list from the token's *variation stage list*
        // (mapVariation[variationid].stages), falling back to the queue's full stages[] when the bare
        // seeded variationid does not match the "<run>_<id>" variation doc id — component ts:2784-2790.
        // It is NOT the oracle's per-edge forward set. So we do NOT assert a minimal/exact option set
        // (that would contradict the shipped product). What IS load-bearing and PRODUCT-TRUTHFUL: EVERY
        // option the board renders is an OPERATOR-move destination (a column the operator clicks to move
        // a token), and the gate offers NO participant self-advance THROUGH this UI — the move-dropdown
        // has no `selfmv`/self-move affordance at all (a participant self-move is a client write in the
        // Flutter app, never a `qm-move-target` click). The actual no-skip GUARANTEE is enforced by the
        // routing oracle + the product audit trail below (2c), where it belongs.
        const renderedTargets = await page.locator(SEL.moveTarget)
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-stage-name') || '').filter(Boolean));
        // Strip the typed sub-column suffix to recover the bare stage NAME each option moves a token TO.
        const renderedStageNames = new Set(
          renderedTargets.map((t) => t.replace(/\s*\((?:Queued|Waiting|Activity)\)\s*$/i, '')),
        );
        // Every rendered destination must be a real stage of THIS variation (or the full queue fallback) —
        // i.e. an operator-move column, never a fabricated/self-move-only target. APP output vs the config.
        const legalDestinations = new Set<string>(
          (cfg.stageproperty && Object.keys(cfg.stageproperty).length ? Object.keys(cfg.stageproperty) : cfg.stages) as string[],
        );
        for (const name of renderedStageNames) {
          expect(
            legalDestinations.has(name),
            `move-dropdown for gate "${gate.stage}" (variation ${v.variationname}) rendered a target "${name}" that ` +
            `is not a configured stage — every option must be a real operator-move destination column.`,
          ).toBe(true);
        }
        // The gate's own scoped OPERATOR forward target(s) are among the rendered destinations (the board
        // does offer the legal operator move) — the same fact (2a) checked, asserted at the name level too.
        for (const target of gate.targets) {
          expect(
            renderedStageNames.has(target),
            `move-dropdown for gate "${gate.stage}" (variation ${v.variationname}) must include the scoped operator ` +
            `forward target "${target}" among its destinations (rendered: ${JSON.stringify([...renderedStageNames].sort())}).`,
          ).toBe(true);
        }

        // Dismiss the dropdown WITHOUT committing — leave shared board state untouched.
        await page.keyboard.press('Escape').catch(() => {});

        // (2c) Anti-circular post-state: the gate exposes NO participant self-advance edge (oracle/app
        // routing) — so a participant self-move has NO legal queue_token advance out of the gate ...
        expect(
          hasSelfMoveEdge(gate.stage, vid),
          `gate "${gate.stage}" (variation ${v.variationname}) must expose NO selfmv:true self-move edge — ` +
          `a participant must not be able to self-advance past an operator gate.`,
        ).toBe(false);

        // ... and the PRODUCT's own audit trail contains NO participant self-move (movedby:'self') leaving
        // the gate. We read the rows the app/CF/self-move wrote (assertions.observedTransitions) — never a
        // value this test wrote. (We deliberately did NOT call participant-sim.advance: it writes
        // unconditionally and would make this assertion circular.)
        const trail = await observedTransitions(tokenDocId);
        const illegalSelfSkip = trail.filter(
          (t: { from: string | null; to: string; movedby: string | null }) => t.from === gate.stage && t.movedby === 'self',
        );
        expect(
          illegalSelfSkip,
          `token ${tokenDocId} (variation ${v.variationname}) has a participant self-move (movedby:'self') leaving ` +
          `the operator gate "${gate.stage}": ${JSON.stringify(illegalSelfSkip)} — a participant skipped an operator gate.`,
        ).toHaveLength(0);

        // The token is still parked on the gate (we never committed a forward move) — read REAL token state.
        const after = await getDoc('queue_token', tokenDocId);
        expect(after, `queue_token ${tokenDocId} vanished`).toBeTruthy();
        expect(
          after!.currentstage,
          `token ${tokenDocId} left gate "${gate.stage}" with no committed operator move (variation ${v.variationname}).`,
        ).toBe(gate.stage);
      });
    } else {
      // V9 (uP! - Prep Hold): single-stage parking terminal — NO operator gate. Assert there is no
      // participant CTA at all (non-self-movable, no self-move edge, ZERO scoped out-edges), and the
      // seeded token sits on its sole stage with no self-move in its product log.
      test(`V:${v.variationname} — single-stage parking terminal has no participant self-advance (no gate, no CTA)`, { tag: '@oracle' }, async () => {
        expect(stages.length, `${v.variationname} is expected to be the single-stage parking variation`).toBe(1);
        const only = stages[0];

        // selfmovable:false, no self-move edge, and ZERO scoped out-edges (operator OR self) — the
        // participant has literally no action; they wait for an operator drag (runtime, off-config).
        expect(!!(cfg.stageproperty[only] || {}).selfmovable, `"${only}" must be non-self-movable`).toBe(false);
        expect(!!MODEL.nodeBy[only].selfmv, `oracle selfmv for "${only}" must be false`).toBe(false);
        expect(hasSelfMoveEdge(only, vid), `"${only}" must expose NO participant self-move edge`).toBe(false);
        const outs = outEdgesForVariation(MODEL, only, vid);
        expect(outs.length, `"${only}" must have ZERO scoped out-edges (entry IS terminal — no CTA). Got: ${JSON.stringify(outs.map((e: any) => `${e.to}[${e.type}]`))}`).toBe(0);

        // The seeded token sits on its sole stage, with NO participant self-move in the product's log.
        const tokens = await sim.tokensForVariation(TESTRUNID, vid);
        expect(tokens.length, `variation ${v.variationname} should have >=1 seeded participant token`).toBeGreaterThan(0);
        const tokenDocId: string = tokens[0].id;
        // PRECONDITION reset to the sole stage (re-runnable; not an assertion target).
        await sim.db().collection('queue_token').doc(tokenDocId).update({ currentstage: only, previousstage: null });
        expect(await sim.currentStage(tokenDocId), `token ${tokenDocId} must rest on "${only}"`).toBe(only);

        const trail = await observedTransitions(tokenDocId);
        const selfMoves = trail.filter((t: { movedby: string | null }) => t.movedby === 'self');
        expect(
          selfMoves,
          `token ${tokenDocId} (variation ${v.variationname}) has a participant self-move ${JSON.stringify(selfMoves)} — ` +
          `the parking terminal must have NO participant self-advance.`,
        ).toHaveLength(0);
      });
    }
  }
});
