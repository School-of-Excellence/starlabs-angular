// READ-ONLY exhaustive study of ONE >100-participant queue for the flow diagram.
// Computes: stages, variations + participant distribution, provider roster per stage
// (arena participant.stagerole), and peak specialists-per-studio (live assignment).
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
const fs = require('fs');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const QID = 'vuvS7eBgTxLKufnesLQT';
const has = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== '';
const day = (v) => v?.toDate ? v.toDate().toISOString().slice(0, 10) : null;

(async () => {
  const qg = (await db.collection('queue generation').doc(QID).get()).data();
  const stages = qg.stages || [];
  const sp = qg.stageproperty || {};
  console.log('QUEUE:', qg.description, '|', stages.length, 'stages');

  // ---- variations ----
  const variations = {};
  await Promise.all((qg.queuevariation || []).map(async vid => {
    const id = typeof vid === 'string' ? vid : vid?.id; if (!id) return;
    const s = await db.collection('queue variation').doc(id).get();
    if (s.exists) variations[id] = { name: s.data().variationname, stages: s.data().stages || [], atc: s.data().atcmodel || null };
  }));

  // ---- tokens: distribution per variation + per currentstage ----
  const toks = (await db.collection('queue_token').where('queueref', '==', db.collection('queue generation').doc(QID))
    .select('variationid', 'currentstage', 'profile_id').get()).docs.map(d => d.data());
  const varCount = {}, curStage = {};
  toks.forEach(t => { varCount[t.variationid ?? 'none'] = (varCount[t.variationid ?? 'none'] || 0) + 1; curStage[t.currentstage ?? 'null'] = (curStage[t.currentstage ?? 'null'] || 0) + 1; });

  // ---- queue stage log: passage count per stage + providers per stage ----
  const qsl = (await db.collection('queue stage log').where('queueref', '==', db.collection('queue generation').doc(QID))
    .select('currentstage', 'cwperson', 'diagnosticperson', 'people_involved', 'studioid', 'logdate').get()).docs.map(d => d.data());
  const passage = {}, providersByStage = {};
  qsl.forEach(l => {
    const st = l.currentstage ?? 'null';
    passage[st] = (passage[st] || 0) + 1;
    providersByStage[st] = providersByStage[st] || new Set();
    [l.cwperson, l.diagnosticperson].forEach(p => { if (has(p)) providersByStage[st].add(p); });
    (Array.isArray(l.people_involved) ? l.people_involved : []).forEach(p => { if (has(p)) providersByStage[st].add(p); });
  });

  // ---- arena participant: provider roster by stagerole ----
  const ap = (await db.collection('arena participant').where('queueid', '==', QID).select('profileid', 'stagerole').get()).docs.map(d => d.data());
  const roleCount = {};
  ap.forEach(a => { (String(a.stagerole || '').split(',').map(s => s.trim()).filter(Boolean)).forEach(r => { roleCount[r] = roleCount[r] || new Set(); roleCount[r].add(a.profileid); }); });
  const rosterByRole = Object.fromEntries(Object.entries(roleCount).map(([k, v]) => [k, v.size]));

  // ---- live assignment: studios + specialists per stage, peak concurrency ----
  const la = (await db.collection('live assignment').where('queueid', '==', QID)
    .select('stagename', 'stagetype', 'studioid', 'participantsactivity', 'bonusactivityparticipant', 'shadowperson', 'pairing', 'created', 'status').get()).docs.map(d => d.data());
  const specialistsOf = (x) => {
    const s = new Set();
    Object.keys(x.participantsactivity || {}).forEach(k => s.add(k));
    (Array.isArray(x.bonusactivityparticipant) ? x.bonusactivityparticipant : []).forEach(k => has(k) && s.add(k));
    if (has(x.shadowperson)) (Array.isArray(x.shadowperson) ? x.shadowperson : [x.shadowperson]).forEach(k => has(k) && s.add(k));
    if (x.pairing && typeof x.pairing === 'object') Object.keys(x.pairing).forEach(k => s.add(k));
    return s;
  };
  const byStage = {};
  la.forEach(x => {
    const st = x.stagename ?? '(none)';
    byStage[st] = byStage[st] || { type: x.stagetype, sessions: 0, studios: new Set(), specialists: new Set(), perStudioPeak: {}, byDayStudio: {} };
    const b = byStage[st];
    b.sessions++; if (x.stagetype) b.type = x.stagetype;
    if (x.studioid) b.studios.add(x.studioid);
    const sp2 = specialistsOf(x); sp2.forEach(s => b.specialists.add(s));
    const d = day(x.created);
    if (d && x.studioid) {
      b.byDayStudio[d] = b.byDayStudio[d] || {};
      b.byDayStudio[d][x.studioid] = b.byDayStudio[d][x.studioid] || new Set();
      sp2.forEach(s => b.byDayStudio[d][x.studioid].add(s));
    }
  });
  // peak day = day with most concurrent studios; report studios+specialists that day
  const stageStudio = {};
  Object.entries(byStage).forEach(([st, b]) => {
    let peakDay = null, peakStudios = 0;
    Object.entries(b.byDayStudio).forEach(([d, studios]) => { const n = Object.keys(studios).length; if (n > peakStudios) { peakStudios = n; peakDay = d; } });
    const peakDetail = peakDay ? Object.entries(b.byDayStudio[peakDay]).map(([sid, set]) => set.size) : [];
    stageStudio[st] = { type: b.type, sessions: b.sessions, studios: b.studios.size, specialists: b.specialists.size, peakDay, peakStudios, specialistsPerStudioAtPeak: peakDetail };
  });

  // ---- assemble + print ----
  const out = { queue: qg.description, qid: QID, stagesCount: stages.length, participants: toks.length,
    variations: Object.entries(variations).map(([id, v]) => ({ name: v.name, atc: v.atc, stages: v.stages.length, participants: varCount[id] || 0 })).sort((a, b) => b.participants - a.participants),
    rosterByRole, stages: [], curStage, };
  console.log('\n=== VARIATIONS (', Object.keys(variations).length, ') ===');
  out.variations.forEach(v => console.log(`  ${String(v.participants).padStart(4)} ppl | ${v.stages}st | atc=${v.atc || '-'} | ${v.name}`));
  console.log('\n=== PROVIDER ROSTER (arena participant, n=' + ap.length + ' providers) by stagerole ===');
  Object.entries(rosterByRole).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => console.log(`  ${String(c).padStart(3)} BIG available | ${r}`));
  console.log('\n=== STAGES (ordered) — kind, passage, studios, peak specialists/studio ===');
  stages.forEach((st, i) => {
    const p = sp[st] || {};
    const specialist = has(p.compulsoryactivity) || has(p.studiowidgets) || (stageStudio[st] && stageStudio[st].sessions > 0);
    const kind = specialist ? 'SPEC' : (['form', 'link', 'videoask', 'evolutionmapping'].includes(p.actiontype) ? 'self' : 'gate');
    const ss = stageStudio[st] || {};
    const peak = ss.specialistsPerStudioAtPeak ? `[${ss.specialistsPerStudioAtPeak.join(',')}]` : '-';
    out.stages.push({ i, name: st, kind, action: p.actiontype || null, widgets: p.studiowidgets || null, passage: passage[st] || 0, current: curStage[st] || 0, studios: ss.studios || 0, sessions: ss.sessions || 0, peakDay: ss.peakDay || null, peakStudios: ss.peakStudios || 0, specialistsPerStudioAtPeak: ss.specialistsPerStudioAtPeak || [], specialistsTotal: ss.specialists || 0, stagetype: ss.type || null });
    console.log(`  ${String(i).padStart(2)}. ${st.slice(0, 34).padEnd(35)} ${kind} | passed ${String(passage[st] || 0).padStart(4)} | studios ${String(ss.studios || 0).padStart(3)} | peak ${String(ss.peakStudios || 0).padStart(2)} studios x specialists ${peak}${ss.peakDay ? ' on ' + ss.peakDay : ''}`);
  });
  fs.writeFileSync('/Users/solar/Downloads/svstats/queue_study_out.json', JSON.stringify(out, null, 2));
  console.log('\nwrote queue_study_out.json');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
