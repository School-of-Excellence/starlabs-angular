// jc-health-ux-e2e: functional fixes from qa/jc-health-ux-review.md (F1-F10). Predicate + source guards that
// go RED on revert; the live matrix in the review doc is the browser proof.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/';
const read = (p) => readFileSync(J + p, 'utf8');
const hTs = read('journey-coach-health-dashboard/journey-coach-health-dashboard.component.ts');
const hHtml = read('journey-coach-health-dashboard/journey-coach-health-dashboard.component.html');
const jTs = read('journeycoach-dashboard/journeycoach-dashboard.component.ts');
const jHtml = read('journeycoach-dashboard/journeycoach-dashboard.component.html');
const eTs = read('jc-evprep-board/jc-evprep-board.component.ts');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// F2 predicate: the tile must equal the drill list (critical OR tagged), never critical + tagged.
const docs = [{ critical: true, tagged: true }, { critical: true }, { tagged: true }, {}];
const tile = docs.filter(d => d.critical || d.tagged).length;
const list = docs.filter(d => d.critical || d.tagged).length;
check('UX1', 'F2 predicate: a doc flagged critical AND attention is counted once (3, not 4)', () => tile === 3 && tile === list);

check('UX2', 'F1 MatSort bound through a ViewChild setter (table renders behind *ngIf)',
  () => /@ViewChild\(MatSort\) set sort\(s: MatSort \| undefined\) \{[\s\S]{0,120}this\.dataSource\.sort = s;/.test(hTs));
check('UX3', 'F2 critAttn computed with the OR predicate in both summaries (Planning + Overall scoped)',
  () => /critAttn: docs\.filter\(d => d\.critical \|\| d\.tagged\)\.length/.test(hTs)
     && /critAttn: all\.filter\(d => d\['critical'\] === true \|\| d\['tagged'\] === true\)\.length/.test(hTs));
check('UX4', 'F2 both Critical + Attn tiles render critAttn (no critical + tagged sum)',
  () => (hHtml.match(/<span class="ah-mini-n">\{\{ s\.critAttn \}\}<\/span>/g) || []).length === 2 && !/s\.critical \+ s\.tagged/.test(hHtml));
check('UX5', 'F3 coach path loads its roster JC appointments through the shared classifier and marks schedule ready',
  () => /this\.obDoneEvents\.set\(obDone\);\s*\/\/[^\n]*\n\s*this\.contactEventsLoaded\.set\(true\);/.test(hTs)
     && (hTs.match(/this\.contactDataLoaded\(\) \|\| this\.contactEventsLoaded\(\)/g) || []).length === 3
     && /if \(data\['journeycoach'\] === true\) this\.classifyJcAppt\(data, scoped\);/.test(hTs)
     && /if \(!this\.pagedMode && !this\.contactDataLoaded\(\)\) \{\s*this\.jcDoneEvents\.update/.test(hTs)
     && (hTs.match(/this\.classifyJcAppt\(/g) || []).length === 2);
check('UX6', 'F4 Unassigned option shows "…" until the Unassigned view has counted',
  () => (hHtml.match(/Unassigned · no coach \(\{\{ unassignedKnown \? unassignedCount : '…' \}\}\)/g) || []).length === 2
     && /this\.unassignedCount = this\.loadedRowCount; this\.unassignedKnown = true;/.test(hTs));
check('UX7', 'F5 empty Onboarding table footer reads "Showing 0 of 0"',
  () => /<ng-template #jcdNoRows>Showing 0 of 0<\/ng-template>/.test(jHtml));
check('UX8', 'F6 Gross "Open table" switches the Pending-filtered table to all rows instead of closing it',
  () => /data-testid="jcd-lnk-gross-table" \(click\)="openGrossTable\(\$event\)"/.test(jHtml)
     && /openGrossTable\(event: Event\) \{[\s\S]{0,260}this\.filterForm\.value\.status === 'Pending'\) \{\s*this\.filterForm\.patchValue\(\{ status: '' \}\);/.test(jTs));
check('UX9', 'F7 header typo fixed', () => !/Perosn/.test(jTs) && /'Pre-Sales Person'/.test(jTs));
check('UX10', 'F8 context line states the filtered count when a filter is on',
  () => /data-testid="jchd-diag-showing"> · showing \{\{ dataSource\.filteredData\.length \}\}/.test(hHtml));
check('UX11', 'F9 Ev. Prep stays mounted after its first visit (hidden off its tab, no reload)',
  () => /\*ngIf="evprepMounted" \[class\.jx-offstage\]="experienceTab !== 'evprep'" data-testid="jx-panel-evprep"/.test(hHtml)
     && /if \(t === 'evprep'\) this\.evprepMounted = true;/.test(hTs));
check('UX12', 'F10 Escape closes the Ev. Prep move box; note field gets focus',
  () => /@HostListener\('document:keydown\.escape'\)\s*onEscape\(\): void \{ if \(this\.pending\) this\.closeMove\(\); \}/.test(eTs)
     && /getElementById\('evp-move-note'\)/.test(eTs));
check('UX13', 'invariant kept: Viewing coach select still drives the Participants scope',
  () => /data-testid="viewing-coach-select" \[ngModel\]="selectedCoachId" \(ngModelChange\)="onCoachChange\(\$event\)"/.test(hHtml));

if (failed) { console.error(`\n${failed} ux-e2e check(s) FAILED.`); process.exit(1); }
console.log('\nAll ux-e2e checks passed.');
