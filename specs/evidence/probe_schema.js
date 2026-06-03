// READ-ONLY schema sampler for the documentation rollout (DATA-MODEL.md evidence).
// For each Tier-A / CONFIG / RUNTIME-STATE collection: count, 100-doc sample, per-field fill-rate + dominant type, detected write-ts field.
// HARD ATC DENYLIST baked in (throws if any ATC collection is ever touched). No writes anywhere.
const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();

// ---- HARD ATC GUARD (belt-and-suspenders; these names are never in COLS) ----
const ATC_SAFE = new Set(['atc taxonomy', 'atc model', 'atcmodel level config']); // reference-only, allowed
function assertNotATC(name) {
  const n = name.toLowerCase();
  if (ATC_SAFE.has(name)) return;
  if (/\batc\b/.test(n) || n.includes('atc_') || n.includes('tripleatc') || n.includes('triple atc') || n.includes('atc ') || n.includes(' atc') || n.includes('atcinvolved')) {
    throw new Error(`ATC DENYLIST VIOLATION: refused to read "${name}"`);
  }
}

const NOW = new Date();
const d90 = new Date(NOW - 90 * 86400000), d365 = new Date(NOW - 365 * 86400000);
const TS_PRIORITY = ['lastmodifieddate','last_modified','updated','updatedAt','lastModified','lastUpdated','modified','logdate','date','created','createddate','createdAt','createdon','timestamp','starttime','subscriptionstart','purchasedate','onboardedtime'];
const isTs = (v) => v && (v instanceof admin.firestore.Timestamp || typeof v.toDate === 'function');
function typeOf(v) {
  if (v === null || v === undefined) return 'null';
  if (isTs(v)) return 'ts';
  if (Array.isArray(v)) return 'array';
  if (v && (v._path || v._firestore || (v.path && v.id && v.parent))) return 'ref';
  const t = typeof v;
  return t === 'object' ? 'map' : t;
}

// Collections to sample (Tier-A locked set + CONFIG/RUNTIME promote-candidates central to the config-driven story).
const SAMPLE_COLS = [
  // commercial / journey
  'participantjourneyproduct','participantsproduct','participant metadata','salesleads',
  // identity / access
  'profile_data','user_data','new_user_data','eisroles','FCM_token',
  // scheduling / 1:1 delivery
  'appointments','availability','offtime','deliverables','participantdeliverysequence',
  // queue / workflow (incl CONFIG + RUNTIME-STATE)
  'queue generation','queue variation','queue_token','queue stage log','queue activity log','queue studio pairing','cohorts queue planner',
  // live studios (CONFIG + RUNTIME-STATE)
  'arenaspace','arena participant','live assignment','openviduroom',
  // BIG operations
  'big cohorts','big cohorts log','big assignment','big participants assignments','biginvitation',
  // content / engagement
  'content analytics','participant touchpoint','recommended mix playlist','episodes','solar voice playlist','solar voice audios','series','evolutionmappingvideo','liveevolutionmapping',
  // events / zones
  'event collection','event participation request','arena events','event zones',
  // system / audit
  'notificationrecord',
  // catalog / reference / cross-cutting CONFIG
  'journey','products','package','appointmenttype','journey-to-product','productToDeliverySequence','procedures','delivery events','delivery forms','modes','tier','classify','dashboard','tier access config','AppointmentType-To-Roles','Roles-To-EIS','biglevel','accelerated evolution level','bigactivity',
];

// Tier-C: count + recency only (substantiate "do not use" — do NOT deep-sample broken data).
const TIERC_COLS = ['big aggregate level','big aggregate levelv2','big aggregate level archives','big aggregate level archivesv2','big aggregate event level','participantJourneySequence','userAccessCounts','eiflix workshop','collectionname','big marathon'];

