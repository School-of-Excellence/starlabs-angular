// build-queue-logic.ts — generate the QUEUE-suite test-logic reference for the testing team:
//   queue-test-logic.html  — browsable cards (objective + assertions & why-they-hold), grouped by spec
//   queue-test-logic.md    — same, for PR/Docs review + inline comments
//   queue-test-logic.csv   — enriched sheet (Objective/Assertions + Reviewed/Reviewer/Notes) for sign-off
// Pulled from the specs: each test()'s title + its leading comment (objective) + the assertion/action
// calls in its body (mapped to plain English). Run: cd e2e && npx tsx queue/mobile/build-queue-logic.ts
import * as fs from 'fs';
import * as path from 'path';

const E2E = path.resolve(__dirname, '../..');
const QUEUE = path.join(E2E, 'queue');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// call → [short label, why it's trustworthy]
const VOCAB: Record<string, [string, string]> = {
  assertNoOrphan: ['No-orphan', 'every logged move points at a real prior stage (reads the app-written `queue stage log`)'],
  assertNoStageSkipped: ['No-stage-skipped', 'each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)'],
  assertEveryMoveLogged: ['Every-move-logged {minNonSelf}', 'every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core'],
  assertLoopBound: ['Loop-bound', 'no stage re-entered beyond the bound — catches runaway loops'],
  assertTerminalReached: ['Terminal-reached', 'the token rests on the terminal stage, which exposes zero scoped out-edges'],
  assertCountConserved: ['Count-conserved', 'a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)'],
  assertTrailInvariants: ['Trail invariants (bundle)', 'no-orphan + no-skip + every-move-logged + loop-bound over the full trail'],
  assertUniversalAfterHop: ['Universal-after-hop (bundle)', 'after each hop, the trail invariants hold for the moves so far'],
  assertUniversalAfterHopJ: ['Universal-after-hop (journey)', 'per-hop trail invariants, journey-indexed'],
  assertAllInvariantsAfterHop: ['All-invariants-after-hop', 'trail invariants + count-conservation after the hop'],
  assertZeroTransitionInvariants: ['Zero-transition', 'a parked/terminal token logged no spurious transitions'],
  assertNoFatal: ['No-fatal', 'no fatal console error / app crash during the flow (console guard)'],
  assertMoveTargets: ['Move-targets offered/absent', 'the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing'],
  assertNoEnabledMoveTargets: ['No-enabled-targets', 'a terminal/parking token exposes zero pickable destinations'],
  assertStageMovedTouchpoint: ['Stage-moved touchpoint', 'the move wrote its expected touchpoint/side-effect'],
  assertZoomLinkBrokenIfPresent: ['Zoom-link', 'a studio zoom link, if present, is well-formed'],
  assertCardNameNotBlank: ['Card-name', 'the board card shows the participant name (not blank)'],
  'sim.advance': ['Participant self-move (sim)', 'the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)'],
  'board.moveToken': ['Operator move (real board)', 'drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write'],
  'board.moveTokenToActivity': ['Studio/activity move', 'opens a studio via the real AssignQueueStudio dialog (app writes the live assignment)'],
  'board.completeFinal': ['Final completion', 'operator moves the token into the terminal stage'],
  'board.bulkComplete': ['Bulk complete', 'developer "complete column" action over the real board'],
  'board.bulkInvite': ['Bulk invite', 'comms-panel BulkInvite over the selected participants'],
  'board.exportCsv': ['Export CSV', 'the app’s exported CSV is asserted against live board state'],
  'board.applyFilterTag': ['Filter by tag', 'the board re-filters live; assert the recomputed counts'],
  observedTransitions: ['Reads the trail', 'reads the app-written transition log — the value every guard asserts on (never a test-set value)'],
  'board.readAllColumnCounts': ['Reads all board counts', 'snapshots every column’s app-computed count (the before/after for count-conservation)'],
  'board.readColumnCount': ['Reads a board count', 'an app-computed, stream-rendered column count the test asserts against (never a test-written value)'],
  'board.readTotalParticipants': ['Reads Total Participants', 'the board’s app-computed total'],
  'board.readStageChip': ['Reads Stage-Counts chip', 'the board’s app-computed Stage-Counts badge'],
  'board.revealTokenCard': ['Reveals card', 'pages the participant’s card into the board (read-only, no state change)'],
  'board.selectQueue': ['Selects the queue', 'loads the live queue_token stream onto the board (the suite’s setup)'],
  'sim.currentStage': ['Reads token stage', 'reads the token’s current stage — an app value, not a test input'],
  'sim.tokensForVariation': ['Lists seeded tokens', 'reads the seeded participants for the variation'],
  requireConsoleClean: ['Console-clean', 'no console errors surfaced during the flow'],
  // shared scenario/walk helpers (the asserts live inside these, not inline in the test body)
  driveOperatorHop: ['Operator move (real board)', 'drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move'],
  writeRow: ['Participant self-move (sim)', 'the participant stand-in writes the self-move log row — desktop analogue of a real form submit'],
  openAsActor: ['Smoke render', 'opens the screen as the given actor and FAILS on any fatal console error (render-health check)'],
  installDeliveryStatusSpy: ['CF side-effect spy', 'spies the delivery-status Cloud Function so its real calls can be asserted'],
  waitForDeliveryStatusCalls: ['CF side-effect assert', 'asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)'],
  linkTokenIntoLiveSession: ['Studio link (setup)', 'links the token into a live studio session'],
  ensurePairingCheckedIn: ['Studio pairing (setup)', 'ensures the specialist↔participant pairing is checked in'],
  readLogRows: ['Reads the log', 'reads the app-written `queue stage log` rows'],
  readCountsByStageName: ['Reads stage counts', 'reads the board’s app-computed counts by stage name'],
  pollColumnCounts: ['Polls board counts', 'waits for the board’s recomputed column counts to settle'],
};

