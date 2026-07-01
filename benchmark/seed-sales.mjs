// Seeds the LIVE CLOUD `starlabs-test` project (the disposable TEST project — never production)
// with synthetic sales data for the Sales Numbers dashboard:
//   - `salesleads` docs (gross sales, assured sales, cancellations) carrying the NEW
//     `source` / `originalsource` fields the dashboard filters on
//   - `sales_teams` docs grouping salespeople into teams
//
// Rules on starlabs-test are open (firebase.test.json), so the client SDK writes without auth.
// Doc ids are deterministic (`sn_seed_*`) so re-running OVERWRITES rather than duplicates.
// Every seeded doc carries `seedTag: 'sales-numbers'` for easy identification / cleanup.
//
//   node benchmark/seed-sales.mjs            # seed
//   node benchmark/seed-sales.mjs --wipe     # delete previously seeded sales-numbers docs, then seed
//
// `firebase` resolves from starlabs-angular/node_modules (Node walks up).

import { initializeApp } from 'firebase/app';
import {
  getFirestore, doc, collection, writeBatch, Timestamp,
  query, where, getDocs, deleteDoc,
} from 'firebase/firestore';

// ---- starlabs-test (TEST project) web config — from environment.development.ts. NOT production. ----
const firebaseConfig = {
  apiKey: 'AIzaSyAeaYHkue2pxh6kDyTL8w6CSaF9LNbMZHc',
  authDomain: 'starlabs-test.firebaseapp.com',
  projectId: 'starlabs-test',
  storageBucket: 'starlabs-test.firebasestorage.app',
  messagingSenderId: '104127075029',
  appId: '1:104127075029:web:35e728b406ff4175d1485c',
};
const app = initializeApp(firebaseConfig, `seed-sales-${Date.now()}`);
const db = getFirestore(app);

const SEED_TAG = 'sales-numbers';
const WIPE = process.argv.includes('--wipe');

// ---- deterministic RNG (xorshift) so repeated runs produce the same dataset ----
let _s = 0x1a2b3c4d;
const rng = () => { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; return ((_s >>> 0) / 0xffffffff); };
const pick = (a) => a[Math.floor(rng() * a.length)];
const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (p) => rng() < p;

// ---- anchored to the real clock so 7d / 30d / month-range filters land on today ----
const NOW = Date.now();
const DAY = 86400000;
const tsDaysAgo = (d) => Timestamp.fromMillis(NOW - d * DAY);

// ---- populations (realistic, varied; no "John Doe", no emojis) ----
const SALESPEOPLE = ['Aisha Khan', 'Ben Carter', 'Chen Wei', 'Diego Lopez', 'Elena Petrova', 'Farah Ali', 'Grace Mwangi', 'Hiro Tanaka'];
const PRESALES = ['Liam Nair', 'Maya Roy', 'Omar Sheikh', 'Priya Menon'];
// Last-touch source (broad set) and first-touch / original source (marketing-channel set).
// To add more later: add to these arrays and re-run the seed — the dashboard filters derive
// their options live from the data, so no UI/code change is needed.
const SOURCES = ['Ads', 'Organic', 'Campaigns', 'Referral', 'DFU', 'Revival', 'Workshop', 'Event', 'Lead Magnet'];
const ORIGINAL_SOURCES = ['Ads', 'Organic', 'Campaigns', 'Referral', 'Lead Magnet'];
// Product categories (mirrors the sales-report journey grouping: Ecosystem / DFU / FTO / Gift)
const PRODUCTS = ['Ecosystem', 'Ecosystem', 'Ecosystem', 'DFU', 'DFU', 'FTO', 'Gift']; // ~43% Eco, 28% DFU, 14% FTO, 14% Gift
// Specific products within each category. Ecosystem names are real; DFU/FTO/Gift are placeholders pending real names.
const PRODUCT_LINES = {
  Ecosystem: ['uP!', 'LYL', 'B!G', 'W!SH'],
  DFU: ['DFU Core', 'DFU Elite'],
  FTO: ['FTO Trial'],
  Gift: ['Gift Pack'],
};
const JOURNEY_TYPES = ['new', 'new', 'new', 'new', 'new', 'upgrade', 'upgrade', 'addons']; // ~62% new, 25% upgrade, 13% addons
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Priya', 'Arjun', 'Saanvi', 'Devon', 'Lena', 'Marcus', 'Sofia', 'Yusuf', 'Amara', 'Tomas', 'Ingrid', 'Hassan', 'Mei'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Kapoor', 'Banerjee', 'Pillai', 'Joshi', 'Menon', 'Gupta', 'Okafor', 'Larsson', 'Cardoso', 'Haddad', 'Tanaka'];
const custName = () => `${pick(FIRST)} ${pick(LAST)}`;

const TEAMS = [
  { id: 'team_alpha', team: 'Team Alpha', members: ['Aisha Khan', 'Ben Carter', 'Chen Wei'] },
  { id: 'team_bravo', team: 'Team Bravo', members: ['Diego Lopez', 'Elena Petrova', 'Farah Ali'] },
  { id: 'team_charlie', team: 'Team Charlie', members: ['Grace Mwangi', 'Hiro Tanaka'] },
];

const N_SALES = 220;            // gross sales spread over ~95 days
const SPREAD_DAYS = 95;
const ASSURED_FRACTION = 0.62;  // share of gross sales that became assured (have a payment plan)
const CANCEL_FRACTION = 0.14;   // share of gross sales that later get a cancellation record