function detectTs(docs) {
  const f = new Set();
  docs.forEach(d => { const x = d.data(); for (const k of Object.keys(x)) if (isTs(x[k])) f.add(k); });
  for (const p of TS_PRIORITY) if (f.has(p)) return p;
  return [...f][0] || null;
}

(async () => {
  const out = { generatedAt: NOW.toISOString(), now: NOW.toISOString().slice(0,10), sample: {}, tierC: {} };
  for (const c of SAMPLE_COLS) {
    assertNotATC(c);
    const rec = { collection: c };
    try {
      rec.count = (await db.collection(c).count().get()).data().count;
      const snap = await db.collection(c).limit(100).get();
      const docs = snap.docs;
      rec.sampled = docs.length;
      rec.sampleDocIds = docs.slice(0, 3).map(d => d.id);
      const ts = detectTs(docs);
      rec.tsField = ts;
      // per-field fill-rate + type histogram
      const fields = {};
      docs.forEach(d => {
        const x = d.data();
        for (const k of Object.keys(x)) {
          if (!fields[k]) fields[k] = { present: 0, nonNull: 0, types: {} };
          fields[k].present++;
          const t = typeOf(x[k]);
          fields[k].types[t] = (fields[k].types[t] || 0) + 1;
          if (t !== 'null') fields[k].nonNull++;
        }
      });
      const n = docs.length || 1;
      rec.fields = Object.fromEntries(Object.entries(fields)
        .sort((a,b) => b[1].nonNull - a[1].nonNull)
        .map(([k,v]) => [k, {
          fillPct: Math.round(100 * v.nonNull / n),
          presentPct: Math.round(100 * v.present / n),
          type: Object.entries(v.types).sort((a,b)=>b[1]-a[1])[0][0],
          types: v.types,
        }]));
      rec.fieldCount = Object.keys(fields).length;
      // recency on detected ts (last-write signal)
      if (ts) {
        try {
          const mx = (await db.collection(c).orderBy(ts,'desc').limit(1).get()).docs[0];
          rec.lastWrite = mx ? mx.data()[ts].toDate().toISOString().slice(0,10) : null;
          rec.writes90d = (await db.collection(c).where(ts,'>=',d90).count().get()).data().count;
          rec.writes365d = (await db.collection(c).where(ts,'>=',d365).count().get()).data().count;
        } catch (e) { rec.recencyErr = e.message.slice(0,60); }
      }
    } catch (e) { rec.err = e.message.slice(0,80); }
    out.sample[c] = rec;
    console.log(`${c.padEnd(34)} count=${String(rec.count ?? '?').padEnd(8)} fields=${rec.fieldCount ?? '?'} ts=${rec.tsField ?? '—'} last=${rec.lastWrite ?? '—'} 90d=${rec.writes90d ?? '—'}`);
  }
  console.log('\n--- Tier-C (count + recency only) ---');
  for (const c of TIERC_COLS) {
    assertNotATC(c);
    const rec = { collection: c };
    try {
      rec.count = (await db.collection(c).count().get()).data().count;
      const docs = (await db.collection(c).limit(5).get()).docs;
      const ts = detectTs(docs);
      rec.tsField = ts;
      if (ts && docs.length) {
        const mx = (await db.collection(c).orderBy(ts,'desc').limit(1).get()).docs[0];
        rec.lastWrite = mx ? mx.data()[ts].toDate().toISOString().slice(0,10) : null;
        rec.writes365d = (await db.collection(c).where(ts,'>=',d365).count().get()).data().count;
      }
    } catch (e) { rec.err = e.message.slice(0,80); }
    out.tierC[c] = rec;
    console.log(`${c.padEnd(34)} count=${String(rec.count ?? '?').padEnd(8)} last=${rec.lastWrite ?? '—'} 365d=${rec.writes365d ?? '—'}`);
  }
  fs.writeFileSync('/Users/solar/Downloads/svstats/schema_samples.json', JSON.stringify(out, null, 2));
  console.log('\nDONE -> schema_samples.json');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
