// Measures the data layer against the seeded emulator and prints a report.
//
//   node benchmark/bench.mjs
//
// Methodology: the emulator runs over localhost, so it does NOT include real
// wire latency. We therefore measure, per operation, (a) emulator wall time
// (server + deserialize + localhost transfer) and (b) exact payload bytes, then
// model real cold-load as:  modeled_real = emulator_wall + bytes / bandwidth.
// The emulator does not enforce composite indexes; the new-path queries assume
// the indexes in firestore.indexes.json exist in production.

import {
  getDocs, getCountFromServer, query, where, orderBy, limit, documentId, doc, getDoc, collection,
} from 'firebase/firestore';
import { cfg, COL } from './config.mjs';
import { db, formsDb, timed, bytesOf, fmtBytes, fmtMs, netMs, pid, isDense } from './lib.mjs';

const READ_COST_PER_100K = 0.06; // USD, Firestore document reads
const dollars = (reads) => `$${(reads / 100000 * READ_COST_PER_100K).toFixed(4)}`;

async function scanAll(col, database = db) {
  const { ms, out } = await timed(() => getDocs(collection(database, col)));
  const data = out.docs.map((d) => d.data());
  return { ms, count: out.size, bytes: bytesOf(data), docs: out.docs };
}
async function countWhere(col, ...constraints) {
  try {
    const { ms, out } = await timed(() => getCountFromServer(query(collection(db, col), ...constraints)));
    return { ms, n: out.data().count, ok: true };
  } catch (e) {
    return { ms: 0, n: null, ok: false, err: e.message };
  }
}

function modeledRow(label, emulatorMs, bytes, reads) {
  const net = cfg.bandwidthsMbps.map((m) => netMs(bytes, m));
  return { label, emulatorMs, bytes, reads, net };
}

// ============================================================
console.log(`\n=== JCHD data-layer benchmark  (SCALE=${cfg.scale}) ===\n`);

// ---------- CURRENT: whole-collection scans (ALL view) ----------
console.log('[current] scanning whole collections (today\'s board load)...');
const cur = {};
for (const c of [COL.pjp, COL.healthstate, COL.touchpoint, COL.clientissue]) {
  cur[c] = await scanAll(c);
  console.log(`  ${c.padEnd(28)} ${String(cur[c].count).padStart(7)} docs  ${fmtBytes(cur[c].bytes).padStart(10)}  ${fmtMs(cur[c].ms)}`);
}
const curBytes = Object.values(cur).reduce((s, r) => s + r.bytes, 0);
const curReads = Object.values(cur).reduce((s, r) => s + r.count, 0);
const curMs = Object.values(cur).reduce((s, r) => s + r.ms, 0);
const currentBoard = modeledRow('Current board (ALL)', curMs, curBytes, curReads);

// ---------- NEW: page-1 + aggregation counts ----------
console.log('\n[new] page-1 + aggregation counts (proposed board load)...');
const page1 = await timed(() => getDocs(query(collection(db, COL.pjp), orderBy(documentId()), limit(cfg.pageSize))));
const page1Data = page1.out.docs.map((d) => d.data());
const page1Bytes = bytesOf(page1Data);
console.log(`  page-1 pjp ${page1.out.size} docs  ${fmtBytes(page1Bytes)}  ${fmtMs(page1.ms)}`);

const HEALTH = ['HAPPY', 'NEUTRAL', 'UNHAPPY', 'AT_RISK', 'CRITICAL', 'NOT_ASSESSED'];
let aggMs = 0, aggBilled = 0, aggOk = true;
const dist = {};
for (const s of HEALTH) {
  const r = await countWhere(COL.healthstate, where('state', '==', s));
  if (!r.ok) { aggOk = false; console.log(`  [agg] count() unsupported: ${r.err}`); break; }
  dist[s] = r.n; aggMs = Math.max(aggMs, r.ms); aggBilled += Math.max(1, Math.ceil(r.n / 1000));
}
let openTickets = null, flagged = null;
if (aggOk) {
  const ot = await countWhere(COL.clientissue, where('status.status', '==', 'Open'));
  const fl = await countWhere(COL.flag, where('flagged', '==', true));
  openTickets = ot.n; flagged = fl.n;
  aggMs = Math.max(aggMs, ot.ms, fl.ms);
  aggBilled += Math.max(1, Math.ceil((ot.n ?? 0) / 1000)) + Math.max(1, Math.ceil((fl.n ?? 0) / 1000));
}
const coaches = await timed(() => getDocs(query(collection(db, COL.usersRoles), where('journeycoach', '==', true))));
const coachesBytes = bytesOf(coaches.out.docs.map((d) => d.data()));
if (aggOk) console.log(`  distribution ${JSON.stringify(dist)}  open=${openTickets}  flagged=${flagged}  (agg wall ~${fmtMs(aggMs)})`);
console.log(`  coaches ${coaches.out.size} docs  ${fmtMs(coaches.ms)}`);

// new board: queries run in PARALLEL -> wall = max; bytes = page + coaches (counts are tiny)
const newWall = Math.max(page1.ms, aggMs, coaches.ms);
const newBytes = page1Bytes + coachesBytes;
const newReads = page1.out.size + coaches.out.size + aggBilled;
const newBoard = modeledRow('New board (page+agg)', newWall, newBytes, newReads);

