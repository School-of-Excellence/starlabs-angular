// @ts-nocheck
/**
 * assertions.ts — the UNIVERSAL silent-data-gap invariants every variation + operator spec calls.
 *
 * WHY this file exists (the entire point of the rebuild — see the brief's ANTI-CIRCULARITY RULE):
 * a queue move that "silently drops" a participant (token advances but no audit row, a stage is
 * skipped, a loop never terminates, a count drifts) is the exact failure class the old circular
 * suite could not catch because it asserted `read == X` right after writing `X`. These helpers
 * instead read the REAL post-move state the PRODUCT produced — the `queue stage log` rows the
 * board/CF/self-move wrote, the `queue_token` the app advanced, the per-stage counts the board
 * re-rendered — and compare them to the oracle (`flow-model.js`) and to KNOWN-SEEDED numbers the
 * caller passes in. **No helper here asserts a value the test itself just wrote.**
 *
 * Sources of truth (read before editing):
 *   - recon `e2e/queue/recon/flow-config.md` — legal scoped edges / terminals / selfmovable per variation.
 *   - `e2e/lib/flow-model.js` — `build()` + `outEdgesForVariation()` (the scoped-edge oracle).
 *   - `e2e/lib/participant-sim.js` — the `queue stage log` row shape (`docid`, `previousstage`,
 *     `currentstage`, `logdate`, `movedby`) and the Firestore handle (allowlist-guarded `db()`).
 *   - recon `cf.md` §10 — the CF (`queueParticipantPositionUpdate`) and BOTH apps write one log row
 *     per stage move; `movedby` distinguishes a participant self-move (`'self'`) from an operator/
 *     board/CF-driven move (`'operator'`).
 *
 * Firestore access goes through `participant-sim.db()`, so the test-project allowlist guard
 * (`test-project.assertWritable`) fires on every read — production / starlabs-test / Watson can
 * never be touched. CommonJS to match the rest of `e2e/lib/*` (no `type:module`, specs use require).
 */
'use strict';

const { db } = require('./participant-sim');
const { build, outEdgesForVariation } = require('./flow-model');

const COL_TOKEN = 'queue_token';
const COL_LOG = 'queue stage log';
const TERMINAL = 'Completed'; // the sole multi-stage terminal (flow-config.md §2)

/** Resolve a flow-model graph from whatever the caller passes: a built model `M`
 *  ({nodes,edges,order,nodeBy}), or a raw FlowConfig (then build it). Lets callers
 *  pass either `build(cfg)` once (cheap, reused) or the cfg directly. */
function asModel(oracle) {
  if (oracle && Array.isArray(oracle.edges) && oracle.nodeBy) return oracle; // already a built model
  if (oracle && Array.isArray(oracle.stages) && Array.isArray(oracle.queuevariation)) return build(oracle); // FlowConfig
  throw new Error('assertNoStageSkipped: `oracle` must be a flow-model build(cfg) result or the FlowConfig itself');
}

/** Read a token doc (REAL post-state) or throw if it vanished. */
async function readToken(tokenId) {
  const snap = await db().collection(COL_TOKEN).doc(tokenId).get();
  if (!snap.exists) throw new Error(`[assertions] queue_token ${tokenId} does not exist (token lost?)`);
  return snap.data();
}

/**
 * Read ALL `queue stage log` rows the app/CF/self-move wrote for a token, ordered by the
 * APP-written `logdate` (the same ordering the board + CF use). This is the canonical move
 * record — never a value the test just computed. Returns lightweight rows.
 * @returns {Promise<{previousstage:string|null, currentstage:string, movedby:string, logdate:any, logdocid:string}[]>}
 */
