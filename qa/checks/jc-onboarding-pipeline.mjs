// Journey Coach Health -> Onboarding tab: 4-stage onboarding pipeline + table-on-count-click (operator 2026-11-11).
// Lives in the embedded journeycoach-dashboard ([embedOnboarding]); standalone /JourneycoachDashboard-new unchanged.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.';
const ts = readFileSync(J + 'ts', 'utf8');
const html = readFileSync(J + 'html', 'utf8');
const css = readFileSync(J + 'css', 'utf8');
const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const hhtml = readFileSync(H + 'html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const body = (name) => { const i = ts.indexOf(`  ${name}(`); return ts.slice(i, ts.indexOf('\n  }\n', i)); };
const rp = body('recomputePipeline');

check('PL1', 'pipeline card renders only in embed mode, above the table section',
  () => /<div class="card span8 jcd-pipe" id="jcd-onb-pipeline" data-testid="jcd-pipe" \*ngIf="embedOnboarding">/.test(html)
     && html.indexOf('data-testid="jcd-pipe"') < html.indexOf('<div class="jcd-table-section"'));
check('PL2', 'four stage counts, each opens its own table',
  () => [['jcd-pipe-notassured', 'pipeNotAssured'], ['jcd-pipe-ready', 'pipeReady'], ['jcd-pipe-scheduled', 'pipeScheduled'], ['jcd-pipe-onboarded', 'pipeOnboarded']]
      .every(([t, k]) => new RegExp(`data-testid="${t}"[^>]*\\(click\\)="onBoxClick\\('${k}'\\)"`).test(html)
        && html.includes(`{{ originalData['${k}'].count }}`)));
check('PL3', 'tile == list: every stage table reads the same originalData key its tile counts',
  () => ['pipeNotAssured', 'pipeReady', 'pipeScheduled', 'pipeOnboarded']
      .every(k => new RegExp(`${k}: \\{[^}]*dataKey: '${k}'`).test(ts)));
check('PL4', 'stages are disjoint: Not Assured = no payment plan; Ready/Scheduled split on onboardingscheduled; Onboarded = onboarded set',
  () => /const notAssured = \(this\.originalData\['notassured'\]\.data \|\| \[\]\)\.filter\(inRange\)/.test(rp)
     && /const open = \(this\.originalData\['all'\]\.data \|\| \[\]\)\.filter\(inRange\)/.test(rp)
     && /const ready = open\.filter\(\(r: any\) => !r\['onboardingscheduled'\]\)/.test(rp)
     && /const scheduled = open\.filter\(\(r: any\) => !!r\['onboardingscheduled'\]\)/.test(rp)
     && /const onboarded = this\.originalData\['onboarded'\]\.data/.test(rp));
check('PL5', 'date filter: stages 1-3 by purchase date in the dashboard range',
  () => /new Date\(this\.startDate\)/.test(rp) && /new Date\(this\.endDate\)/.test(rp) && /r\?\.\['purchasedate'\]/.test(rp));
check('PL6', 'Journey selector changes the stage counts (not a no-op)',
  () => /data-testid="jcd-pipe-journey-opt"[^>]*\(click\)="setPipelineJourney\(j\.id\)"/.test(html)
     && /setPipelineJourney\(id: string\) \{\s*this\.pipelineJourney = id;\s*this\.recomputePipeline\(\);/.test(ts)
     && /this\.pipelineJourney === 'all' \|\| jid\(r\) === this\.pipelineJourney/.test(rp));
check('PL7', 'pipeline is recomputed when the source sets change (by-product recompute + onboarded set)',
  () => /this\.onboardingProducts = [^\n]*\n    this\.recomputePipeline\(\);/.test(ts)
     && /this\.originalData\['onboarded'\]\.count = tempArray4\.length;\n\s*this\.recomputePipeline\(\);/.test(ts));
check('PL8', 'standalone untouched: recompute is embed-only; display tweaks gated on embedOnboarding',
  () => /recomputePipeline\(\) \{\n    if \(!this\.embedOnboarding\) return;/.test(ts)
     && /return \(this\.embedOnboarding && cols === this\.assuredColumns/.test(ts)
     && /get showNameContact\(\): boolean \{\s*return this\.embedOnboarding/.test(ts));
check('PL9', 'table renders displayColumns (actions grouped) while export keeps currentTableConfig.columns',
  () => (html.match(/\*ngFor="let column of displayColumns"/g) || []).length === 2
     && !/let column of currentTableConfig\?\.columns/.test(html)
     && /'Schedule', 'Action', 'Journey Plan'/.test(ts));
check('PL10', 'mobile + email under the name and coloured delayed days, embed only',
  () => /data-testid="jcd-name-contact" \*ngIf="showNameContact"/.test(html)
     && /column\.key === 'delayeddays'" \[ngClass\]="embedOnboarding \? delayClass\(row\) : ''"/.test(html)
     && /\.jcd-root\.jcd-embed \.jcd-wait-bad \{/.test(css));
check('PL11', 'needs-a-call rows first (no call, then call passed, then upcoming)',
  () => /return !d \? 0 : \(d <= now \? 1 : 2\);/.test(ts) && /this\.sortNeedsSchedulingFirst\(this\.originalData\['all'\]\.data\)/.test(rp));
check('PL12', 'old 5-bucket intake funnel removed from the Onboarding tab',
  () => { const panel = hhtml.slice(hhtml.indexOf('data-testid="jx-panel-onboarding"')); const sec = panel.slice(0, panel.indexOf('</section>'));
          return !sec.includes('<app-onboarding-pipeline>') && !sec.includes('jx-onboarding-pipeline'); });
check('PL13', 'table opens only from a count (showTable defaults false; no auto-open)',
  () => /\n  showTable = false;/.test(ts) && !/this\.showTable = true;[^\n]*\n[^\n]*embedOnboarding/.test(ts));
check('PL14', 'pipeline styles scoped to .jcd-embed',
  () => /\.jcd-root\.jcd-embed \.jcd-pstrip \{/.test(css) && !/^\.jcd-root \.jcd-pstrip/m.test(css));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
