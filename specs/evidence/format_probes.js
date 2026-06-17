// Compact, human-readable digest of schema_samples.json + config_deep.json (no Firestore reads).
const fs = require('fs');
const S = JSON.parse(fs.readFileSync('/Users/solar/Downloads/svstats/schema_samples.json'));
const C = JSON.parse(fs.readFileSync('/Users/solar/Downloads/svstats/config_deep.json'));

const arg = process.argv[2] || 'schema';

if (arg === 'schema') {
  console.log(`# SCHEMA SAMPLES (now=${S.now})  — top fields by fill%\n`);
  for (const [name, r] of Object.entries(S.sample)) {
    if (r.err) { console.log(`## ${name}  ERR ${r.err}`); continue; }
    const top = Object.entries(r.fields || {}).slice(0, 22)
      .map(([k, v]) => `${k}:${v.fillPct}%${v.type !== 'null' ? '(' + v.type + ')' : ''}`).join('  ');
    console.log(`## ${name}  n=${r.count} sampled=${r.sampled} ts=${r.tsField || '—'} last=${r.lastWrite || '—'} 90d=${r.writes90d ?? '—'} 365d=${r.writes365d ?? '—'} ids=[${(r.sampleDocIds||[]).join(', ')}]`);
    console.log(`   ${top}\n`);
  }
}

if (arg === 'config') {
  console.log(`# CONFIG VARIANTS\n`);
  for (const [name, r] of Object.entries(C.config)) {
    if (r.err) { console.log(`## ${name}  ERR ${r.err}`); continue; }
    console.log(`## ${name}  n=${r.count} sampled=${r.sampled} distinctKeySets=${r.variantCount}`);
    (r.variants || []).forEach((v, i) => {
      console.log(`   variant#${i + 1} (${v.count} docs, eg ${v.exampleId}): ${v.shape}`);
    });
    console.log('');
  }
}

if (arg === 'tierc') {
  console.log(`# TIER-C (count + recency)\n`);
  for (const [name, r] of Object.entries(S.tierC)) {
    console.log(`${name.padEnd(34)} n=${String(r.count).padEnd(7)} last=${r.lastWrite || '—'} 365d=${r.writes365d ?? '—'}${r.err ? '  ERR ' + r.err : ''}`);
  }
}