function listQueueSpecs(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'mobile' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.spec.ts')) out.push(f);
    }
  };
  walk(QUEUE);
  return out.sort();
}

function leadingComment(src: string, at: number): string {
  const before = src.slice(0, at).split('\n');
  const lines: string[] = [];
  for (let i = before.length - 1; i >= 0; i--) {
    const ln = before[i].trim();
    if (ln === '') { if (lines.length) break; else continue; }
    if (ln.startsWith('//')) lines.unshift(ln.replace(/^\/\/+\s?/, ''));
    else if (ln.startsWith('*') || ln.endsWith('*/') || ln.startsWith('/*')) lines.unshift(ln.replace(/^\/?\*+\/?\s?|\s?\*+\/$/g, ''));
    else break;
  }
  return lines
    .filter((l) => !/^[-=*_\s]{3,}$/.test(l)) // drop separator-only comment lines
    .join(' ')
    .replace(/[-=]{3,}/g, ' ')                 // strip "----- text -----" rules
    .replace(/\s+/g, ' ')
    .trim();
}

interface TestCard { title: string; objective: string; line: number; calls: string[]; }
function parseSpec(file: string): { describe: string; tests: TestCard[] } {
  const src = fs.readFileSync(file, 'utf8');
  const dm = src.match(/test\.describe\s*\(\s*([`'"])((?:\\.|(?!\1)[\s\S])*?)\1/);
  const describe = dm ? dm[2].replace(/\\(['"`\\])/g, '$1').replace(/\s+/g, ' ').trim() : '';
  const re = /\btest(?:\.(?:skip|only|fixme))?\s*\(\s*([`'"])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const ms = [...src.matchAll(re)];
  const tests: TestCard[] = [];
  ms.forEach((m, k) => {
    const title = m[2].replace(/\\(['"`\\])/g, '$1').replace(/\s+/g, ' ').trim();
    if (!title) return;
    const start = m.index!;
    const end = k + 1 < ms.length ? ms[k + 1].index! : src.length;
    const body = src.slice(start, end);
    const NOISE = new Set(['board.page', 'board.component', 'board.open', 'board.locator', 'board.tokenCard', 'board.stageKeysForName', 'board.resolveStageKeyPublic', 'sim.db', 'sim.js', 'sim.logCount']);
    const regexCalls = [...new Set([...body.matchAll(/\b(assert[A-Z]\w*|board\.[a-zA-Z]\w*|sim\.[a-zA-Z]\w*|requireConsole\w*|observedTransitions)\b/g)].map((mm) => mm[1]))];
    const vocabPresent = Object.keys(VOCAB).filter((k) => body.includes(k)); // catches bare-helper keys too
    const calls = [...new Set([...vocabPresent, ...regexCalls])].filter((c) => !NOISE.has(c));
    tests.push({ title, objective: leadingComment(src, start), line: src.slice(0, start).split('\n').length, calls });
  });
  return { describe, tests };
}

const PREAMBLE_LINES = [
  ['The model (oracle)', 'a flow-model defines, per variation, which stages exist and which transitions are legal. Tests are checked against it — a move that isn’t a legal edge fails.'],
  ['Participant self-moves', 'DESKTOP queue tests perform participant moves via the Admin-SDK participant-sim (`sim.advance`) — the stand-in for a real form submit; the MOBILE suite performs them through the real app. Both write the same `queue_token` + `queue stage log`.'],
  ['Operator / auto moves', 'driven on the REAL Angular board (`board.moveToken` etc.) — the app performs the write; the test only clicks.'],
  ['The guards', 'no-orphan · no-stage-skipped · every-move-logged{minNonSelf} · loop-bound · terminal-reached · count-conserved · no-fatal. Bundles (`assertTrailInvariants` / `assertUniversalAfterHop`) run several at once after each hop.'],
  ['Anti-circularity', 'every assertion reads a value the APP produced (the token, the log rows, the board’s recomputed counts) — never a value the test wrote. `minNonSelf` proves the operator moves on the trail genuinely happened.'],
];

