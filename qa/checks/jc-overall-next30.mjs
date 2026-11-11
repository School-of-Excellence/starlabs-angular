// Journey Coach Health -> Overall Summary · Scheduled & completed: "Next 30 days" tiles (JC + Onboarding).
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const ts = readFileSync(H + 'ts', 'utf8');
const html = readFileSync(H + 'html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const body = (name) => { const i = ts.indexOf(`  ${name}(`); return i < 0 ? '' : ts.slice(i, ts.indexOf('\n  }\n', i)); };
const pbody = (name) => { const i = ts.indexOf(`  private ${name}(`); return i < 0 ? '' : ts.slice(i, ts.indexOf('\n  }\n', i)); };
const card = (() => { const i = html.indexOf('data-testid="ov-schedule"'); return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i)); })();

check('N1', "ovPending has a 'month' bucket = days 1-30 after today (today excluded, includes the next 7)",
  () => { const p = pbody('ovPending');
          return /bucket: 'today' \| 'week' \| 'month'/.test(p) && /const month30 = endToday \+ 30 \* 86400000;/.test(p)
            && /\(e\.ms > endToday && e\.ms <= month30\)/.test(p) && /e\.ms >= now/.test(p); });
check('N2', 'ovSched exposes jcMonth / obMonth from the same ovPending source',
  () => /jcMonth: this\.ovPending\(false, 'month'\)\.length/.test(body('ovSched'))
     && /obMonth: this\.ovPending\(true, 'month'\)\.length/.test(body('ovSched')));
check('N3', "ovSchedDrill accepts 'month' and drills ovPending (tile == list)",
  () => /what: 'today' \| 'week' \| 'month' \| 'done'/.test(body('ovSchedDrill'))
     && /this\.ovDone\(onboarding\) : this\.ovPending\(onboarding, what\)/.test(body('ovSchedDrill')));
check('N4', 'JC Next 30 days tile: literal testid, drills month, shows k.jcMonth',
  () => /\(click\)="ovSchedDrill\(false, 'month', 'Journey Coaching · next 30 days'\)" data-testid="ov-jc-month"><span class="jcp-num">\{\{ k\.jcMonth \}\}/.test(card));
check('N5', 'Onboarding Next 30 days tile: literal testid, drills month, shows k.obMonth',
  () => /\(click\)="ovSchedDrill\(true, 'month', 'Onboarding · next 30 days'\)" data-testid="ov-obs-month"><span class="jcp-num">\{\{ k\.obMonth \}\}/.test(card));
check('N6', 'tile order per row: today, 7 days, 30 days, completed; rows are 4 columns',
  () => { const o = ['ov-jc-today', 'ov-jc-week', 'ov-jc-month', 'ov-jc-done', 'ov-obs-today', 'ov-obs-week', 'ov-obs-month', 'ov-obs-done']
            .map(t => card.indexOf(`data-testid="${t}"`));
          return o.every((v, i) => v > 0 && (i === 0 || v > o[i - 1]))
            && (card.match(/ov-tiles ov-t4/g) || []).length === 2 && !card.includes('ov-tiles ov-t3'); });
check('N7', 'JC and Onboarding month buckets stay disjoint (onboarding flag split in ovPending)',
  () => /\(e\.onboarding === true\) === onboarding/.test(pbody('ovPending')));
check('N8', 'footer explains Next 30 days', () => /Next 30 days = booked sessions in the 30 days after today \(includes the next 7\)/.test(card));
check('N9', 'no new query: month bucket reads jcPendingEvents only',
  () => /this\.jcPendingEvents\(\)\.filter\(/.test(pbody('ovPending')) && !/getDocs|query\(/.test(pbody('ovPending')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
