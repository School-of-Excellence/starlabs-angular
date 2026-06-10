// build-paths-map.ts — emit e2e/paths-map.html: EVERY forward path (journey) in the queue model,
// grouped by variation, each as a flow diagram, with the primary (walked-today) path marked — so the
// testing team can validate that all paths are captured/covered.
// Run: cd e2e && npx tsx queue/mobile/build-paths-map.ts   (→ e2e/paths-map.html)
import * as fs from 'fs';
import * as path from 'path';
import { classifyForwardHop, primaryJourney } from './walk-lib';
const cfg = require('../../fixtures/sample-queue-config.json');
const { forwardJourneys } = require('../../lib/forward-journeys');
const { generatePlan } = require('../../lib/path-generator');

const OUT = path.resolve(__dirname, '../../paths-map.html');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sameJourney = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

async function formNamesByStage(): Promise<Record<string, string>> {
  try {
    const admin = require('firebase-admin');
    const { TEST_PROJECT_ID } = require('../../lib/test-project');
    if (!admin.apps.length) admin.initializeApp({ projectId: TEST_PROJECT_ID });
    const db = admin.firestore();
    const gen = await db.collection('queue generation').doc(`run1_${process.env.QUEUE_ID || 'L3rqCrqDBsshd7HM5YRn'}`).get();
    const sp = gen.exists ? (gen.data()!.stageproperty || {}) : {};
    const out: Record<string, string> = {};
    for (const stage of Object.keys(sp)) {
      const ar = sp[stage]?.actionresource;
      if (ar && typeof ar.get === 'function') { try { const f = await ar.get(); if (f.exists) out[stage] = f.data().formname || ''; } catch {} }
    }
    return out;
  } catch { return {}; }
}

