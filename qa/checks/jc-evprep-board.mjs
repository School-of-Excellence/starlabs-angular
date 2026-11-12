// Journey Coach Health -> Ev. Preparation tab: two kanban boards whose cards move by drag or Next/back,
// each move needs a note (operator 2026-11-11). New Participants is LIVE on `evolution prep` (journey-pipeline schema);
// Returning stays a design preview on sample cards. Revert the change and these assertions go RED.
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
check('EB7', 'Ev. Prep panel renders the board (placeholder gone), mounted on first visit then kept (ux-review F9)',
  () => /\*ngIf="evprepMounted" \[class\.jx-offstage\]="experienceTab !== 'evprep'" data-testid="jx-panel-evprep">\s*<app-jc-evprep-board data-testid="jx-evprep-board">/.test(hhtml)
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
check('EB10', 'a note is required; Returning moves stay on the page (sample data), New moves are written',
  () => /if \(!p \|\| !text \|\| this\.saving\) return;/.test(cts)
     && /if \(!this\.isLive\(p\.board\)\) \{[\s\S]*?p\.card\.stage = p\.to\.key;[\s\S]*?this\.regroup\(\);[\s\S]*?return;/.test(cts)
     && cfg.EVPREP_SAMPLE.length === 15 && cfg.EVPREP_SAMPLE.every(c => !!cfg.stageOf(cfg.boardFor(c.board), c.stage))
     && /sampleCards: EvPrepCard\[\] = EVPREP_SAMPLE\.filter\(s => s\.board === 'returning'\)/.test(cts));
check('EB11', 'move box is the in-page native overlay, not a MatDialog; no filter/transform on the overlay chain',
  () => !/@angular\/material\/dialog|MatDialog\b(?!\.)/.test(cts.replace(/\/\*[\s\S]*?\*\//g, '')) && /class="evp-ovl" \*ngIf="pending as p"[^>]*data-testid="evp-move"/.test(chtml)
     && /\.evp-ovl \{ position: fixed;/.test(ccss) && !/backdrop-filter|filter:|perspective/.test(ccss)
     && !/\.evp-(root|board|cols|col|ovl) \{[^}]*transform/.test(ccss));
check('EB12', 'preview banner only on the Returning board; New board shows loading / error states',
  () => /<div class="evp-preview" \*ngIf="!isLive\(b\)" data-testid="evp-preview">Design preview/.test(chtml)
     && /data-testid="evp-loading"/.test(chtml) && /data-testid="evp-error"/.test(chtml) && /isLive\(b: EvPrepBoard\): boolean \{ return b\.key === 'new'; \}/.test(cts));
check('EB13', 'hooks are literal data-testid strings (no interpolation)',
  () => !/data-testid="[^"]*(\$\{|\{\{)/.test(chtml) && !/\[attr\.data-testid\]/.test(chtml)
     && ['evp-board', 'evp-col', 'evp-col-count', 'evp-card', 'evp-card-next', 'evp-card-back', 'evp-move', 'evp-move-note', 'evp-move-save', 'evp-move-cancel', 'evp-move-variation', 'evp-move-error', 'evp-loading', 'evp-error']
       .every(t => chtml.includes(`data-testid="${t}"`)));

// ─── Live New Participants board (journey-pipeline data, operator 2026-11-11) ───
const V = typeof cfg.normaliseVariation !== 'function' ? [] : [cfg.normaliseVariation('v1', { variationname: 'Standard', stage: [{ stagename: 'AEL' }, { stagename: 'uP! Aspiration' }, { stagename: 'ATC understanding' }] }),
           cfg.normaliseVariation('v2', { variationname: 'Short', stages: { a: { stagename: 'AEL' }, b: { stagename: 'Life report' } } })];
check('EL1', 'live columns = Onboarded (Yet to start) | every variation stage once, first-seen order | Ready for SE',
  () => cfg.liveStages(V).map(s => s.label).join(' | ') === 'Onboarded | AEL | uP! Aspiration | ATC understanding | Life report | Ready for SE'
     && cfg.liveStages(V)[0].key === cfg.LIVE_START && cfg.liveStages(V).at(-1).key === cfg.LIVE_DONE
     && new Set(cfg.liveStages(V).map(s => s.key)).size === 6);
check('EL2', 'variation stages accepted as array or map, under stage or stages (journey-pipeline rule)',
  () => V[0].stages.join() === 'AEL,uP! Aspiration,ATC understanding' && V[1].stages.join() === 'AEL,Life report' && V[1].variationid === 'v2');
check('EL3', 'prep column: completed -> Ready for SE, active -> its stage, cancelled -> not shown',
  () => cfg.prepColumn({ status: 'completed', currentstage: 'AEL' }) === 'readyforse'
     && cfg.prepColumn({ status: 'ongoing', currentstage: 'uP! Aspiration' }) === cfg.stageKey('uP! Aspiration')
     && cfg.prepColumn({ status: 'initiated', currentstage: 'AEL' }) === cfg.stageKey('AEL')
     && cfg.prepColumn({ status: 'cancelled', currentstage: 'AEL' }) === null);
check('EL4', 'Yet to start = onboarded new participants since the start date with no live prep started after onboarding (columns disjoint)',
  () => {
    const t = (iso) => ({ toMillis: () => Date.parse(iso) });
    const pj = [
      { profileid: 'a', onboarded: true, journeytype: 'new', onboardedtime: t('2026-10-05') },   // no prep -> yet
      { profileid: 'b', onboarded: true, journeytype: 'new', onboardedtime: t('2026-10-05') },   // prep after -> not yet
      { profileid: 'c', onboarded: true, journeytype: 'new', onboardedtime: t('2026-10-05') },   // only a cancelled prep -> yet
      { profileid: 'd', onboarded: true, journeytype: 'new', onboardedtime: t('2025-01-01') },   // before start date
      { profileid: 'e', onboarded: false, journeytype: 'new', onboardedtime: t('2026-10-05') },  // not onboarded
      { profileid: 'f', onboarded: true, journeytype: 'upgrade', onboardedtime: t('2026-10-05') }, // not new
      { profileid: 'a', onboarded: true, journeytype: 'new', onboardedtime: t('2026-10-06') },   // duplicate profile
    ];
    const preps = [{ profileid: 'b', status: 'ongoing', createdon: t('2026-10-10') }, { profileid: 'c', status: 'cancelled', createdon: t('2026-10-10') }];
    return cfg.yetToStart(pj, preps).map(r => r.profileid).join() === 'a,c';
  });
check('EL5', 'move plan follows the card\'s variation: stage sets completedstages, last -> completed, no jump back to Yet to start, unknown stage blocked',
  () => {
    const m1 = cfg.planPrepMove(V[0], cfg.stageKey('ATC understanding')).update;
    const m2 = cfg.planPrepMove(V[0], cfg.LIVE_DONE).update;
    const m3 = cfg.planPrepMove(V[0], cfg.stageKey('AEL')).update;
    return m1.currentstage === 'ATC understanding' && m1.completedstages.join() === 'AEL,uP! Aspiration' && m1.status === 'ongoing'
      && m2.status === 'completed' && m2.completedstages.length === 3 && m3.status === 'initiated' && m3.completedstages.length === 0
      && !!cfg.planPrepMove(V[0], cfg.LIVE_START).block && !!cfg.planPrepMove(V[1], cfg.stageKey('uP! Aspiration')).block
      && !!cfg.planPrepMove(undefined, cfg.LIVE_DONE).block;
  });
check('EL6', 'Next / back walk the card\'s own variation; Ready for SE goes back to the last stage; first stage has no back',
  () => cfg.prepNeighbour(V[1], { status: 'initiated', currentstage: 'AEL' }, 1) === cfg.stageKey('Life report')
     && cfg.prepNeighbour(V[1], { status: 'ongoing', currentstage: 'Life report' }, 1) === cfg.LIVE_DONE
     && cfg.prepNeighbour(V[1], { status: 'completed', currentstage: 'Life report' }, -1) === cfg.stageKey('Life report')
     && cfg.prepNeighbour(V[1], { status: 'completed' }, 1) === null
     && cfg.prepNeighbour(V[0], { status: 'initiated', currentstage: 'AEL' }, -1) === null);
check('EL7', 'sale exclusions match journey-pipeline (rejected, excluded journey, internal leads on the other journey)',
  () => cfg.isRemovedSale({ status: 'Rejected' }) && cfg.isRemovedSale({ journey: 'InLXMl7OBAqlDTZcXwK0' })
     && cfg.isRemovedSale({ journey: 'RXvsMYoK0g4SstvDDURZ', email: 'x@soexcellence.com' })
     && !cfg.isRemovedSale({ journey: 'RXvsMYoK0g4SstvDDURZ', email: 'x@gmail.com' }) && !cfg.isRemovedSale({ status: 'active' }));
check('EL8', 'no whole-collection PII reads: participant metadata and salesleads only by batched in-queries; pjp bounded by date',
  () => cfg.chunk([...Array(61).keys()]).map(c => c.length).join() === '30,30,1'
     && /collection\(this\.firestore, 'participant metadata'\), where\('profileid', 'in', ids\)/.test(cts)
     && /collection\(this\.firestore, 'salesleads'\), where\(documentId\(\), 'in', ids\)/.test(cts)
     && /where\('onboardedtime', '>=', Timestamp\.fromDate\(EVPREP_LIVE_FROM\)\)/.test(cts)
     && !/getParticipantMetaMap/.test(cts) && !/console\.log/.test(cts));
check('EL9', 'writes use the journey-pipeline schema + the note (arrayUnion), stamped with the coach profile',
  () => /setDoc\(ref, \{\s*docid: ref\.id,\s*profileid: card\.profileid,\s*variationid,\s*currentstage: v\.stages\[0\],\s*completedstages: \[\],\s*status: 'initiated',\s*createdon: now,\s*createdby: by,/.test(cts)
     && /updateDoc\(doc\(this\.firestore, 'evolution prep', card\.prep\.docid\), \{[\s\S]*?notes: arrayUnion\(note\),/.test(cts)
     && /if \(!by\) \{ this\.moveError = /.test(cts));
check('EL10', 'starting a prep needs a variation; one running prep per participant + variation',
  () => /if \(p\.start && !this\.moveVariationId\) return;/.test(cts) && /data-testid="evp-move-variation"/.test(chtml)
     && /x\.variationid === variationid && ACTIVE_STATUSES\.includes\(x\.status\)/.test(cts));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
