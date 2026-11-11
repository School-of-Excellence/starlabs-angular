// Journey Coach Health -> Overall Summary tab (operator spec 2026-11-11).
// Sections: date range + Viewing as; 1 Sales by Journey; 2 Onboarding status; 3 Scheduled & completed;
// 4 Planned journey · next 6 months (was Ready for SE); 5 Participant health; 6 Ask A&H & Love Letter.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const ts = readFileSync(H + 'ts', 'utf8');
const html = readFileSync(H + 'html', 'utf8');
const css = readFileSync(H + 'css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const body = (name) => { const i = ts.indexOf(`  ${name}(`); return i < 0 ? '' : ts.slice(i, ts.indexOf('\n  }\n', i)); };
const pbody = (name) => { const i = ts.indexOf(`  private ${name}(`); return i < 0 ? '' : ts.slice(i, ts.indexOf('\n  }\n', i)); };
const panel = (() => { const i = html.indexOf('data-testid="jx-panel-overall"'); return i < 0 ? '' : html.slice(i, html.indexOf('\n  </section>\n</div>', i)); })();
const planning = html.slice(html.indexOf('<ng-container *ngIf="experienceTab === \'planning\'">'), html.indexOf('<!-- ═══ end Journey Planning tab ═══ -->'));

check('OV1', 'placeholder replaced: Overall panel has all six sections',
  () => !panel.includes('Cross-area summary') && ['ov-sales', 'ov-onboarding', 'ov-schedule', 'ov-plan', 'ov-health', 'ov-ah']
      .every(t => panel.includes(`data-testid="${t}"`)));
check('OV2', 'section order matches the spec (1 Sales, 2 Onboarding, 3 Schedule, 4 Plan grid, 5 Health, 6 A&H)',
  () => { const o = ['ov-sales', 'ov-onboarding', 'ov-schedule', 'ov-plan', 'ov-health', 'ov-ah'].map(t => panel.indexOf(`data-testid="${t}"`));
          return o.every((v, i) => v > 0 && (i === 0 || v > o[i - 1])); });
check('OV3', 'ONE shared Onboarding dashboard: mounted on Overall or Onboarding, hidden off its tab (not *ngIf per tab)',
  () => /\*ngIf="jcdMounted" \[class\.jx-offstage\]="experienceTab !== 'onboarding'" data-testid="jx-panel-onboarding"/.test(html)
     && /if \(t === 'overall' \|\| t === 'onboarding'\) this\.jcdMounted = true;/.test(ts)
     && (html.match(/<app-journeycoach-dashboard/g) || []).length === 1
     && /\.jx-offstage \{ display: none; \}/.test(css));
check('OV4', 'date range drives the shared dashboard (month step / month / range) — one range for Overall + Onboarding',
  () => /j\.backwardMonth\(\); else j\.forwardMonth\(\)/.test(body('ovStepMonth'))
     && /j\.monthyear = ym;\s*j\.updateDate\(\);/.test(body('ovSetMonth'))
     && /j\.pickerMode = 'range';/.test(body('ovSetRange')) && /j\.fetchData\(\)/.test(body('ovSetRange'))
     && ['ov-date-prev', 'ov-date-month', 'ov-date-next', 'ov-date-start', 'ov-date-end'].every(t => panel.includes(`data-testid="${t}"`)));
check('OV5', 'Viewing as changes scope: the Overall select calls onCoachChange (same handler as Planning)',
  () => /data-testid="ov-viewing-select" \[ngModel\]="selectedCoachId" \(ngModelChange\)="onCoachChange\(\$event\)"/.test(panel));
check('OV6', 'Sales by Journey = the Gross New / Upgrade / Add-on sets grouped by journey; Overall = N + U + A',
  () => { const b = body('ovSales');
          return /\['grossnewsale'\]/.test(b) && /\['grossupgradesale'\]/.test(b) && /\['grossaddonsale'\]/.test(b)
            && /r\.total = r\.newN \+ r\.upN \+ r\.addN/.test(b)
            && /total: n\.length \+ u\.length \+ a\.length/.test(b); });