(async () => {
  const forms = await formNamesByStage();
  const plan = generatePlan(cfg, Number(process.env.TOTAL_PARTICIPANTS || 50));

  let totalPaths = 0;
  let primaryCount = 0;
  const summaryRows: string[] = [];
  const sections: string[] = [];

  for (const v of plan.variations) {
    const journeys: string[][] = forwardJourneys(cfg, v.id);
    const primary = primaryJourney(v.id);
    totalPaths += journeys.length;

    const pathBlocks = journeys.map((j, ji) => {
      const isPrimary = primary.length > 0 && sameJourney(j, primary);
      if (isPrimary) primaryCount++;
      const hops = j.slice(0, -1).map((from, i) => classifyForwardHop(from, j[i + 1], v.id));
      const parts: string[] = [`<span class="chip entry">${esc(j[0])}</span>`];
      hops.forEach((h: any, i: number) => {
        const kind = h.kind === 'SELF' ? 'self' : 'board';
        const label = h.kind === 'SELF' ? `form${forms[h.from] ? ': ' + esc(forms[h.from]) : ''}` : (h.kind === 'AUTO' ? 'auto' : 'operator');
        parts.push(`<span class="hop ${kind}" title="${esc(h.from)} → ${esc(h.to)}">▸ ${label}</span>`);
        parts.push(`<span class="chip${i === hops.length - 1 ? ' term' : ''}">${esc(j[i + 1])}</span>`);
      });
      const selfN = hops.filter((h: any) => h.kind === 'SELF').length;
      const boardN = hops.filter((h: any) => h.kind !== 'SELF').length;
      return `<div class="path${isPrimary ? ' primary' : ''}">
        <div class="phead"><span class="cap">${isPrimary ? '✅' : '☐'}</span> Path ${ji + 1}/${journeys.length} · ${j.length} stages · ${selfN} self-move(s) + ${boardN} board hop(s) ${isPrimary ? '<span class="tag">PRIMARY — walked today</span>' : '<span class="tag pend">pending real-app walk</span>'}</div>
        <div class="flow">${parts.join('')}</div>
      </div>`;
    }).join('\n');

    summaryRows.push(`<tr><td>${esc(v.variationname)}</td><td>${journeys.length}</td><td>${v.participants}</td><td>1 (primary)</td><td>${journeys.length - 1}</td></tr>`);
    sections.push(`<section class="vargrp"><h2>${esc(v.variationname)} <span class="meta">${journeys.length} path(s) · ${v.participants} seeded user(s)</span></h2>${pathBlocks}</section>`);
  }

  const html = `<!doctype html><meta charset=utf8><title>StarLabs — All Queue Paths</title>
<style>
:root{color-scheme:dark}
body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:28px;line-height:1.5}
h1{margin:0 0 6px}h2{border-bottom:1px solid #30363d;padding-bottom:6px;margin-top:30px;font-size:18px}
a{color:#58a6ff}code{background:#161b22;border:1px solid #30363d;border-radius:5px;padding:1px 5px;font-size:12px}
.sub{color:#8b949e;max-width:1000px}
table{border-collapse:collapse;width:100%;max-width:760px;margin:10px 0}th,td{border:1px solid #30363d;padding:7px 11px;text-align:left}th{background:#161b22}
.kpi{display:flex;gap:22px;margin:14px 0;flex-wrap:wrap}
.kpi div{background:#11161d;border:1px solid #30363d;border-radius:10px;padding:10px 18px}
.kpi b{font-size:24px;color:#7ee787}
.vargrp{margin-bottom:8px}
.path{border:1px solid #30363d;border-radius:9px;padding:9px 13px;margin:9px 0;background:#11161d}
.path.primary{border-color:#3fb95066;background:#0f1c14}
.phead{font-size:12.5px;color:#8b949e;margin-bottom:8px}.cap{font-size:13px}
.tag{font-size:10.5px;padding:2px 7px;border-radius:9px;background:#3fb95022;color:#7ee787;margin-left:6px}
.tag.pend{background:#8b949e22;color:#b3bdc7}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:5px 3px}
.chip{background:#1b2330;border:1px solid #30363d;border-radius:7px;padding:3px 8px;font-size:12px}
.chip.entry{border-color:#3fb950}.chip.term{background:#15301c;border-color:#3fb950;color:#7ee787;font-weight:600}
.hop{font-size:10.5px;padding:2px 6px;border-radius:9px;white-space:nowrap}
.hop.self{background:#1f6feb22;color:#79c0ff;border:1px solid #1f6feb55}
.hop.board{background:#a371f722;color:#d2a8ff;border:1px solid #a371f755}
.legend{display:flex;gap:16px;margin:8px 0;font-size:12px;color:#8b949e;flex-wrap:wrap}
</style>
<h1>StarLabs — All Queue Paths (coverage validation)</h1>
<p class="sub">Every distinct forward path (journey) the queue model defines, grouped by variation — for the testing team to confirm all paths are captured. <span style="color:#79c0ff">Blue</span> = participant self-move (real form, named); <span style="color:#d2a8ff">purple</span> = operator/auto board hop. ✅ = primary path walked on the real app today; ☐ = pending real-app walk (72-path expansion in progress).</p>
<div class="kpi">
  <div><b>${totalPaths}</b><br>distinct paths</div>
  <div><b>${plan.variations.length}</b><br>variations</div>
  <div><b>${plan.variations.reduce((s: number, v: any) => s + v.participants, 0)}</b><br>seeded users</div>
  <div><b>${primaryCount}</b><br>walked today (primary)</div>
</div>
<div class="legend"><span>🟩 entry / terminal</span><span style="color:#79c0ff">▸ self-move (real form)</span><span style="color:#d2a8ff">▸ board hop</span><span>✅ walked · ☐ pending</span></div>
<h2 style="border:0">Coverage summary</h2>
<table><thead><tr><th>Variation</th><th>Paths</th><th>Seeded users</th><th>Walked today</th><th>Pending</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
${sections.join('\n')}
<p class="sub" style="margin-top:28px">Generated from the queue oracle (<code>forwardJourneys</code> + <code>classifyForwardHop</code>). Regenerate: <code>cd e2e &amp;&amp; npx tsx queue/mobile/build-paths-map.ts</code>. As the 72-path real-app run completes, ☐ flips to ✅.</p>`;

  fs.writeFileSync(OUT, html);
  console.log(`✓ paths map → e2e/paths-map.html (${totalPaths} paths across ${plan.variations.length} variations, ${primaryCount} primary)`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
