// Journey Coach Health -> Ev. Preparation tab: two kanban boards whose cards move by drag or Next/back,
// each move needs a note (operator 2026-11-11). DESIGN PREVIEW: sample cards, no Firestore wiring. Revert the change and these assertions go RED.
// Board rules are executed for real (config transpiled with the repo's TypeScript), the rest is read from source.
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

const B = 'src/app/Journey Onboarding/jc-evprep-board/';
const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const cfgSrc = read(B + 'evprep-board.config.ts');
const cts = read(B + 'jc-evprep-board.component.ts');
const chtml = read(B + 'jc-evprep-board.component.html');
const ccss = read(B + 'jc-evprep-board.component.css');
const hhtml = read(H + 'html');
const hts = read(H + 'ts');

let cfg = {};
if (cfgSrc) {
  const js = ts.transpileModule(cfgSrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  cfg = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const labels = (k) => cfg.EVPREP_BOARDS.find(b => b.key === k).stages.map(s => s.label + (s.sub ? ` (${s.sub})` : '')).join(' | ');

check('EB1', 'New Participants board: Onboarded (Yet to start) | AEL | uP! Aspiration | ATC understanding | Ready for SE',
  () => labels('new') === 'Onboarded (Yet to start) | AEL | uP! Aspiration | ATC understanding | Ready for SE');
check('EB2', 'Attended 1 uP! and above board: JC Done (Yet to start) | AEL | uP! life report | Ready for SE',
  () => labels('returning') === 'JC Done (Yet to start) | AEL | uP! life report | Ready for SE'
     && cfg.EVPREP_BOARDS.find(b => b.key === 'returning').title === 'Attended 1 uP! and above');
check('EB3', 'a move is only valid between two different stages of the SAME board',
  () => cfg.canMove('new', 'onboarded', 'readyforse') && cfg.canMove('returning', 'readyforse', 'jcdone')
     && !cfg.canMove('new', 'ael', 'ael') && !cfg.canMove('returning', 'ael', 'upaspiration')
     && !cfg.canMove('new', 'ael', 'uplifereport') && !cfg.canMove('nope', 'ael', 'readyforse'));
check('EB4', 'Next/back stop at the ends of a board',
  () => cfg.neighbourStage('new', 'onboarded', -1) === null && cfg.neighbourStage('new', 'readyforse', 1) === null
     && cfg.neighbourStage('new', 'ael', 1).key === 'upaspiration' && cfg.neighbourStage('returning', 'ael', -1).key === 'jcdone');
check('EB5', 'columns are disjoint: every card sits in exactly one column of its own board; other-board cards excluded',
  () => {
    const docs = [{ board: 'new', stage: 'ael' }, { board: 'new', stage: 'readyforse' }, { board: 'returning', stage: 'ael' },
      { board: 'returning', stage: 'uplifereport' }, { board: 'new', stage: 'bogus' }];
    const g = cfg.groupByStage('new', docs);
    const placed = Object.values(g).flat();
    return placed.length === 2 && new Set(placed).size === 2 && g.ael.length === 1 && g.readyforse.length === 1
      && Object.keys(g).join() === 'onboarded,ael,upaspiration,atcunderstanding,readyforse';
  });
check('EB6', 'tile == list: each column count is the length of the same array its cards render from',
  () => /data-testid="evp-col-count">\{\{ cols\[b\.key\]\[s\.key\]\.length \}\}/.test(chtml)
     && /\*ngFor="let c of cols\[b\.key\]\[s\.key\]"/.test(chtml));
check('EB7', 'Ev. Prep panel renders the board (placeholder gone), gated by experienceTab',
  () => /\*ngIf="experienceTab === 'evprep'" data-testid="jx-panel-evprep">\s*<app-jc-evprep-board data-testid="jx-evprep-board">/.test(hhtml)
     && !/Evolution preparation — to be defined/.test(hhtml)
     && /JourneycoachDashboardComponent, JcEvprepBoardComponent,/.test(hts));
check('EB8', 'cards drag between columns of one board only (cdk drop lists connected per board, group per board)',
  () => /cdkDropListGroup/.test(chtml) && /cdkDrag \[cdkDragData\]="c"/.test(chtml)
     && /\[cdkDropListConnectedTo\]="connectedTo\(b\)"/.test(chtml) && /\(cdkDropListDropped\)="onDrop\(b, s, \$event\)"/.test(chtml)
     && /connectedTo\(b: EvPrepBoard\): string\[\] \{ return b\.stages\.map/.test(cts));
check('EB9', 'a drop or a Next/back click opens the move box; nothing moves until it is saved',
  () => /onDrop\([^)]*\): void \{\s*const card = ev\.item\.data as EvPrepCard;\s*if \(!card \|\| ev\.previousContainer === ev\.container\) return;\s*this\.askMove\(b, card, to\);\s*\}/.test(cts)
     && /data-testid="evp-card-next"/.test(chtml) && /\(click\)="askMove\(b, c, n\)"/.test(chtml)
     && /data-testid="evp-card-back"/.test(chtml) && /\(click\)="askMove\(b, c, p\)"/.test(chtml));
check('EB10', 'a note is required; saving moves the card on the page (sample data, nothing written)',
  () => /if \(!p \|\| !text\) return;/.test(cts) && /p\.card\.stage = p\.to\.key;/.test(cts) && /this\.regroup\(\);/.test(cts)
     && cfg.EVPREP_SAMPLE.length === 15 && cfg.EVPREP_SAMPLE.every(c => !!cfg.stageOf(cfg.boardFor(c.board), c.stage)));
check('EB11', 'move box is the in-page native overlay, not a MatDialog; no filter/transform on the overlay chain',
  () => !/@angular\/material\/dialog|MatDialog\b(?!\.)/.test(cts.replace(/\/\*[\s\S]*?\*\//g, '')) && /class="evp-ovl" \*ngIf="pending as p"[^>]*data-testid="evp-move"/.test(chtml)
     && /\.evp-ovl \{ position: fixed;/.test(ccss) && !/backdrop-filter|filter:|perspective/.test(ccss)
     && !/\.evp-(root|board|cols|col|ovl) \{[^}]*transform/.test(ccss));
check('EB12', 'design preview: no Firestore import, no reads or writes; preview banner shown',
  () => !/@angular\/fire/.test(cts) && !/getDocs|updateDoc|setDoc|collection\(/.test(cts)
     && /data-testid="evp-preview">Design preview/.test(chtml));
check('EB13', 'hooks are literal data-testid strings (no interpolation)',
  () => !/data-testid="[^"]*(\$\{|\{\{)/.test(chtml) && !/\[attr\.data-testid\]/.test(chtml)
     && ['evp-board', 'evp-col', 'evp-col-count', 'evp-card', 'evp-card-next', 'evp-card-back', 'evp-move', 'evp-move-note', 'evp-move-save', 'evp-move-cancel']
       .every(t => chtml.includes(`data-testid="${t}"`)));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
