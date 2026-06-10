// build-test-map.ts — generate a self-contained test-map.html:
//   A. the whole test landscape (suites, how to run, what to expect)
//   B. the 9 end-to-end mobile journeys (entry→terminal) as flow diagrams, grouped by variation,
//      each hop tagged SELF (real form, with the form name) or BOARD (operator/auto), linking to the
//      screenshot storyboard in the review site.
// Run: cd e2e && npx tsx queue/mobile/build-test-map.ts   (→ e2e/test-map.html)
import * as fs from 'fs';
import * as path from 'path';
import { buildTargets } from './walk-lib';

const OUT = path.resolve(__dirname, '../../test-map.html');
const REVIEW_REL = '../breakthroughs-flutter/mobile-review'; // relative from e2e/
const REVIEW_ABS = path.resolve(__dirname, '../../../breakthroughs-flutter/mobile-review');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const san = (s: string) => String(s).replace(/[^A-Za-z0-9]+/g, '_');
const pad = (n: number) => String(n).padStart(2, '0');

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

const LANDSCAPE = `
<section>
<h2>A. Test landscape</h2>
<p class="sub">All web e2e run from <code>e2e/</code> against the disposable CLOUD test project <b>slabs-queue-e2e-exdcz</b> (real Cloud Functions + Firestore). Never prod <code>fir-sample-aae4a</code>; ATC collections OFF-LIMITS. <code>SKIP_SEED=1</code> reuses the existing seed.</p>
<div class="tree">
<div class="grp"><b>WEB e2e — Playwright</b>
  <ul>
    <li><span class="k">Queue (desktop, comprehensive)</span> — <code>playwright.queue.config.ts → ./queue</code> (~119 cases incl. 9 variation specs + invariants). Anti-circular queue/studio/BIG board; participant moves via Admin-SDK sim.</li>
    <li><span class="k">12 component-group suites</span> — one config + dir each: appointments · authroles · business · comms · content · events · evomap · journey · modes · profiles · support · workshops.</li>
    <li><span class="k">Invariants self-test</span> — <code>playwright.invariants.config.ts</code> (oracle/guards prove themselves).</li>
    <li><span class="k">Conferencing / video</span> — <code>playwright.config.ts</code> (T1–T10: grid, join/leave, camera, mic, network, screenshare, blur, rejoin).</li>
    <li><span class="k">Emulator variant</span> — <code>playwright.queue.emulator.config.ts</code> (queue vs local Firebase emulator, offline).</li>
  </ul>
</div>
<div class="grp"><b>MOBILE e2e — REAL Flutter app on iOS simulator</b>
  <ul>
    <li><code>playwright.mobile.config.ts → queue/mobile/mobile-walk.spec.ts</code>. Participant self-moves = real taps on <code>breakthroughs</code> filling the REAL forms (flutter drive walk_test.dart); operator/auto hops = real Angular board. <b>The 9 journeys below.</b> Expanding 9 → 72 paths / 50 users.</li>
  </ul>
</div>
<div class="grp"><b>ANGULAR unit (Karma/Jasmine)</b> — <code>ng test</code> &nbsp;<span class="warn">⚠ BROKEN</span> (398/399 empty stubs; casing + missing chime dep).</div>
</div>
<h3>How to run + what to expect</h3>
<table>
<thead><tr><th>Suite</th><th>Command (repo root)</th><th>Expect</th></tr></thead>
<tbody>
<tr><td>Prereqs</td><td><code>npm install --legacy-peer-deps</code> · <code>ng build</code></td><td>—</td></tr>
<tr><td>Queue (desktop)</td><td><code>cd e2e &amp;&amp; SKIP_SEED=1 npx playwright test --config=playwright.queue.config.ts</code></td><td>green (~188/194)</td></tr>
<tr><td>Any group</td><td><code>cd e2e &amp;&amp; SKIP_SEED=1 npx playwright test --config=playwright.&lt;group&gt;.config.ts</code></td><td>green</td></tr>
<tr><td>Invariants</td><td><code>cd e2e &amp;&amp; npx playwright test --config=playwright.invariants.config.ts</code></td><td>green</td></tr>
<tr><td>Conferencing</td><td><code>npm run e2e:T1</code> … <code>e2e:T10</code></td><td>needs LiveKit</td></tr>
<tr><td>Emulator</td><td>start emulator → <code>playwright.queue.emulator.config.ts</code></td><td>green, offline</td></tr>
<tr><td>Mobile (real app)</td><td>boot sim → <code>cd e2e &amp;&amp; SKIP_SEED=1 FLUTTER_BIN=/opt/homebrew/bin/flutter [VARIATIONS="LYL - First Cycle"] npx playwright test --config=playwright.mobile.config.ts</code></td><td>9 green</td></tr>
<tr><td>Unit</td><td><code>ng test</code></td><td>⚠ broken</td></tr>
</tbody>
</table>
<p class="sub">Reports: <code>e2e/playwright-report-&lt;group&gt;/</code>; mobile → <code>playwright-report-mobile/</code> + rotating <code>…-archive/</code> + tester review site <code>breakthroughs-flutter/mobile-review/</code>. Exact per-group tallies live in <code>PROGRESS.md</code>.</p>
</section>`;

