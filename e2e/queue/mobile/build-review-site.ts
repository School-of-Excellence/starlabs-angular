// build-review-site.ts — generate a tester-friendly review site from the mobile-gallery frames.
//
// Grouped BY VARIATION, in WALK ORDER (entry→terminal), with a storyboard MONTAGE per variation and a
// FOLDER MIRROR (self-contained, shareable). Each self-move shows card → real form → advanced; each
// operator/auto hop shows the participant's card on the board. Run AFTER a run:
//   cd e2e && npx tsx queue/mobile/build-review-site.ts
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { buildTargets, TERMINAL } from './walk-lib';

const FLUTTER = path.resolve(__dirname, '../../../breakthroughs-flutter');
const GALLERY = path.join(FLUTTER, 'mobile-gallery');
const OUT = path.join(FLUTTER, 'mobile-review');
const MAGICK = process.env.MAGICK_BIN || '/opt/homebrew/bin/magick';
const FONT = process.env.MONTAGE_FONT || '/System/Library/Fonts/Supplemental/Arial.ttf'; // montage needs an explicit font (no fontconfig)
const san = (s: string) => String(s).replace(/[^A-Za-z0-9]+/g, '_');
const pad = (n: number) => String(n).padStart(2, '0');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// stage -> real form name, read from the test queue-generation actionresource wiring (best-effort).
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
      if (ar && typeof ar.get === 'function') {
        try { const f = await ar.get(); if (f.exists) out[stage] = f.data().formname || ''; } catch { /* skip */ }
      }
    }
    return out;
  } catch { return {}; }
}

interface Frame { label: string; src: string; }
interface Step { kind: 'self-move' | 'board' | 'terminal'; stage: string; form?: string; frames: Frame[]; }

