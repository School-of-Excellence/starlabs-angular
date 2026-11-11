// Journey Coach Health -> Onboarding tab (embedded journeycoach-dashboard), operator 2026-11-11:
//  item 3: "Pending approval N" chip on the Gross Sales count card -> gross sales table filtered to pending.
//  item 4: repeated 4-tile pipeline row removed; the board column headers carry subtitle + count drill-down.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.';
const ts = readFileSync(J + 'ts', 'utf8');
const html = readFileSync(J + 'html', 'utf8');
const css = readFileSync(J + 'css', 'utf8');
const eng = readFileSync('src/app/Journey Onboarding/journeycoach-dashboard/journeycoach.engine.ts', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const body = (src, sig) => { const i = src.indexOf(sig); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
const gross = html.slice(html.indexOf('data-testid="jcd-div-012"'), html.indexOf('<!-- ASSURED SALES -->'));
const pipe = html.slice(html.indexOf('data-testid="jcd-pipe"'), html.indexOf('<ng-template #pipeCard'));

// Real pending predicate from the engine, run against sample rows.
let isPending = null;
try {
  const m = eng.match(/export function isPending\(row: any\): boolean \{\n\s*return ([^\n]+);\n\}/);
  isPending = new Function('row', `return ${m[1]};`);
} catch { isPending = null; }
const rows = [{ status: null }, {}, { status: '' }, { status: 'pending' }, { status: 'Pending' }, { status: 'Approved' }, { status: 'approved' }];

check('PT1', 'Gross card (embed only) has the Pending approval chip after the unchanged count, opening via openGrossPending($event)',
  () => /<button type="button" class="jcd-embed-pending" data-testid="jcd-embed-gross-pending" \*ngIf="embedOnboarding" [^>]*\(click\)="openGrossPending\(\$event\)">Pending approval <b>\{\{ getGrossPendingCount\(\) \}\}<\/b><\/button>/.test(gross)
     && gross.indexOf('data-testid="jcd-embed-gross-count"') < gross.indexOf('data-testid="jcd-embed-gross-pending"'));
check('PT2', 'chip handler: stops propagation (no double card click), opens Gross Sales only if not open, applies Status = Pending only',
  () => { const b = body(ts, '  openGrossPending(event: Event) {');
          return /event\.stopPropagation\(\);/.test(b)
            && /if \(!\(this\.showTable && this\.tableType === 'grossSales'\)\) this\.onBoxClick\('grossSales'\);/.test(b)
            && /patchValue\(\{ search: '', journey: '', journeycoach: '', purchaseStart: '', purchaseEnd: '', assured: '', status: 'Pending', saleType: '', customerStatus: '' \}\)/.test(b)
            && /this\.filterTableData\(this\.filterForm\.value\);/.test(b)
            && !/getDocs|collection\(|query\(/.test(b); });
check('PT3', 'chip count == filtered rows: count and the table Status filter share engine.isPending',
  () => /return \[null, undefined, "", "pending"\]\.includes\(row\?\.\['status'\]\?\.toLowerCase\(\)\);/.test(eng)
     && /export function countPending\(rows: any\[\]\): number \{\n\s*return rows\.filter\(isPending\)\.length;/.test(eng)
     && /if \(selectedStatusData == 'Approved'\) \{\n\s*matchesStatus = !engine\.isPending\(row\);\n\s*\} else \{\n\s*matchesStatus = engine\.isPending\(row\);/.test(ts)
     && /getGrossPendingCount\(\) \{ return engine\.countPending\(this\.originalData\['grosssale'\]\?\.data \|\| \[\]\); \}/.test(ts));
check('PT4', 'pending predicate on sample rows: null/missing/empty/pending(any case) = 5 pending, approved = 2',
  () => isPending && rows.filter(r => isPending(r)).length === 5 && rows.filter(r => !isPending(r)).length === 2);
check('PT5', 'standalone untouched: chip is embed-only; Gross legend Pending pill still present',
  () => /data-testid="jcd-embed-gross-pending" \*ngIf="embedOnboarding"/.test(html)
     && /Pending \{\{getGrossPendingCount\(\)\}\}<\/span>/.test(gross));
check('PT6', 'repeated tile row is gone from the pipeline card (no .jcd-pstrip / stage tiles)',
  () => !html.includes('jcd-pstrip') && !/class="orc st[1-4]"/.test(pipe) && !css.includes('jcd-pstrip'));
check('PT7', 'each column header carries the old tile subtitle and a count button that opens that stage table',
  () => [['Not Assured', 'Gross sales · no payment plan', 'jcd-pipe-notassured', 'pipeNotAssured'],
         ['Ready for Onboarding', 'Assured sales · no call booked', 'jcd-pipe-ready', 'pipeReady'],
         ['Scheduled for Onboarding', 'Call booked · not onboarded', 'jcd-pipe-scheduled', 'pipeScheduled'],
         ['Onboarded', 'Marked onboarded', 'jcd-pipe-onboarded', 'pipeOnboarded']]
     .every(([t, s, id, k]) => pipe.includes(`<div class="jcd-kcol-head"><div class="jcd-kcol-hl"><span class="jcd-kcol-title">${t}</span><span class="jcd-kcol-sub">${s}</span></div><button type="button" class="jcd-kcount" data-testid="${id}" title="Open table" [class.on]="showTable && tableType === '${k}'" (click)="onBoxClick('${k}')">{{ originalData['${k}'].count }}</button></div>`)
        && (pipe.match(new RegExp(`data-testid="${id}"`, 'g')) || []).length === 1));
check('PT8', 'caption + journey selector kept',
  () => pipe.includes('Date filter: purchase date for the first three stages') && pipe.includes('data-testid="jcd-pipe-journey"'));
check('PT9', 'new styles scoped to .jcd-embed',
  () => /\.jcd-root\.jcd-embed \.jcd-embed-pending \{/.test(css) && /\.jcd-root\.jcd-embed \.jcd-kcol-sub \{/.test(css)
     && !/^\.jcd-root \.jcd-embed-pending/m.test(css) && !/^\.jcd-embed-pending/m.test(css));
check('PT10', 'table footer "of N" counts the filtered rows (so chip N == footer N), not the unfiltered source',
  () => html.includes("of {{ currentTableConfig?.data?.length || 0 }}") && !/of \{\{ filteredTableData\.length \}\}/.test(html));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