(async () => {
  const specs = listQueueSpecs();
  const htmlSecs: string[] = [];
  const mdSecs: string[] = [];
  const csvRows = ['Suite (describe),Spec,Test case,Objective,Assertions,Reviewed,Reviewer,Notes'];
  let total = 0;

  for (const file of specs) {
    const rel = path.relative(E2E, file);
    const { describe, tests } = parseSpec(file);
    if (!tests.length) continue;
    const cards: string[] = [];
    const mdCards: string[] = [];
    for (const t of tests) {
      total++;
      const mapped = t.calls.filter((c) => VOCAB[c]).map((c) => VOCAB[c]);
      const raw = t.calls.filter((c) => !VOCAB[c]);
      const hasAny = mapped.length || raw.length;
      const assertHtml = hasAny
        ? `<ul class="asserts">${mapped.map(([l, w]) => `<li><b>${esc(l)}</b> — ${esc(w)}</li>`).join('')}${raw.length ? `<li class="raw">also calls: ${raw.map((c) => `<code>${esc(c)}</code>`).join(', ')}</li>` : ''}</ul>`
        : '<p class="none">(render / smoke check — no transition assertions; read the spec)</p>';
      cards.push(`<div class="card">
        <div class="t">${esc(t.title)}</div>
        ${t.objective ? `<div class="obj">${esc(t.objective)}</div>` : ''}
        ${assertHtml}
        <div class="ref"><code>${esc(rel)}:${t.line}</code></div>
      </div>`);
      const mdBody = hasAny
        ? [...mapped.map(([l, w]) => `- **${l}** — ${w}`), ...(raw.length ? [`- also calls: ${raw.map((c) => `\`${c}\``).join(', ')}`] : [])].join('\n')
        : '_(render / smoke check — no transition assertions; read the spec)_';
      mdCards.push(`#### ${t.title}\n${t.objective ? `*Objective:* ${t.objective}\n` : ''}${mdBody}\n\n\`${rel}:${t.line}\`\n`);
      const labels = [...mapped.map(([l]) => l), ...raw].join('; ');
      const cell = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      csvRows.push([describe, rel, t.title, t.objective, labels, '', '', ''].map(cell).join(','));
    }
    htmlSecs.push(`<section><h2>${esc(describe || rel)} <span class="meta">${tests.length} test(s) · <code>${esc(rel)}</code></span></h2>${cards.join('')}</section>`);
    mdSecs.push(`## ${describe || rel}\n_${rel} · ${tests.length} test(s)_\n\n${mdCards.join('\n')}`);
  }

  const preH = PREAMBLE_LINES.map(([k, v]) => `<li><b>${esc(k)}</b> — ${esc(v)}</li>`).join('');
  const html = `<!doctype html><meta charset=utf8><title>Queue suite — test logic</title>
<style>:root{color-scheme:dark}body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;margin:0;padding:28px;line-height:1.55;max-width:1100px}
h1{margin:0 0 6px}h2{border-bottom:1px solid #30363d;padding-bottom:6px;margin-top:30px;font-size:17px}
code{background:#161b22;border:1px solid #30363d;border-radius:5px;padding:1px 5px;font-size:12px}
.sub{color:#8b949e}.meta{color:#8b949e;font-weight:400;font-size:13px}
.pre{background:#11161d;border:1px solid #30363d;border-radius:10px;padding:12px 18px;margin:14px 0}.pre li{margin:5px 0}
.card{border:1px solid #30363d;border-radius:9px;padding:11px 15px;margin:10px 0;background:#11161d}
.card .t{font-weight:600;font-size:14px}.card .obj{color:#adbac7;margin:5px 0 8px;font-size:13.5px}
.asserts{margin:6px 0 8px;padding-left:18px}.asserts li{margin:3px 0;font-size:13px}.asserts b{color:#7ee787}
.none{color:#8b949e;font-style:italic;font-size:13px}.ref{font-size:11.5px;color:#6e7681}</style>
<h1>Queue suite — test logic (for review)</h1>
<p class="sub">One card per test: <b>objective</b> + the <b>assertions and why they hold</b>. Read the preamble once (the engine), then review each card; the anti-circular rationale is the key thing to scrutinize.</p>
<div class="pre"><b>How the queue tests work</b><ul>${preH}</ul></div>
<p class="sub">${total} tests across ${htmlSecs.length} specs. Code refs link each card to <code>spec:line</code>.</p>
${htmlSecs.join('\n')}`;

  const md = `# Queue suite — test logic (for review)\n\nOne card per test: objective + assertions and why they hold.\n\n## How the queue tests work\n${PREAMBLE_LINES.map(([k, v]) => `- **${k}** — ${v}`).join('\n')}\n\n_${total} tests across ${mdSecs.length} specs._\n\n${mdSecs.join('\n\n')}`;

  fs.writeFileSync(path.join(E2E, 'queue-test-logic.html'), html);
  fs.writeFileSync(path.join(E2E, 'queue-test-logic.md'), md);
  fs.writeFileSync(path.join(E2E, 'queue-test-logic.csv'), csvRows.join('\n'));
  console.log(`✓ queue-test-logic.{html,md,csv} — ${total} tests across ${htmlSecs.length} specs`);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