// ---- batched writer (500-op commit cap) ----
class Batcher {
  constructor(database) { this.database = database; this.batch = writeBatch(database); this.n = 0; this.total = 0; }
  async set(ref, data) { this.batch.set(ref, data); this.n++; this.total++; if (this.n >= 450) await this.flush(); }
  async flush() { if (this.n === 0) return; await this.batch.commit(); this.batch = writeBatch(this.database); this.n = 0; }
}

async function wipeSeed() {
  console.log('[seed-sales] wiping previously seeded sales-numbers docs...');
  let removed = 0;
  for (const col of ['salesleads', 'sales_teams']) {
    const snap = await getDocs(query(collection(db, col), where('seedTag', '==', SEED_TAG)));
    for (const d of snap.docs) { await deleteDoc(d.ref); removed++; }
  }
  console.log(`[seed-sales] removed ${removed} doc(s).`);
}

async function main() {
  console.log(`[seed-sales] target project=${firebaseConfig.projectId} (TEST)  now=${new Date(NOW).toISOString()}`);
  if (WIPE) await wipeSeed();

  const b = new Batcher(db);

  // ---- teams ----
  for (const t of TEAMS) {
    await b.set(doc(db, 'sales_teams', t.id), { team: t.team, members: t.members, seedTag: SEED_TAG, lastupdate: Timestamp.fromMillis(NOW) });
  }

  // ---- gross sales ----
  const sales = []; // keep refs so cancellations can point back
  for (let i = 0; i < N_SALES; i++) {
    const id = `sn_seed_${String(i).padStart(4, '0')}`;
    const salesperson = pick(SALESPEOPLE);
    const presales = pick(PRESALES);
    const source = pick(SOURCES);
    // first-touch (original) source comes from the marketing-channel set; correlates with source when it can
    const originalsource = (ORIGINAL_SOURCES.includes(source) && chance(0.6)) ? source : pick(ORIGINAL_SOURCES);
    const journeytype = pick(JOURNEY_TYPES);
    const product = pick(PRODUCTS);
    const productName = pick(PRODUCT_LINES[product]);
    const value = int(15, 150) * 1000; // 15k - 150k
    const purchaseDaysAgo = int(0, SPREAD_DAYS);
    const assured = chance(ASSURED_FRACTION);
    const fn = pick(FIRST), ln = pick(LAST);

    const docData = {
      docid: id,
      name: `${fn} ${ln}`,
      firstname: fn,
      lastname: ln,
      email: `${fn}.${ln}.${i}@example.com`.toLowerCase(),
      salespersonname: salesperson,
      presalespersonname: presales,
      source,
      originalsource,
      product,
      productName,
      journeytype,
      saletype: journeytype,   // underlying sale type (new/upgrade/addons) — mirrored onto cancellations
      type: journeytype,
      totalpurchasevalue: value,
      initialpayment: Math.round(value * (int(10, 40) / 100)),
      installmentamount: Math.round(value / int(6, 18)),
      purchasedate: tsDaysAgo(purchaseDaysAgo),
      status: 'Approved',
      paymentplan: assured ? `plan_${journeytype}` : null,
      paymentplanassureddate: assured ? tsDaysAgo(Math.max(0, purchaseDaysAgo - int(0, 5))) : null,
      seedTag: SEED_TAG,
    };
    await b.set(doc(db, 'salesleads', id), docData);
    sales.push({ id, salesperson, presales, source, originalsource, product, productName, journeytype, value, purchaseDaysAgo, assured });
  }

  // ---- cancellations: a subset of the above gross sales get a cancellation record ----
  let nCancel = 0;
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i];
    if (!chance(CANCEL_FRACTION)) continue;
    // cancellation happens AFTER the sale, between 1 day after and today
    const cancelDaysAgo = Math.max(0, s.purchaseDaysAgo - int(1, Math.max(1, s.purchaseDaysAgo)));
    const cid = `sn_seed_cancel_${String(i).padStart(4, '0')}`;
    await b.set(doc(db, 'salesleads', cid), {
      docid: cid,
      canceldocid: s.id,
      name: `Cancellation of ${s.id}`,
      salespersonname: s.salesperson,
      presalespersonname: s.presales,
      source: s.source,
      originalsource: s.originalsource,
      product: s.product,
      productName: s.productName,
      saletype: s.journeytype,   // original sale's type, so cancellations can be typed
      journeytype: 'cancelled',
      type: 'cancelled',
      totalpurchasevalue: s.value,
      purchasedate: tsDaysAgo(s.purchaseDaysAgo), // original sale date (for "cancelled from current-month sale")
      date: tsDaysAgo(cancelDaysAgo),             // cancellation date (for "live cancellation")
      paymentplanassureddate: s.assured ? tsDaysAgo(Math.max(0, s.purchaseDaysAgo - 2)) : null,
      status: 'Approved',
      seedTag: SEED_TAG,
    });
    nCancel++;
  }

  await b.flush();
  console.log(`[seed-sales] done. teams=${TEAMS.length}  grossSales=${N_SALES}  cancellations=${nCancel}  totalDocsWritten=${b.total}`);
  process.exit(0);
}

main().catch((e) => { console.error('[seed-sales] FAILED:', e); process.exit(1); });