check('OV7', 'tile == list: every sales cell drills the same set it counts (journey + kind filter)',
  () => /ovSalesDrill\(r\.id, 'new'/.test(panel) && /ovSalesDrill\(r\.id, 'upgrade'/.test(panel) && /ovSalesDrill\(r\.id, 'addon'/.test(panel)
     && /ovSalesDrill\(r\.id, 'all'/.test(panel)
     && /filter\(s => journeyId == null \|\| jid\(s\) === journeyId\)/.test(body('ovSalesDrill')));
check('OV8', 'Onboarding status reads the dashboard\'s own sets and opens its real table',
  () => [['ov-ob-tobe', 'all', 'toBeOnboarded'], ['ov-ob-le7', 'last7DaysnotOnboarded', 'less7Days'],
         ['ov-ob-gt7', 'last15daysnotOnboarded', 'more7Days'], ['ov-ob-onboarded', 'onboarded', 'onboarded']]
      .every(([t, k, box]) => new RegExp(`\\(click\\)="ovOpenOnboardingTable\\('${box}'\\)" data-testid="${t}"><span class="jcp-num">\\{\\{ ovObCount\\('${k}'\\) \\}\\}`).test(panel))
     && /j\.avgAssured\.toFixed\(2\)/.test(body('ovObAvg')) && panel.includes('Avg days from ASV to Onboarding'));
check('OV9', 'Scheduled today / next 7 use the Planning Schedule predicates; tile and drill share one source',
  () => { const p = pbody('ovPending');
          return /\(e\.onboarding === true\) === onboarding/.test(p) && /e\.ms >= now/.test(p) && /e\.ms <= endToday/.test(p)
            && /e\.ms > endToday && e\.ms <= week7/.test(p)
            && /jcToday: this\.ovPending\(false, 'today'\)\.length/.test(body('ovSched'))
            && /this\.ovDone\(onboarding\) : this\.ovPending\(onboarding, what\)/.test(body('ovSchedDrill')); });
check('OV10', 'JC completed and Onboarding completed are DISJOINT (attended onboarding calls split out of JC done)',
  () => /if \(data\['onboarding'\] === true\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*obDone\.push\(/.test(ts)
     && /this\.obDoneEvents\.set\(obDone\);/.test(ts)
     && /\(onboarding \? this\.obDoneEvents\(\) : this\.jcDoneEvents\(\)\)/.test(pbody('ovDone')));
check('OV11', 'Completed counts only the Overall date range, never the future',
  () => /const from = r\.start\.getTime\(\), to = Math\.min\(r\.end\.getTime\(\), now\);/.test(pbody('ovDone')));
check('OV12', 'Viewing-as scope applied to schedule, completed, health and A&H',
  () => /new Set\(this\.rosterIds\(\)\)/.test(pbody('ovPending')) && /new Set\(this\.rosterIds\(\)\)/.test(pbody('ovDone'))
     && /this\.liteInScope\(l\)/.test(pbody('ovHealthPeople'))
     && /this\.selectedCoachId === this\.ALL \? undefined : new Set\(this\.rosterIds\(\)\)/.test(pbody('ovAhScope')));
check('OV13', 'Participant health = Active participants on Ecosystem products, renamed on Overall only',
  () => /l\.productType !== 'ecosystem' \|\| this\.lifecycleOf\(l\.customerstatus\) !== 'active'/.test(pbody('ovHealthPeople'))
     && /r\.productType !== 'ecosystem' \|\| this\.lifecycleOf\(r\.customerstatus\) !== 'active'/.test(pbody('ovHealthPeople'))
     && /<span class="ios2-title">Participant health<\/span>/.test(panel)
     && /<span class="ios2-title">Coach-set health<\/span>/.test(planning));
check('OV14', 'A&H on Overall = the Planning table\'s docs; at All it is identical (no scope filter)',
  () => /const docs = scope \? this\.ahDocs\.filter\(d => scope\.has\(d\.profileid\)\) : this\.ahDocs;/.test(body('ovAh'))
     && /if \(scope && !scope\.has\(d\.profileid\)\) return false;/.test(body('openAhDrill'))
     && /data-testid="ov-ah-needsattention-combined"/.test(panel));
check('OV15', 'Ready for SE placeholder replaced by the 6-month plan grid (item 2, jc-overall-plan-grid)',
  () => !/data-testid="ov-se(-pending)?"/.test(panel) && /data-testid="ov-plan-grid"/.test(panel));
check('OV16', 'drills reuse the native overlay, now outside the Planning container; no new dialog component',
  () => !planning.includes('class="ahd-backdrop"') && html.indexOf('class="ahd-backdrop"') > html.indexOf('<!-- ═══ end Journey Planning tab ═══ -->')
     && /this\.ahDrill\.set\(\{ title, entries: sorted \}\)/.test(pbody('openOvDrill'))
     && !/this\.dialog\.open\(/.test(ts.slice(ts.indexOf('// ═══ Overall Summary tab'), ts.indexOf('  private openOvDrill('))));
check('OV17', 'completeness: Planning still has its Schedule, JC pipeline, Coach-set health and A&H cards',
  () => ['data-testid="sched-jc-col"', 'data-testid="sched-ob-col"', '<span class="ios2-title">JC pipeline</span>',
         '<span class="ios2-title">Coach-set health</span>', 'data-testid="ah-needsattention-combined"'].every(s => planning.includes(s)));
check('OV18', 'no backdrop-filter / filter / transform / perspective on Overall containers',
  () => { const ov = css.slice(css.indexOf('/* ═══ Overall Summary tab')); return !/(backdrop-filter|[^-]filter:|[^-]transform:|perspective:)/.test(ov); });

check('OV19', 'changes made on the OnPush Onboarding dashboard mark ITS view dirty (tile -> table actually opens)',
  () => /\(j as unknown as \{ cdr\?: ChangeDetectorRef \}\)\.cdr\?\.markForCheck\(\);/.test(pbody('markJcd'))
     && /if \(!open\) j\.onBoxClick\(box\);\s*this\.markJcd\(j\);/.test(body('ovOpenOnboardingTable')));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