(async () => {
  if (!fs.existsSync(GALLERY)) { console.error('no gallery at', GALLERY); process.exit(1); }
  const gallery = fs.readdirSync(GALLERY).filter((f) => f.endsWith('.png'));
  const forms = await formNamesByStage();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const targets = buildTargets();
  const idxRows: string[] = [];
  let vi = 0;

  for (const t of targets) {
    vi++;
    const prefix = `${t.vid}-p${t.participantIndex}`;
    const mine = gallery.filter((f) => f.startsWith(prefix + '-'));
    const pick = (re: RegExp) => mine.find((f) => re.test(f));
    const dir = path.join(OUT, `${pad(vi)}-${san(t.name)}`);
    fs.mkdirSync(dir, { recursive: true });

    const steps: Step[] = [];
    if (t.hops.length === 0) {
      const f = pick(new RegExp(`-parked-${san(t.terminal)}\\.png$`)) || pick(/-parked-/);
      steps.push({ kind: 'terminal', stage: t.terminal, form: forms[t.terminal], frames: f ? [{ label: 'parked card', src: f }] : [] });
    } else {
      t.hops.forEach((h: any, i: number) => {
        if (h.kind === 'SELF') {
          const fr: Frame[] = [];
          const c = pick(new RegExp(`-a-card-${san(h.from)}\\.png$`));
          const fo = pick(new RegExp(`-b-form-${san(h.from)}\\.png$`));
          const af = pick(new RegExp(`-c-after-${san(h.to)}\\.png$`));
          if (c) fr.push({ label: '1 · card', src: c });
          if (fo) fr.push({ label: '2 · real form', src: fo });
          if (af) fr.push({ label: `3 · advanced → ${h.to}`, src: af });
          steps.push({ kind: 'self-move', stage: h.from, form: forms[h.from], frames: fr });
        } else {
          const b = pick(new RegExp(`-board-${pad(i)}-at-${san(h.from)}\\.png$`)) || pick(new RegExp(`-board-\\d+-at-${san(h.from)}\\.png$`));
          steps.push({ kind: 'board', stage: h.from, frames: b ? [{ label: 'on operator board', src: b }] : [] });
        }
      });
    }

    // copy frames into the variation folder (folder mirror) + collect montage inputs
    const montageArgs: string[] = [];
    const stepHtml: string[] = [];
    let order = 0;
    for (const st of steps) {
      order++;
      const tiles: string[] = [];
      for (const fr of st.frames) {
        const typ = san(fr.label.replace(/^\d+ · /, ''));
        const dest = `${pad(order)}-${san(st.stage)}-${typ}.png`;
        try { fs.copyFileSync(path.join(GALLERY, fr.src), path.join(dir, dest)); } catch { continue; }
        montageArgs.push('-label', `${st.stage}\n${fr.label}`, path.join(dir, dest));
        tiles.push(`<figure><img src="${dest}" loading="lazy"><figcaption>${esc(fr.label)}</figcaption></figure>`);
      }
      const tag = st.kind === 'self-move'
        ? `<span class="tag self">SELF-MOVE · participant filled the REAL form${st.form ? ` "${esc(st.form)}"` : ''}</span>`
        : st.kind === 'board'
          ? `<span class="tag board">OPERATOR moved on the board</span>`
          : `<span class="tag term">PARKED at terminal</span>`;
      stepHtml.push(`<section class="step"><h3>${pad(order)}. ${esc(st.stage)} ${tag}</h3><div class="tiles">${tiles.join('') || '<em>(no frame captured)</em>'}</div></section>`);
    }

    let montage = '';
    if (montageArgs.length) {
      try {
        execFileSync(MAGICK, ['montage', '-font', FONT, ...montageArgs, '-tile', '4x', '-geometry', '200x430+6+24',
          '-background', '#0d1117', '-fill', '#e6edf3', '-pointsize', '12', '-title', t.name, path.join(dir, 'storyboard.png')], { timeout: 180000 });
        montage = 'storyboard.png';
      } catch (e: any) { console.log('  montage failed for', t.name, e.message); }
    }

    const selfN = t.hops.filter((h: any) => h.kind === 'SELF').length;
    const boardN = t.hops.filter((h: any) => h.kind !== 'SELF').length;
    const frameN = steps.reduce((s, x) => s + x.frames.length, 0);
    const reached = t.terminal === TERMINAL ? steps.some((s) => s.frames.some((f) => /c-after-Completed/.test(f.src))) : steps.some((s) => s.frames.length > 0);

    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset=utf8><title>${esc(t.name)}</title>
<style>body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;margin:0;padding:20px}
a{color:#58a6ff}h1{margin:0 0 4px}.meta{color:#8b949e;margin-bottom:16px}
.step{border:1px solid #30363d;border-radius:10px;padding:12px 14px;margin:12px 0}
.step h3{margin:0 0 10px;font-size:15px;font-weight:600}.tiles{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0}img{width:220px;border:1px solid #30363d;border-radius:6px;display:block}
figcaption{color:#8b949e;font:12px monospace;margin-top:4px}
.tag{font-size:11px;padding:2px 8px;border-radius:10px;margin-left:6px;white-space:nowrap}
.tag.self{background:#1f6feb33;color:#79c0ff}.tag.board{background:#a371f733;color:#d2a8ff}.tag.term{background:#3fb95033;color:#7ee787}
.story{max-width:100%;border:1px solid #30363d;border-radius:8px;margin:10px 0}</style>
<p><a href="../index.html">← all variations</a></p><h1>${esc(t.name)}</h1>
<div class="meta">participant ${t.participantIndex} · entry→${esc(t.terminal)} · ${selfN} REAL-form self-move(s) + ${boardN} board hop(s) · ${frameN} frames${reached ? ' · ✅ terminal reached' : ''}</div>
${montage ? `<h2>Storyboard</h2><img class="story" src="${montage}">` : ''}
<h2>Journey (walk order)</h2>
${stepHtml.join('\n')}`);

    idxRows.push(`<tr><td>${pad(vi)}</td><td><a href="${pad(vi)}-${san(t.name)}/index.html">${esc(t.name)}</a></td><td>${esc(t.terminal)}</td><td>${selfN}</td><td>${boardN}</td><td>${frameN}</td><td>${reached ? '✅' : '—'}</td></tr>`);
    console.log(`  ${pad(vi)} ${t.name}: ${frameN} frames, ${steps.length} steps${montage ? ' + storyboard' : ''}`);
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset=utf8><title>Mobile e2e — review</title>
<style>body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;padding:24px}
a{color:#58a6ff}table{border-collapse:collapse;width:100%;max-width:920px}th,td{border:1px solid #30363d;padding:8px 12px;text-align:left}th{background:#161b22}</style>
<h1>Mobile participant e2e — review by variation</h1>
<p style="color:#8b949e;max-width:920px">Each variation walks a participant entry→terminal. SELF-moves fill the REAL end-user forms via real Flutter taps; operator/auto hops happen on the real board. Click a variation for its walk-ordered journey + storyboard. (Authoritative pass/fail + per-frame blank checks live in the Playwright report; this site is for visual journey review.)</p>
<table><thead><tr><th>#</th><th>Variation</th><th>Terminal</th><th>Self-moves</th><th>Board hops</th><th>Frames</th><th>Terminal reached</th></tr></thead><tbody>
${idxRows.join('\n')}
</tbody></table>`);

  console.log(`\n✓ review site → breakthroughs-flutter/mobile-review/index.html (${targets.length} variations)`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