async function readLogRows(tokenId) {
  const s = await db().collection(COL_LOG).where('docid', '==', tokenId).get();
  const rows = s.docs.map(d => {
    const x = d.data();
    return {
      previousstage: x.previousstage ?? null,
      currentstage: x.currentstage,
      movedby: x.movedby || null,
      logdate: x.logdate,
      logdocid: x.logdocid || d.id,
    };
  });
  // Sort by the app-written timestamp; fall back to seconds/millis or 0 so a missing logdate
  // (a real defect) sinks to the front and is still surfaced, not silently reordered.
  const ts = r => {
    const t = r.logdate;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t._seconds === 'number') return t._seconds * 1000 + (t._nanoseconds || 0) / 1e6;
    if (typeof t.seconds === 'number') return t.seconds * 1000 + (t.nanoseconds || 0) / 1e6;
    return 0;
  };
  return rows.sort((a, b) => ts(a) - ts(b));
}

/** The ordered list of observed transitions {from,to,movedby} the PRODUCT recorded for a token. */
async function observedTransitions(tokenId) {
  return (await readLogRows(tokenId)).map(r => ({ from: r.previousstage, to: r.currentstage, movedby: r.movedby }));
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 1 — NO-ORPHAN
// ---------------------------------------------------------------------------------------------
/**
 * The walked token exists and is the ONLY token in its run+stage cohort (no duplicate/forked
 * token left dangling by a half-applied move). Reads REAL token state; the count it asserts is
 * the live Firestore population, not a value the test wrote.
 *
 * "Orphan" here = a token with no audit trail to explain how it reached its current stage, OR a
 * sibling token sharing the same (testrunid, profile_id) created by a botched move. Both are the
 * silent-data-gap signature. A token past its entry stage MUST have >=1 `queue stage log` row.
 *
 * @param {string} tokenId
 * @param {{expectSiblings?:number}} [opts]  expectSiblings: how many tokens SHOULD share this
 *        token's (testrunid, profile_id) — default 1 (just itself).
 */
async function assertNoOrphan(tokenId, opts = {}) {
  const expectSiblings = opts.expectSiblings ?? 1;
  const tok = await readToken(tokenId);
  const rows = await readLogRows(tokenId);

  // (a) No duplicate/forked token for this participant in this run.
  if (tok.testrunid && tok.profile_id) {
    const sib = await db().collection(COL_TOKEN)
      .where('testrunid', '==', tok.testrunid)
      .where('profile_id', '==', tok.profile_id).get();
    if (sib.size !== expectSiblings) {
      throw new Error(
        `[NO-ORPHAN] token ${tokenId}: expected ${expectSiblings} token(s) for ` +
        `profile_id=${tok.profile_id} run=${tok.testrunid}, found ${sib.size} ` +
        `(forked/orphaned token from a half-applied move?)`,
      );
    }
  }

  // (b) Every token that has advanced past its entry stage must have an audit row explaining it.
  //     A token with previousstage set but ZERO log rows is the textbook silent gap.
  const movedPastEntry = tok.previousstage != null && tok.previousstage !== tok.currentstage;
  if (movedPastEntry && rows.length === 0) {
    throw new Error(
      `[NO-ORPHAN] token ${tokenId} is at "${tok.currentstage}" (previousstage "${tok.previousstage}") ` +
      `but has ZERO "queue stage log" rows — the move was applied to the token without an audit trail.`,
    );
  }
  return { tokenId, currentstage: tok.currentstage, logRows: rows.length, siblings: expectSiblings };
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 2 — EVERY-MOVE-LOGGED
// ---------------------------------------------------------------------------------------------
/**
 * Exactly one `queue stage log` row exists per transition the PRODUCT performed — and the count
 * must reflect the moves DRIVEN through the real UI / CF, NOT merely sim self-writes.
 *
 * ANTI-CIRCULARITY: `expectedTransitions` is the number of moves the SPEC drove (operator clicks
 * on the real board + CF auto-advances + the participant self-move stand-ins). We read the REAL
 * rows the app/CF/sim wrote and compare. Crucially, when the caller tells us how many of those
 * were operator/CF-driven (`opts.minNonSelf`, the moves that are NOT pure participant self-writes),
 * we assert the log actually CONTAINS at least that many non-`self` rows — so a suite that only
 * round-tripped sim self-writes can NEVER satisfy this. (movedby: 'operator' is written by the
 * board move + by `participant-sim.advance(..,{by:'operator'})` standing in for an operator/CF
 * move; 'self' is the participant self-move stand-in — see participant-sim.js + cf.md §10.)
 *
 * @param {string} tokenId
 * @param {number} expectedTransitions  total transitions the spec drove (>= 0).
 * @param {{minNonSelf?:number}} [opts]  minNonSelf: lower bound on rows whose movedby !== 'self'
 *        (the operator/CF-driven moves). Defaults to 0 only for all-self/zero-move flows (e.g. V9
 *        Prep-Hold expects 0==0); pass the real count for any flow with operator/CF moves.
 */
async function assertEveryMoveLogged(tokenId, expectedTransitions, opts = {}) {
  if (!Number.isInteger(expectedTransitions) || expectedTransitions < 0) {
    throw new Error(`[EVERY-MOVE-LOGGED] expectedTransitions must be a non-negative integer, got ${expectedTransitions}`);
  }
  const rows = await readLogRows(tokenId);
  const got = rows.length;

  // One row per transition — no dropped row (silent gap) and no duplicate row (double-fire).
  if (got !== expectedTransitions) {
    const trail = rows.map(r => `${r.previousstage ?? '∅'}→${r.currentstage}[${r.movedby || '?'}]`).join('  ');
    throw new Error(
      `[EVERY-MOVE-LOGGED] token ${tokenId}: expected ${expectedTransitions} "queue stage log" row(s) ` +
      `(one per driven transition) but found ${got}. Trail: ${trail || '(none)'}`,
    );
  }

  // The count must NOT be satisfiable by sim self-writes alone: when the spec drove operator/CF
  // moves, those non-self rows must be present in the PRODUCT's audit trail.
  const minNonSelf = opts.minNonSelf ?? 0;
  if (minNonSelf > 0) {
    const nonSelf = rows.filter(r => r.movedby && r.movedby !== 'self').length;
    if (nonSelf < minNonSelf) {
      throw new Error(
        `[EVERY-MOVE-LOGGED] token ${tokenId}: expected >= ${minNonSelf} operator/CF-driven (movedby != 'self') ` +
        `log row(s), found ${nonSelf}. The logged moves must include the real UI/CF transitions, ` +
        `not only participant self-writes (anti-circularity).`,
      );
    }
  }
  return { tokenId, logged: got, nonSelf: rows.filter(r => r.movedby && r.movedby !== 'self').length };
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 3 — NO-STAGE-SKIPPED
// ---------------------------------------------------------------------------------------------
/**
 * Every observed `previousstage → currentstage` recorded for the token is a LEGAL scoped edge per
 * the flow-model oracle for this variation — NOT a mere `stages[]` backbone adjacency (flow-config.md
 * §3 drift: DRC is dead-forward, Consultation is off-path in the uP!/Prodigies family, etc.). A skip
 * (e.g. DRC→ATC Preparation) has no oracle edge and FAILS here.
 *
 * Reads the REAL log rows the product wrote (ordered by app `logdate`); validates each against
 * `outEdgesForVariation(M, prev, variationId)`. The first transition may originate at the
 * variation's entry (previousstage null/entry) — a null `from` is accepted as the entry hop.
 *
 * @param {string} tokenId
 * @param {object} oracle  a flow-model `build(cfg)` result (preferred) OR the raw FlowConfig.
 * @param {string} variationId  the variation the token belongs to (token.variationid).
 */
async function assertNoStageSkipped(tokenId, oracle, variationId) {
  const M = asModel(oracle);
  const transitions = await observedTransitions(tokenId);

  for (let k = 0; k < transitions.length; k++) {
    const { from, to } = transitions[k];
    // Entry hop: the very first recorded move may have a null `from` (token created at entry).
    if (from == null) continue;
    // Self-referential row (`from === to`): this is LEGAL iff the oracle scopes a self-LOOP edge here
    // (e.g. the Scope Enhancement / Diagnostics "Send Back" `[LOOP]`, flow-config.md §2). A self-loop
    // is a real bounded routing edge (LOOP-BOUND caps its traversals separately), NOT a silent skip.
    // It is ILLEGAL only when the oracle has NO self-loop edge from `from` (a genuine no-movement row).
    if (from === to) {
      const hasSelfLoop = outEdgesForVariation(M, from, variationId).some(e => e.to === from && e.loop);
      if (!hasSelfLoop) {
        throw new Error(`[NO-STAGE-SKIPPED] token ${tokenId} (variation ${variationId}): self-referential log row "${from}"→"${to}" with no movement, and "${from}" has no scoped self-loop edge in the oracle.`);
      }
      continue; // a legal, oracle-scoped self-loop edge
    }
    const legal = outEdgesForVariation(M, from, variationId).some(e => e.to === to);
    if (!legal) {
      const allowed = outEdgesForVariation(M, from, variationId).map(e => `${e.to}[${e.type}${e.back ? ',back' : ''}${e.loop ? ',loop' : ''}]`);
      throw new Error(
        `[NO-STAGE-SKIPPED] token ${tokenId} (variation ${variationId}): observed move ` +
        `"${from}" → "${to}" is NOT a legal scoped edge. Legal out-edges from "${from}": ` +
        `${allowed.length ? allowed.join(', ') : '(none — terminal/dead-forward)'}. ` +
        `A backbone adjacency is NOT sufficient (see flow-config.md §3 drift).`,
      );
    }
  }
  return { tokenId, variationId, checked: transitions.length };
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 4 — TERMINAL-REACHED
// ---------------------------------------------------------------------------------------------
/**
 * The token has arrived at its variation's terminal and can go no further: `currentstage` is the
 * terminal AND the terminal has ZERO scoped out-edges in the oracle (so the move-dropdown is empty).
 * Reads REAL token state. For the single-stage V9 (uP! Prep-Hold) the entry IS the terminal
 * (`uP! Prep Process - Hold`) — pass `opts.terminal` to override the default `Completed`.
 *
 * @param {string} tokenId
 * @param {string} variationId
 * @param {{terminal?:string, oracle?:object}} [opts]  terminal: expected terminal stage name
 *        (default "Completed"); oracle: a build(cfg)/FlowConfig to additionally assert the terminal
 *        has no scoped out-edge (strongly recommended — proves it is a real terminal, not just a name).
 */
async function assertTerminalReached(tokenId, variationId, opts = {}) {
  const terminal = opts.terminal || TERMINAL;
  const tok = await readToken(tokenId);
  if (tok.currentstage !== terminal) {
    throw new Error(
      `[TERMINAL-REACHED] token ${tokenId} (variation ${variationId}): currentstage is ` +
      `"${tok.currentstage}", expected terminal "${terminal}".`,
    );
  }
  if (opts.oracle) {
    const M = asModel(opts.oracle);
    const outs = outEdgesForVariation(M, terminal, variationId);
    if (outs.length !== 0) {
      throw new Error(
        `[TERMINAL-REACHED] token ${tokenId}: stage "${terminal}" still has ${outs.length} scoped ` +
        `out-edge(s) for variation ${variationId} (${outs.map(e => e.to).join(', ')}) — not a true terminal.`,
      );
    }
  }
  return { tokenId, variationId, terminal };
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 5 — COUNT-CONSERVED
// ---------------------------------------------------------------------------------------------
/**
 * After a single move from `src` to `dst`, the board's per-stage counts changed by exactly
 * src −1 / dst +1, and the TOTAL across all stages is unchanged (no token vaporized or duplicated).
 *
 * ANTI-CIRCULARITY: `before` and `after` are the counts the APP RE-RENDERED on the live board
 * (captured by the spec's queue-board page object before vs after driving the move) — the test
 * does not write these numbers, the board computes them from its Firestore stream. This helper
 * only diffs two app-computed snapshots.
 *
 * @param {Record<string,number>} before  per-stage counts the board rendered BEFORE the move.
 * @param {Record<string,number>} after   per-stage counts the board rendered AFTER the move.
 * @param {{src:string, dst:string}} move  the stage the token left / entered.
 */
function assertCountConserved(before, after, move) {
  if (!before || !after || !move || !move.src || !move.dst) {
    throw new Error('[COUNT-CONSERVED] requires (before, after, {src, dst}) — all of board-before, board-after, and the move');
  }
  const { src, dst } = move;
  if (src === dst) throw new Error(`[COUNT-CONSERVED] src and dst are the same stage "${src}" — not a forward move`);

  const sum = o => Object.values(o).reduce((a, n) => a + (Number(n) || 0), 0);
  const sumBefore = sum(before);
  const sumAfter = sum(after);
  if (sumBefore !== sumAfter) {
    throw new Error(
      `[COUNT-CONSERVED] total token count changed across the move: before=${sumBefore}, after=${sumAfter} ` +
      `(a token was dropped or duplicated — silent data gap).`,
    );
  }

  const b = s => Number(before[s] || 0);
  const a = s => Number(after[s] || 0);
  if (a(src) !== b(src) - 1) {
    throw new Error(`[COUNT-CONSERVED] source "${src}" expected ${b(src) - 1} (was ${b(src)}, −1), got ${a(src)}.`);
  }
  if (a(dst) !== b(dst) + 1) {
    throw new Error(`[COUNT-CONSERVED] dest "${dst}" expected ${b(dst) + 1} (was ${b(dst)}, +1), got ${a(dst)}.`);
  }

  // Defensive: no OTHER stage's count moved (the move must be local to src/dst).
  const stages = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const s of stages) {
    if (s === src || s === dst) continue;
    if (a(s) !== b(s)) {
      throw new Error(`[COUNT-CONSERVED] unrelated stage "${s}" changed ${b(s)}→${a(s)} during a ${src}→${dst} move.`);
    }
  }
  return { src, dst, total: sumAfter };
}

// ---------------------------------------------------------------------------------------------
// INVARIANT 6 — LOOP-BOUND
// ---------------------------------------------------------------------------------------------
/**
 * No single edge (loop or back-edge) was traversed more than `maxTraversals` times in the token's
 * recorded history — a 3rd traversal (with the default cap of 2) FAILS. Guards against a routing
 * cycle that never terminates (flow-config.md §2 / PLAN risk 13).
 *
 * Reads the REAL ordered log rows the product wrote and counts identical `from→to` hops. Throws on
 * the FIRST edge that exceeds the cap, reporting the offending edge and its traversal count.
 *
 * @param {string} tokenId
 * @param {number} [maxTraversals=2]  max times any single edge may be traversed (a (max+1)th fails).
 */
async function assertLoopBound(tokenId, maxTraversals = 2) {
  if (!Number.isInteger(maxTraversals) || maxTraversals < 1) {
    throw new Error(`[LOOP-BOUND] maxTraversals must be a positive integer, got ${maxTraversals}`);
  }
  const transitions = await observedTransitions(tokenId);
  const counts = new Map();
  for (const { from, to } of transitions) {
    if (from == null) continue; // entry hop is not an edge traversal
    const key = `${from} → ${to}`;
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    if (n > maxTraversals) {
      throw new Error(
        `[LOOP-BOUND] token ${tokenId}: edge "${key}" traversed ${n} times (max ${maxTraversals}). ` +
        `A ${maxTraversals + 1}th traversal indicates an unbounded routing loop (flow-config.md §2, PLAN risk 13).`,
      );
    }
  }
  const maxSeen = counts.size ? Math.max(...counts.values()) : 0;
  return { tokenId, maxTraversals, maxObserved: maxSeen, edges: counts.size };
}

module.exports = {
  assertNoOrphan,
  assertEveryMoveLogged,
  assertNoStageSkipped,
  assertTerminalReached,
  assertCountConserved,
  assertLoopBound,
  // exposed for spec reuse / debugging (read-only views of product state):
  readLogRows,
  observedTransitions,
  TERMINAL,
};
