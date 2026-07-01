// READ-ONLY deep config probe (CONFIGURATION.md evidence): enumerate config-shape VARIANTS + nested shapes.
// For each CONFIG collection: sample up to 200 docs, cluster by distinct top-level key-set (the "schema variants"),
// and emit a representative nested shape per variant. Secrets (classify) are redacted to key-existence only.
// HARD ATC DENYLIST. No writes.
const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ credential: admin.credential.cert(require('/Users/solar/Downloads/serviceAccountKeyProduction.json')) });
const db = admin.firestore();

const ATC_SAFE = new Set(['atc taxonomy','atc model','atcmodel level config']);
function assertNotATC(name){ const n=name.toLowerCase(); if(ATC_SAFE.has(name))return;
  if(/\batc\b/.test(n)||n.includes('atc_')||n.includes('tripleatc')||n.includes('triple atc')||n.includes('atcinvolved')) throw new Error(`ATC DENYLIST VIOLATION: ${name}`); }

const isTs = (v) => v && (v instanceof admin.firestore.Timestamp || typeof v.toDate === 'function');
// nested shape, depth-limited; arrays show [len] + element-shape of first; secrets redacted by key-name.
const SECRET_RE = /(apikey|api_key|claudeapikey|secret|token|password|signature|credential|privatekey)/i;
function shape(o, d = 0) {
  if (o === null || o === undefined) return 'null';
  if (isTs(o)) return 'ts';
  if (Array.isArray(o)) return o.length ? `array[${o.length}]<${shape(o[0], d+1)}>` : 'array[0]';
  if (o && (o._path || o._firestore || (o.path && o.id && o.parent))) return 'ref';
  const t = typeof o;
  if (t !== 'object') return t === 'string' ? `str(${o.length})` : t;
  if (d > 2) return 'map';
  return '{' + Object.keys(o).slice(0, 40).map(k => `${k}:${SECRET_RE.test(k) ? 'REDACTED' : shape(o[k], d+1)}`).join(', ') + '}';
}
const keysig = (x) => Object.keys(x).sort().join('|');

const CONFIG_COLS = [
  'queue generation','queue variation',          // queue config (known drift)
  'arenaspace',                                   // studio space config
  'dashboard',                                    // nav/ACL config
  'classify',                                     // app-config singletons (SECRETS)
  'modes','productToDeliverySequence','procedures','tier access config', // cross-cutting
  'appointmenttype','delivery events','delivery forms','AppointmentType-To-Roles','Roles-To-EIS', // scheduling config
  'journey','products','package','journey-to-product','biglevel','accelerated evolution level','bigactivity','tier', // catalog
];

(async () => {
  const out = { generatedAt: new Date().toISOString(), config: {} };
  for (const c of CONFIG_COLS) {
    assertNotATC(c);
    const rec = { collection: c };
    try {
      rec.count = (await db.collection(c).count().get()).data().count;
      const docs = (await db.collection(c).limit(200).get()).docs;
      rec.sampled = docs.length;
      // cluster by top-level key-set
      const variants = {};
      docs.forEach(d => {
        const x = d.data();
        const sig = keysig(x);
        if (!variants[sig]) variants[sig] = { count: 0, exampleId: d.id, keys: Object.keys(x).sort(), shape: shape(x) };
        variants[sig].count++;
      });
      rec.variantCount = Object.keys(variants).length;
      rec.variants = Object.values(variants).sort((a,b) => b.count - a.count).slice(0, 6); // top-6 variants
    } catch (e) { rec.err = e.message.slice(0,80); }
    out.config[c] = rec;
    console.log(`${c.padEnd(30)} count=${String(rec.count ?? '?').padEnd(7)} variants=${rec.variantCount ?? '?'}`);
  }
  fs.writeFileSync('/Users/solar/Downloads/svstats/config_deep.json', JSON.stringify(out, null, 2));
  console.log('\nDONE -> config_deep.json');
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