// ---------- NEW: coach filter switch ----------
const firstCoach = (await getDocs(query(collection(db, COL.usersRoles), where('journeycoach', '==', true), limit(1)))).docs[0]?.id;
let filterRow = null;
if (firstCoach) {
  const fp = await timed(() => getDocs(query(collection(db, COL.pjp), where('coachedby', '==', firstCoach), orderBy(documentId()), limit(cfg.pageSize))));
  const fpBytes = bytesOf(fp.out.docs.map((d) => d.data()));
  filterRow = modeledRow('Filter: coach switch', fp.ms, fpBytes, fp.out.size + 6);
  console.log(`\n[new] coach filter switch -> ${fp.out.size} docs  ${fmtBytes(fpBytes)}  ${fmtMs(fp.ms)}`);
}

// ---------- DRAWER: dense participant (parallel scoped reads + ref fan-out) ----------
console.log(`\n[drawer] timing ${cfg.drawerSamples} dense drawers (parallel scoped reads + eventref/author fan-out)...`);
const sampleIds = Array.from({ length: Math.min(cfg.drawerSamples, cfg.denseExemplars) }, (_, i) => pid(i));
let drawerMsSum = 0, drawerBytesSum = 0, drawerReadsSum = 0;
for (const id of sampleIds) {
  const t = await timed(async () => {
    const tasks = [
      getDocs(query(collection(db, COL.clientissue), where('clientid', '==', id))),
      getDocs(query(collection(db, COL.eventReq), where('profileid', '==', id))),
      getDocs(query(collection(db, COL.appointments), where('bookedby', '==', doc(db, COL.userData, id)))),
      getDocs(query(collection(db, COL.interim), where('profileid', '==', id))),
      getDocs(query(collection(db, COL.ael), where('profileid', '==', id))),
      getDocs(query(collection(db, COL.achievements), where('profileid', '==', id))),
      getDoc(doc(db, COL.metadata, id)),
    ];
    if (formsDb) tasks.push(getDocs(query(collection(formsDb, COL.formsByClient), where('profileid', '==', id))));
    const res = await Promise.all(tasks);

    // ref fan-out: resolve up to 40 eventrefs + distinct note authors (mirrors the real loaders)
    const eventReqSnap = res[1];
    const evRefs = [...new Set(eventReqSnap.docs.map((d) => d.data().eventref?.id).filter(Boolean))].slice(0, 40);
    const meta = res[6].data() || {};
    const authorIds = [...new Set((meta.notes?.ahnotes || []).map((n) => n.givenby).filter(Boolean))];
    const fanout = await Promise.all([
      ...evRefs.map((eid) => getDoc(doc(db, COL.events, eid))),
      ...authorIds.map((aid) => getDoc(doc(db, COL.metadata, aid))),
    ]);
    return { res, fanout, evRefs: evRefs.length, authors: authorIds.length };
  });
  // bytes + reads
  const snaps = t.out.res;
  let bytes = 0, reads = 0;
  for (const s of snaps) {
    if (s.docs) { bytes += bytesOf(s.docs.map((d) => d.data())); reads += s.size; }
    else { bytes += bytesOf([s.data() || {}]); reads += 1; }
  }
  reads += t.out.fanout.length; bytes += bytesOf(t.out.fanout.map((d) => d.data?.() || {}));
  drawerMsSum += t.ms; drawerBytesSum += bytes; drawerReadsSum += reads;
}
const n = sampleIds.length;
const drawerRow = modeledRow('Dense drawer open', drawerMsSum / n, drawerBytesSum / n, drawerReadsSum / n);

// ============================================================ report
const bw = cfg.bandwidthsMbps;
const head = ['Operation', 'docs/reads', 'payload', 'emu wall', ...bw.map((m) => `~real @${m}Mbps`)].join(' | ');
function line(r) {
  const modeled = r.net.map((nm) => fmtMs(r.emulatorMs + nm));
  return [r.label.padEnd(22), String(Math.round(r.reads)).padStart(9), fmtBytes(r.bytes).padStart(9), fmtMs(r.emulatorMs).padStart(8), ...modeled.map((x) => x.padStart(12))].join(' | ');
}
console.log('\n================= RESULTS =================');
console.log('modeled_real = emulator_wall + payload / bandwidth\n');
console.log(head);
console.log('-'.repeat(head.length + 30));
console.log(line(currentBoard));
console.log(line({ ...currentBoard, label: 'Current refresh' }));   // no cache => identical
console.log(line(newBoard));
console.log(line({ ...newBoard, label: 'New refresh (cache)', emulatorMs: newBoard.emulatorMs, bytes: 0, net: bw.map(() => 0) }));
if (filterRow) console.log(line(filterRow));
console.log(line(drawerRow));

console.log('\n----- reads & cost per board load -----');
console.log(`  current:  ${curReads.toLocaleString()} reads  ${dollars(curReads)}/load   (20 coaches x10/day ~ ${dollars(curReads * 200 * 30)}/mo)`);
console.log(`  new:      ~${Math.round(newReads)} reads  ${dollars(newReads)}/load   (20 coaches x10/day ~ ${dollars(newReads * 200 * 30)}/mo)`);
if (!aggOk) console.log('\n  NOTE: aggregation count() not supported by this emulator build — new-path counts modeled, not measured. Upgrade firebase-tools to measure.');
console.log('\n(See firestore.indexes.json for the composite indexes the new path requires in production.)\n');
process.exit(0);
