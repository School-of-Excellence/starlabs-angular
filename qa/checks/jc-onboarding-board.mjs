// Journey Coach Health -> Onboarding tab: pipeline card board (drag cards forward), operator 2026-11-11.
// Moves open the EXISTING Schedule / Mark Onboarded flows; forward only; Not Assured is blocked.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.';
const ts = readFileSync(J + 'ts', 'utf8');
const html = readFileSync(J + 'html', 'utf8');
const css = readFileSync(J + 'css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// Run the real move rules (pipelineMove body) against a stubbed checkMarkOnboarding.
let move = null;
try {
  const i = ts.indexOf('  pipelineMove(');
  const body = ts.slice(ts.indexOf('\n', i) + 1, ts.indexOf('\n  }\n', i));
  move = (from, to, row, callPending) =>
    new Function('from', 'to', 'row', body).call({ checkMarkOnboarding: () => callPending }, from, to, row);
} catch { move = null; }

const COLS = [['notassured', 'pipe-col-na', 'pipeNotAssured'], ['ready', 'pipe-col-ready', 'pipeReady'],
              ['scheduled', 'pipe-col-sched', 'pipeScheduled'], ['onboarded', 'pipe-col-ob', 'pipeOnboarded']];

check('KB1', 'board sits inside the embed-only pipeline card; stage counts are its column headers (no tile row above it)',
  () => { const p = html.indexOf('data-testid="jcd-pipe"'); const b = html.indexOf('data-testid="jcd-pipe-board"'); const t = html.indexOf('data-testid="jcd-pipe-notassured"');
          return p > 0 && b > p && t > b && /class="jcd-kboard" cdkDropListGroup data-testid="jcd-pipe-board"/.test(html); });
check('KB2', 'four columns, each a drop list bound to the same set its count tile shows (column == tile)',
  () => COLS.every(([t, id, k]) => new RegExp(`cdkDropList id="${id}" \\[cdkDropListData\\]="originalData\\['${k}'\\]\\.data" \\(cdkDropListDropped\\)="onPipelineDrop\\(\\$event\\)" data-testid="jcd-pipe-col-${t}"`).test(html)
        && html.includes(`*ngFor="let row of originalData['${k}'].data; trackBy: pipeTrack" cdkDrag [cdkDragData]="row"`)));
check('KB3', 'column order in code matches the board',
  () => /pipelineColumns = \['pipe-col-na', 'pipe-col-ready', 'pipe-col-sched', 'pipe-col-ob'\]/.test(ts));
check('KB4', 'Ready -> Scheduled opens the existing Schedule flow', () => move && move(1, 2, {}, false).action === 'schedule');
check('KB5', 'Scheduled -> Onboarded opens Mark Onboarded once the call time has passed', () => move && move(2, 3, {}, false).action === 'onboard');
check('KB6', 'Scheduled -> Onboarded is blocked while the call is still upcoming', () => move && !!move(2, 3, {}, true).block && !move(2, 3, {}, true).action);
check('KB7', 'Not Assured cannot move (needs a payment plan)', () => move && [1, 2, 3].every(to => !!move(0, to, {}, false).block));
check('KB8', 'backward moves are blocked', () => move && [[3, 2], [2, 1], [1, 0], [3, 0]].every(([f, t]) => !!move(f, t, {}, false).block));
check('KB9', 'drop handler routes to the existing dialogs, never writes Firestore itself',
  () => { const i = ts.indexOf('  onPipelineDrop('); const b = ts.slice(i, ts.indexOf('\n  }\n', i));
          return /this\.openSchedule\(row, 'onboarding'\)/.test(b) && /this\.markOnboarded\(row\)/.test(b) && /this\.guard\.openSnackBar\(move\.block/.test(b)
            && !/updateDoc|setDoc|writeBatch|moveItemInArray|transferArrayItem/.test(b); });
check('KB10', 'Onboarded cards are not draggable',
  () => /originalData\['pipeOnboarded'\]\.data; trackBy: pipeTrack" cdkDrag \[cdkDragData\]="row" \[cdkDragDisabled\]="true"/.test(html));
check('KB11', 'card buttons: Schedule (Ready+Scheduled), Mark Onboarded (Scheduled), Journey Plan (assured), Notes (all)',
  () => /data-testid="jcd-pipe-card-schedule"[^>]*\*ngIf="stage === 'ready' \|\| stage === 'sched'"/.test(html)
     && /data-testid="jcd-pipe-card-onboard"[^>]*\*ngIf="stage === 'sched'"/.test(html)
     && /\[disabled\]="checkMarkOnboarding\(row\)"\s*\(click\)="markOnboarded\(row\)">Mark Onboarded/.test(html)
     && /data-testid="jcd-pipe-card-plan"[^>]*\*ngIf="stage !== 'na'" \(click\)="navigatejourneyplan\(row\)"/.test(html)
     && /data-testid="jcd-pipe-card-notes"[^>]*\(click\)="row\['generalnotes'\]\?\.length \? viewNotes\(row, 'generalnotes'\) : addNotes\(row\)"/.test(html));
check('KB12', 'uses the existing CDK drag-drop (no new package) and refreshes OnPush view on data change',
  () => /import \{ DragDropModule, CdkDragDrop \} from '@angular\/cdk\/drag-drop';/.test(ts) && /ProfilePictureComponent,\n\s*DragDropModule\n\s*\]/.test(ts)
     && /put\('pipeOnboarded', onboarded\);\n\s*this\.updateTableDataIfOpen\(this\.tableType\);\n\s*this\.cdr\.markForCheck\(\);/.test(ts));
check('KB13', 'board styles scoped to .jcd-embed',
  () => /\.jcd-root\.jcd-embed \.jcd-kboard \{/.test(css) && !/^\.jcd-root \.jcd-k/m.test(css) && !/^\.jcd-k/m.test(css));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
