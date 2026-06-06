// firestore-admin.ts — thin, READ-ONLY helper layer over the Admin SDK Firestore handle.
//
// It reuses participant-sim.js's `db()` (which already pins the connection to the dedicated
// test project via test-project.js's allowlist guard, and auto-honours FIRESTORE_EMULATOR_HOST
// so the SAME code reads either the emulator or the cloud test project). This module adds NO
// write logic — that lives in participant-sim.js (advance/logCount). Specs use these helpers to
// READ app/CF OUTPUT for anti-circular assertions (e.g. a `queue stage log` row the CF wrote,
// a count the board recomputed) — NEVER to read back a value the test itself just wrote.
//
// Collection names with spaces are Firestore strings (e.g. 'queue stage log', 'live assignment',
// 'queue studio pairing') — pass them verbatim.

// participant-sim is plain CommonJS (see lib/participant-sim.js); require it like the other specs do.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../lib/participant-sim');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TEST_PROJECT_ID, assertWritable } = require('../../lib/test-project');

/** Minimal structural type for the firebase-admin Firestore handle we use (read surface only). */
type AdminFirestore = {
  collection(path: string): AdminCollection;
};
type AdminCollection = AdminQuery & {
  doc(id: string): { get(): Promise<AdminDocSnap> };
};
type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'array-contains-any' | 'in' | 'not-in';
type AdminQuery = {
  where(field: string, op: WhereOp, value: unknown): AdminQuery;
  orderBy(field: string, dir?: 'asc' | 'desc'): AdminQuery;
  limit(n: number): AdminQuery;
  get(): Promise<AdminQuerySnap>;
  count(): { get(): Promise<{ data(): { count: number } }> };
};
type AdminDocSnap = { exists: boolean; id: string; data(): Record<string, unknown> | undefined };
type AdminQuerySnap = { size: number; docs: { id: string; data(): Record<string, unknown> }[] };

/** A single `field op value` filter triple. */
export type WhereClause = [field: string, op: WhereOp, value: unknown];

export interface DocResult {
  id: string;
  [key: string]: unknown;
}

/**
 * The shared, allowlist-pinned Firestore handle. Re-exported (not re-created) from
 * participant-sim so reads and the simulator's writes share one connection/credential.
 * `db()` itself calls assertWritable(); we assert again here as belt-and-suspenders so a
 * misconfigured TEST_PROJECT can never silently point reads at a protected project.
 */
export function db(): AdminFirestore {
  assertWritable(process.env.TEST_PROJECT || TEST_PROJECT_ID);
  return sim.db() as AdminFirestore;
}

/** Apply where/orderBy/limit clauses to a collection query. */
function buildQuery(collection: string, where: WhereClause[] = [], opts: QueryOpts = {}): AdminQuery {
  let q: AdminQuery = db().collection(collection);
  for (const [field, op, value] of where) q = q.where(field, op, value);
  if (opts.orderBy) q = q.orderBy(opts.orderBy, opts.orderDir || 'asc');
  if (typeof opts.limit === 'number') q = q.limit(opts.limit);
  return q;
}

export interface QueryOpts {
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  limit?: number;
}

/**
 * Read a single document by id. Returns `{ id, ...data }` or `null` if it does not exist.
 * @example const tok = await getDoc('queue_token', tokenId);
 */
export async function getDoc(collection: string, docId: string): Promise<DocResult | null> {
  const snap = await db().collection(collection).doc(docId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

/**
 * Query a collection with zero or more `[field, op, value]` clauses (+ optional orderBy/limit).
 * Returns all matching docs as `{ id, ...data }`.
 * @example const logs = await queryWhere('queue stage log', [['docid','==',tokenId]], { orderBy:'logdate' });
 */
export async function queryWhere(collection: string, where: WhereClause[] = [], opts: QueryOpts = {}): Promise<DocResult[]> {
  const snap = await buildQuery(collection, where, opts).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Count matching docs WITHOUT materialising them (server-side aggregation).
 * Use this for app/CF-output counts in anti-circular assertions (e.g. how many `queue stage log`
 * rows the CF wrote for a token), then compare against a KNOWN seeded number — never against a
 * value the test just wrote.
 * @example const moves = await countWhere('queue stage log', [['docid','==',tokenId]]);
 */
export async function countWhere(collection: string, where: WhereClause[] = []): Promise<number> {
  const agg = await buildQuery(collection, where).count().get();
  return agg.data().count;
}

export interface PollOpts {
  /** Total time to keep polling before giving up. Default 20000ms (matches config expect timeout). */
  timeoutMs?: number;
  /** Delay between attempts. Default 500ms. */
  intervalMs?: number;
  /** Label used in the timeout error to make failures self-describing. */
  label?: string;
}

/**
 * Poll an async `read` until `predicate(value)` is true (or until timeout), then resolve the value.
 * For Firestore-stream-driven assertions prefer Playwright's `expect.poll`; use this when you need
 * the resolved value back (e.g. to read the new log row's fields) or are outside an expect chain.
 *
 * @example
 *   // wait until the CF has written the expected number of move rows, then inspect the latest
 *   const logs = await pollUntil(
 *     () => queryWhere('queue stage log', [['docid','==',tokenId]], { orderBy: 'logdate' }),
 *     (rows) => rows.length >= expectedMoves,
 *     { label: `>=${expectedMoves} stage-log rows for ${tokenId}` },
 *   );
 */
export async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: PollOpts = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  let lastErr: unknown;
  // first attempt is immediate; then poll until the deadline
  for (;;) {
    try {
      last = await read();
      if (predicate(last)) return last;
    } catch (e) {
      lastErr = e;
    }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const label = opts.label || 'predicate';
  const detail = lastErr ? ` lastError=${(lastErr as Error)?.message || lastErr}` : ` lastValue=${safeJson(last)}`;
  throw new Error(`pollUntil: "${label}" not satisfied within ${timeoutMs}ms.${detail}`);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
