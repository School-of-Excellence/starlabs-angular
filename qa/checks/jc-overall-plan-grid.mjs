// Journey Coach Health -> Overall Summary · "Planned journey · next 6 months" grid (replaces the Ready for SE placeholder).
// Source: participantplanning (one doc per participant per month), read for the viewed coach's roster only.
// The row builder is executed for real (method transpiled with the repo's TypeScript); the rest is read from source.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const src = readFileSync(H + 'ts', 'utf8');
const html = readFileSync(H + 'html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const method = (name) => { const i = src.search(new RegExp(`\\n  (private |async |private async )?${name}\\(`)); return i < 0 ? '' : src.slice(i + 1, src.indexOf('\n  }\n', i) + 4); };
const card = (() => { const i = html.indexOf('data-testid="ov-plan"'); return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i)); })();

// Execute buildOvPlanRows against fixtures.
let Builder = null;
const bsrc = method('buildOvPlanRows');
if (bsrc) {
  const js = ts.transpileModule(`export class B { productNameCache: any = { p1: 'DFU Pro', p2: 'Eco Plus', p3: 'DFU Pro' }; ${bsrc.replace(/^  private /, '  ')} }`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  Builder = (await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).B;
}
const yms = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'];
const fx = [
  { profileid: 'a', ym: '2026-11', solarvoice: true, eiflix: false, generalcontent: true, workshop: false, productIds: ['p1'] },
  { profileid: 'b', ym: '2026-11', solarvoice: true, eiflix: true, generalcontent: false, workshop: false, productIds: ['p3'] },
  { profileid: 'a', ym: '2027-01', solarvoice: false, eiflix: false, generalcontent: false, workshop: true, productIds: ['p2', 'p1'] },
  { profileid: 'c', ym: '2026-10', solarvoice: true, eiflix: true, generalcontent: true, workshop: true, productIds: ['p2'] },   // outside window
];
const rows = Builder ? new Builder().buildOvPlanRows(fx, yms) : [];
const row = (label) => rows.find(r => r.label === label);
const n = (label) => (row(label)?.cells ?? []).map(c => c.length).join(',');

check('PG1', 'rows = Solar Voice, EiFlix, General content, Workshops, then products by name',
  () => rows.map(r => r.label).join('|') === 'Solar Voice|EiFlix|General content|Workshops|DFU Pro|Eco Plus');
check('PG2', 'cell = distinct participants per month; 6 columns; out-of-window docs ignored',
  () => rows.every(r => r.cells.length === 6) && n('Solar Voice') === '2,0,0,0,0,0' && n('EiFlix') === '1,0,0,0,0,0'
     && n('Workshops') === '0,0,1,0,0,0' && n('General content') === '1,0,0,0,0,0');
check('PG3', 'products group by NAME (two ids named the same = one row, distinct people)',
  () => n('DFU Pro') === '2,0,1,0,0,0' && n('Eco Plus') === '0,0,1,0,0,0');
check('PG4', 'months: next 6, current month first',
  () => /for \(let i = 0; i < 6; i\+\+\)/.test(method('buildOvPlanMonths')) && /new Date\(now\.getFullYear\(\), now\.getMonth\(\) \+ i, 1\)/.test(method('buildOvPlanMonths')));
check('PG5', 'read scoped to the viewed coach roster: participantplanning where profileid in chunk30 (no whole-collection read)',
  () => { const e = method('ensureOvPlan');
          return /const ids = this\.rosterIds\(\);/.test(e) && /this\.chunk30\(ids\)\.map\(c =>\s*getDocs\(query\(collection\(this\.firestore, 'participantplanning'\), where\('profileid', 'in', c\)\)\)\)/.test(e)
            && !/getDocs\(collection\(this\.firestore, 'participantplanning'\)\)/.test(src); });
check('PG6', 'month filtered client-side from monthstartdate (doc-id fallback), no orderBy / composite index',
  () => { const e = method('ensureOvPlan'); return /this\.toDate\(x\['monthstartdate'\]\)/.test(e) && /inWindow\.has\(ym\)/.test(e) && !/orderBy\(|where\('monthstartdate'/.test(e); });
check('PG7', 'product names resolved from referenced products docs by id, cached',
  () => { const e = method('ensureOvPlan'); return /where\(documentId\(\), 'in', c\)/.test(e) && /collection\(this\.firestore, 'products'\)/.test(e) && /!\(id in this\.productNameCache\)/.test(e); });
check('PG8', 'only for a specific coach: ALL / UNASSIGNED show "Pick a coach to see plans"',
  () => /this\.selectedCoachId !== this\.ALL && this\.selectedCoachId !== this\.UNASSIGNED/.test(method('ovPlanCoachScoped'))
     && /\*ngIf="!ovPlanCoachScoped\(\)" data-testid="ov-plan-pick">Pick a coach to see plans\./.test(card)
     && /if \(!this\.ovPlanCoachScoped\(\) \|\| this\.experienceTab !== 'overall'\) return;/.test(method('ensureOvPlan')));
check('PG9', 'Viewing as change reloads the grid (onCoachChange + tab open + first load)',
  () => /void this\.ensureOvPlan\(\);/.test(method('onCoachChange')) && /if \(t === 'overall'\) void this\.ensureOvPlan\(\);/.test(method('setExperienceTab'))
     && /cur\.coachId === coachId/.test(method('ensureOvPlan')));
check('PG10', 'tile == list: a cell shows c.length and drills exactly row.cells[i] via the native overlay',
  () => /data-testid="ov-plan-cell" \[disabled\]="!c\.length" \(click\)="ovPlanDrill\(r, i\)">\{\{ c\.length \}\}/.test(card)
     && /this\.openOvDrill\(`\$\{row\.label\} · \$\{m\.label\}`, \(row\.cells\[i\] \?\? \[\]\)\.map\(/.test(method('ovPlanDrill'))
     && !/this\.dialog\.open\(/.test(method('ovPlanDrill') + method('ensureOvPlan')));
check('PG11', 'card titled "Planned journey · next 6 months", grid + row hooks literal; placeholder gone',
  () => /<span class="ios2-title">Planned journey · next 6 months<\/span>/.test(card) && /data-testid="ov-plan-grid"/.test(card)
     && /data-testid="ov-plan-row"/.test(card) && !/data-testid="ov-se/.test(html) && !/Ready for SE<\/span>/.test(html));
check('PG12', 'stale coach responses dropped (token guard)',
  () => /if \(token !== this\.ovPlanToken\) return;/.test(method('ensureOvPlan')));

check('PG13', 'month columns keep identity between checks (memoized per month)',
  () => /return this\.memo\('ovPlanMonths', \[now\.getFullYear\(\), now\.getMonth\(\)\], \(\) => this\.buildOvPlanMonths\(now\)\);/.test(method('ovPlanMonths')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