(async () => {
  const targets = buildTargets();
  const forms = await formNamesByStage();
  const reviewExists = fs.existsSync(REVIEW_ABS);

  // summary table
  const rows = targets.map((t: any, i: number) => {
    const selfN = t.hops.filter((h: any) => h.kind === 'SELF').length;
    const boardN = t.hops.filter((h: any) => h.kind !== 'SELF').length;
    return `<tr><td>${pad(i + 1)}</td><td>${esc(t.name)}</td><td>${esc(t.terminal)}</td><td>${selfN}</td><td>${boardN}</td><td>${t.journey.length}</td></tr>`;
  }).join('');

  // per-journey flow diagrams
  const journeys = targets.map((t: any, vi: number) => {
    const reviewDir = `${pad(vi + 1)}-${san(t.name)}`;
    const story = fs.existsSync(path.join(REVIEW_ABS, reviewDir, 'storyboard.png'));
    const link = reviewExists ? `${REVIEW_REL}/${reviewDir}/index.html` : '';
    const parts: string[] = [];
    if (t.hops.length === 0) {
      parts.push(`<span class="chip entry term">${esc(t.terminal)}</span><span class="hop term">parked terminal</span>`);
    } else {
      parts.push(`<span class="chip entry">${esc(t.journey[0])}</span>`);
      t.hops.forEach((h: any, i: number) => {
        const kind = h.kind === 'SELF' ? 'self' : 'board';
        const label = h.kind === 'SELF'
          ? `form${forms[h.from] ? `: ${esc(forms[h.from])}` : ''}`
          : (h.kind === 'AUTO' ? 'auto' : 'operator');
        const last = i === t.hops.length - 1;
        parts.push(`<span class="hop ${kind}" title="${esc(h.from)} → ${esc(h.to)}">▸ ${label}</span>`);
        parts.push(`<span class="chip${last ? ' term' : ''}">${esc(t.journey[i + 1])}</span>`);
      });
    }
    const selfN = t.hops.filter((h: any) => h.kind === 'SELF').length;
    const boardN = t.hops.filter((h: any) => h.kind !== 'SELF').length;
    return `<div class="journey">
      <h3>${pad(vi + 1)}. ${esc(t.name)} <span class="meta">entry→${esc(t.terminal)} · ${selfN} real-form self-move(s) + ${boardN} board hop(s)${link ? ` · <a href="${link}">screenshots ↗</a>` : ''}</span></h3>
      <div class="flow">${parts.join('')}</div>
      ${story ? `<a href="${link}"><img class="story" src="${REVIEW_REL}/${reviewDir}/storyboard.png" loading="lazy"></a>` : ''}
    </div>`;
  }).join('\n');

  const html = `<!doctype html><meta charset=utf8><title>StarLabs — Test Map</title>
<style>
:root{color-scheme:dark}
body{background:#0d1117;color:#e6edf3;font-family:system-ui,-apple-system,sans-serif;margin:0;padding:28px;line-height:1.5}
h1{margin:0 0 6px}h2{border-bottom:1px solid #30363d;padding-bottom:6px;margin-top:34px}
a{color:#58a6ff}code{background:#161b22;border:1px solid #30363d;border-radius:5px;padding:1px 5px;font-size:12px}
.sub{color:#8b949e;max-width:1000px}.warn{color:#f0883e;font-weight:600}
.tree .grp{border:1px solid #30363d;border-radius:10px;padding:10px 16px;margin:10px 0;background:#11161d}
.tree .k{color:#7ee787;font-weight:600}.tree ul{margin:6px 0}
table{border-collapse:collapse;width:100%;max-width:1100px;margin:10px 0}
th,td{border:1px solid #30363d;padding:7px 11px;text-align:left;vertical-align:top}th{background:#161b22}
.journey{border:1px solid #30363d;border-radius:10px;padding:12px 16px;margin:14px 0;background:#11161d}
.journey h3{margin:0 0 10px;font-size:15px}.meta{color:#8b949e;font-weight:400;font-size:13px}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px}
.chip{background:#1b2330;border:1px solid #30363d;border-radius:7px;padding:4px 9px;font-size:12.5px}
.chip.entry{border-color:#3fb950}.chip.term{background:#15301c;border-color:#3fb950;color:#7ee787;font-weight:600}
.hop{font-size:11px;padding:2px 7px;border-radius:9px;white-space:nowrap}
.hop.self{background:#1f6feb22;color:#79c0ff;border:1px solid #1f6feb55}
.hop.board{background:#a371f722;color:#d2a8ff;border:1px solid #a371f755}
.hop.term{background:#3fb95022;color:#7ee787}
.story{max-width:100%;border:1px solid #30363d;border-radius:8px;margin-top:12px;display:block}
.legend{display:flex;gap:14px;margin:8px 0;font-size:12px;color:#8b949e;flex-wrap:wrap}
</style>
<h1>StarLabs — Test Map</h1>
<p class="sub">Generated from the live config inventory + the queue oracle. Section A: every test suite, how to run it, what to expect. Section B: the 9 end-to-end mobile journeys we have today (real-app participant walks).</p>
${LANDSCAPE}
<section>
<h2>B. The 9 end-to-end mobile journeys</h2>
<p class="sub">Each variation walks a participant <b>entry → terminal</b> on the REAL app. <span style="color:#79c0ff">Blue</span> = participant self-move (fills the REAL form, named); <span style="color:#d2a8ff">purple</span> = operator/auto move on the board. Click a storyboard / "screenshots ↗" for the per-stage captures.</p>
<div class="legend"><span>🟩 entry / terminal</span><span style="color:#79c0ff">▸ self-move (real form)</span><span style="color:#d2a8ff">▸ board hop</span></div>
<table><thead><tr><th>#</th><th>Variation</th><th>Terminal</th><th>Self-moves</th><th>Board hops</th><th>Stages</th></tr></thead><tbody>${rows}</tbody></table>
${journeys}
</section>
<p class="sub" style="margin-top:30px">Coverage today: 9 representative journeys (1 primary path/variation). Full model = 72 distinct paths across 50 seeded users — expansion in progress. ${reviewExists ? '' : '(Run the mobile suite + <code>build-review-site.ts</code> to populate storyboards.)'}</p>`;

  fs.writeFileSync(OUT, html);
  console.log(`✓ test map → e2e/test-map.html (${targets.length} journeys${reviewExists ? ', linked to review site' : ''})`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
