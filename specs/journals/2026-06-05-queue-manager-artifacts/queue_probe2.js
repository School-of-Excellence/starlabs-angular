// READ-ONLY probe #2 for Queue Manager (concept group #3):
//  (A) reverse-engineer variation-assignment rules from data (variation x journey x new/returning)
//  (B) classify the session series: self-guided vs specialist-led stages
//  (C) map the studio buttons (studiowidgets) specialists/BIG click in-session
//  (D) first peek at delivery batching (cohort/segment + live-assignment grouping)
// NO writes. Stays out of ATC (atc_*, queue_atc_generation).
const admin = require('firebase-admin');
const sa = require('/Users/solar/Downloads/serviceAccountKeyProduction.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const has = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== '';
const top = (obj, n = 6) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

(async () => {
  // ---- find the queue with the most tokens (the rich sample) ----
  const qgSnap = await db.collection('queue generation').get();
  const qgById = {}; qgSnap.docs.forEach(d => qgById[d.id] = d.data());
  const qtAll = await db.collection('queue_token').select('profile_id', 'queueref', 'variationid', 'currentstage').get();
  const byQueue = {};
  qtAll.docs.forEach(d => { const x = d.data(); const q = x.queueref?.id; if (q) { (byQueue[q] = byQueue[q] || []).push(x); } });
  const [qid, toks] = Object.entries(byQueue).sort((a, b) => b[1].length - a[1].length)[0];
  const qg = qgById[qid] || {};
  console.log('=== SAMPLE QUEUE:', (qg.description || qid).slice(0, 55), '|', toks.length, 'participants ===');

  // ---- variation names for this queue ----
  const varNames = {};
  const varRefs = (qg.queuevariation || []);
  await Promise.all(varRefs.map(async vid => {
    const id = typeof vid === 'string' ? vid : vid?.id;
    if (!id) return;
    const s = await db.collection('queue variation').doc(id).get();
    if (s.exists) varNames[id] = { name: s.data().variationname, stages: (s.data().stages || []).length, atc: s.data().atcmodel || null };
  }));

  // ---- journey history per participant (for new/returning + journey rule) ----
  const profileIds = new Set(toks.map(t => t.profile_id));
  const pjp = await db.collection('participantjourneyproduct').select('profileid', 'journeyref', 'journeystatus', 'purchasedate').get();
  const journeysByProfile = {};
  const journeyRefIds = new Set();
  pjp.docs.forEach(d => {
    const x = d.data();
    if (!profileIds.has(x.profileid)) return;
    (journeysByProfile[x.profileid] = journeysByProfile[x.profileid] || []).push(x);
    if (x.journeyref?.id) journeyRefIds.add(x.journeyref.id);
  });
  // resolve journey names
  const journeyName = {};
  await Promise.all([...journeyRefIds].map(async jid => {
    const s = await db.collection('journey').doc(jid).get();
    if (s.exists) journeyName[jid] = s.data().journey || s.data().journeyname || jid;
  }));

  // ---- (A) variation rules: per variation → count, top current journeys, % returning ----
  console.log('\n=== (A) VARIATION RULES (reverse-engineered) ===');
  const byVar = {};
  toks.forEach(t => { (byVar[t.variationid ?? 'none'] = byVar[t.variationid ?? 'none'] || []).push(t); });
  for (const [vid, vtoks] of Object.entries(byVar).sort((a, b) => b[1].length - a[1].length)) {
    const meta = varNames[vid] || {};
    const jc = {}; let returning = 0, withHist = 0;
    vtoks.forEach(t => {
      const hist = journeysByProfile[t.profile_id] || [];
      if (hist.length) {
        withHist++;
        // current journey = most recent purchase
        const cur = hist.slice().sort((a, b) => (b.purchasedate?.toMillis?.() || 0) - (a.purchasedate?.toMillis?.() || 0))[0];
        const nm = journeyName[cur.journeyref?.id] || '(unknown)';
        jc[nm] = (jc[nm] || 0) + 1;
        // returning = has >=1 completed journey
        if (hist.some(h => h.journeystatus === 'completed')) returning++;
      }
    });
    console.log(`\n  VAR "${meta.name || vid}" (${meta.stages || '?'} stages, atc=${meta.atc || 'none'}) — ${vtoks.length} participants`);
    console.log(`     top current journeys: ${JSON.stringify(top(jc, 5))}`);
    console.log(`     returning (>=1 completed journey): ${returning}/${withHist}  (${withHist ? (100 * returning / withHist).toFixed(0) : 0}%)  → ${returning / (withHist || 1) < 0.3 ? 'mostly FIRST-TIME' : returning / (withHist || 1) > 0.7 ? 'mostly RETURNING' : 'mixed'}`);
  }

  // ---- (B) session-series classification: self-guided vs specialist ----
  console.log('\n=== (B) SESSION SERIES — self-guided vs specialist-led (this queue) ===');
  const sp = qg.stageproperty || {};
  (qg.stages || []).forEach((st, i) => {
    const p = sp[st] || {};
    const specialist = has(p.compulsoryactivity) || p.enablezoom || has(p.studiowidgets);
    const selfguided = ['form', 'link', 'videoask', 'evolutionmapping'].includes(p.actiontype) && !specialist;
    const kind = specialist ? 'SPECIALIST (studio)' : selfguided ? 'self-guided' : (p.actiontype ? `action:${p.actiontype}` : 'control/gate');
    const widgets = has(p.studiowidgets) ? ` widgets=[${p.studiowidgets.join(',')}]` : '';
    const act = p.actiontype ? ` action=${p.actiontype}` : '';
    console.log(`  ${String(i).padStart(2)}. ${st.slice(0, 38).padEnd(39)} ${kind}${act}${widgets}`);
  });

  // ---- (C) studio buttons (studiowidgets) across ALL queues ----
  console.log('\n=== (C) STUDIO BUTTONS (studiowidgets) — across all 96 queues ===');
  const widgetCount = {};
  qgSnap.docs.forEach(d => {
    const s = d.data().stageproperty || {};
    Object.values(s).forEach(p => { (p?.studiowidgets || []).forEach(w => widgetCount[w] = (widgetCount[w] || 0) + 1); });
  });
  top(widgetCount, 30).forEach(([w, c]) => console.log(`   ${w.padEnd(26)} ${c} stages`));

  // ---- (D) delivery batching peek: live assignments grouped by stage for this queue's participants ----
  console.log('\n=== (D) DELIVERY BATCHING peek — live assignments by stage (sample) ===');
  try {
    const la = await db.collection('live assignment').where('queueref', '==', db.collection('queue generation').doc(qid)).select('stage', 'studioid', 'participantsactivity', 'profileid').limit(4000).get();
    const byStage = {};
    la.docs.forEach(d => { const x = d.data(); const st = x.stage ?? 'null'; byStage[st] = byStage[st] || { sessions: 0, studios: new Set() }; byStage[st].sessions++; if (x.studioid) byStage[st].studios.add(x.studioid); });
    console.log('   live-assignment sessions per stage (studios = distinct studio sessions):');
    Object.entries(byStage).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 12).forEach(([st, v]) => console.log(`     ${st.slice(0, 36).padEnd(37)} sessions=${v.sessions} studios=${v.studios.size}`));
  } catch (e) { console.log('   (live assignment by queueref skipped:', e.message, ')'); }

  console.log('\nDONE');
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
