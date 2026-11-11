// Journey Coach Health — 4 top-level tabs (Overall Summary / Onboarding / Ev. Preparation /
// Journey Planning). Journey Planning is the existing coach-health screen, wrapped unchanged.
// Revert the tab scaffold and these assertions go RED.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const ts = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

check('TB1', "experienceTab defaults to 'planning' (current screen first, nothing displaced)",
  () => /experienceTab:\s*'overall' \| 'onboarding' \| 'evprep' \| 'planning'\s*=\s*'planning'/.test(ts));
check('TB2', 'tab bar exists', () => /data-testid="jx-tabbar"/.test(html));
for (const [id, t] of [['TB3', 'overall'], ['TB4', 'onboarding'], ['TB5', 'evprep'], ['TB6', 'planning']]) {
  check(id, `tab "${t}" exists and switches experienceTab`,
    () => new RegExp(`setExperienceTab\\('${t}'\\)[^>]*data-testid="jx-tab-${t}"`).test(html));
}
check('TB7', 'existing coach-health header is wrapped in the Journey Planning tab',
  () => /<ng-container \*ngIf="experienceTab === 'planning'">\s*<header class="jchd-header">/.test(html));
// Onboarding is mounted once (Overall Summary reads the same instance — operator 2026-11-11, option B)
// and shown only on its own tab; Ev. Preparation / Overall are *ngIf-gated.
check('TB8', 'Onboarding / Ev. Preparation / Overall panels are gated by experienceTab',
  () => ['evprep', 'overall'].every(t => new RegExp(`\\*ngIf="experienceTab === '${t}'" data-testid="jx-panel-${t}"`).test(html))
     && /\*ngIf="jcdMounted" \[class\.jx-offstage\]="experienceTab !== 'onboarding'" data-testid="jx-panel-onboarding"/.test(html));
// Completeness: the existing Summary / Participants / Coaches views are untouched.
check('TB9', 'Summary / Participants / Coaches toggle still present',
  () => /value="summary">Summary/.test(html) && /value="base">Participants/.test(html) && /value="scoreboard">Coaches/.test(html));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
