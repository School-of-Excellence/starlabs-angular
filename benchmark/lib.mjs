// Shared helpers: emulator-bound Firestore instances, deterministic-ish data
// generators (realistic names/values, no placeholder "John Doe", no emojis),
// timing + payload-size measurement.
//
// Resolves `firebase` from the parent starlabs-angular/node_modules (Node walks
// up for node_modules), so no separate install is needed.

import { initializeApp } from 'firebase/app';
import {
  getFirestore, initializeFirestore, connectFirestoreEmulator,
  doc, collection, writeBatch, Timestamp,
} from 'firebase/firestore';
import { cfg } from './config.mjs';

// ---- emulator-bound Firestore (default DB + named forms DB) ----
const app = initializeApp({ projectId: cfg.projectId, apiKey: 'emulator-fake-key' }, `bench-${Date.now()}`);

export const db = getFirestore(app);
connectFirestoreEmulator(db, cfg.emulator.host, cfg.emulator.port);

// Named secondary DB (forms). Emulator multi-DB support is best-effort; if the
// installed emulator/SDK can't bind it, forms seeding/measurement is skipped.
export let formsDb = null;
try {
  formsDb = initializeFirestore(app, {}, cfg.formsDatabaseId);
  connectFirestoreEmulator(formsDb, cfg.emulator.host, cfg.emulator.port);
} catch (e) {
  console.warn(`[bench] named forms DB unavailable, forms will be skipped: ${e.message}`);
  formsDb = null;
}

// ---- timing + size ----
export const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms, monotonic
export async function timed(fn) {
  const t0 = now();
  const out = await fn();
  return { ms: +(now() - t0).toFixed(1), out };
}
// Approx wire size of a query result: JSON byte length of the plain data.
// Good enough to drive the bandwidth model (Firestore gRPC is in the same order).
export function bytesOf(objs) {
  let b = 0;
  for (const o of objs) b += Buffer.byteLength(JSON.stringify(o, tsReplacer));
  return b;
}
function tsReplacer(_k, v) {
  if (v && typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
  return v;
}
export const fmtBytes = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;
export const fmtMs = (ms) => ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`;

// network model: transfer time (ms) for `bytes` at `mbps`
export const netMs = (bytes, mbps) => (bytes * 8) / (mbps * 1e6) * 1000;

// ---- batched writer (respects the 500-op commit cap) ----
export class Batcher {
  constructor(database) { this.database = database; this.batch = writeBatch(database); this.n = 0; this.total = 0; }
  async set(ref, data) {
    this.batch.set(ref, data); this.n++; this.total++;
    if (this.n >= 450) await this.flush();
  }
  async flush() {
    if (this.n === 0) return;
    await this.batch.commit();
    this.batch = writeBatch(this.database); this.n = 0;
  }
}

// ---- ids ----
export const pid = (i) => `p_${i}`;
export const coachPid = (i) => `coach_${i}`;
export const isDense = (i) => i < cfg.denseExemplars;

// ---- realistic generators (varied, organic; no "John Doe", no emojis) ----
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Priya', 'Arjun', 'Saanvi',
  'Ishaan', 'Riya', 'Aditya', 'Nisha', 'Karthik', 'Tara', 'Devon', 'Lena', 'Marcus', 'Sofia',
  'Yusuf', 'Amara', 'Tomas', 'Ingrid', 'Hassan', 'Mei', 'Olu', 'Freya', 'Rafael', 'Zara'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Kapoor', 'Banerjee', 'Pillai', 'Joshi', 'Menon', 'Gupta',
  'Okafor', 'Larsson', 'Cardoso', 'Haddad', 'Tanaka', 'Mwangi', 'Fischer', 'Rossi', 'Novak', 'Costa'];

// xorshift so runs are repeatable without Math.random scatter
let _s = 0x9e3779b9;
export function rng() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) / 0xffffffff); }
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const chance = (p) => rng() < p;
export const name = () => `${pick(FIRST)} ${pick(LAST)}`;
export const daysAgo = (d) => Timestamp.fromMillis(1749700000000 - d * 86400000); // fixed epoch base (no Date.now)
export const futureDays = (d) => Timestamp.fromMillis(1749700000000 + d * 86400000);

export { Timestamp, doc, collection };
