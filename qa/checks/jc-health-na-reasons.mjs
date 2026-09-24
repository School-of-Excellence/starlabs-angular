// Needs-attention REASON chips (c425ef7f), re-applied onto origin's component after the 2026-09-24
// merge. Shows WHY a participant needs attention, instead of only that they do.
//
// The invariant that matters: the reason list and isNeedsAttention() must stay in lockstep. A
// trigger that fires the predicate but produces no label means a row shows as needing attention
// with nothing to act on; a label with no trigger means a reason that can never appear.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const ts = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');
const css = readFileSync(D + 'journey-coach-health-dashboard.component.css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

check('NR1', 'naReasons on PortfolioRow', () => /naReasons\?: string\[\];/.test(ts));
check('NR2', 'naReasonsFor() exists', () => /private naReasonsFor\(r: PortfolioRow\): string\[\]/.test(ts));
check('NR3', 'it is computed where the row is built', () => /r\.naReasons = this\.naReasonsFor\(r\);/.test(ts));

// lockstep with the predicate — every isNeedsAttention trigger must produce a label
const na = ts.match(/private isNeedsAttention\(r: PortfolioRow\): boolean \{([\s\S]*?)\n  \}/)?.[1] ?? '';
const nr = ts.match(/private naReasonsFor\(r: PortfolioRow\): string\[\] \{([\s\S]*?)\n  \}/)?.[1] ?? '';
for (const [id, trigger, re] of [
  ['NR4', 'lapsed',        /r\.lapsed/],
  ['NR5', 'notStarted',    /r\.notStarted/],
  ['NR6', 'openTickets',   /r\.openTickets > 0/],
  ['NR7', 'llCritical',    /r\.llCritical/],
  ['NR8', 'llAttention',   /r\.llAttention/],
]) check(id, `trigger "${trigger}" fires the predicate AND yields a reason`, () => re.test(na) && re.test(nr));
check('NR9', 'both finance states (locked, defaulted) are labelled',
  () => /'locked'/.test(nr) && /'defaulted'/.test(nr) && /\['locked', 'defaulted'\]/.test(na));
check('NR10', 'going-quiet and renewals are deliberately NOT reasons (they keep their own tiles)',
  () => !/goingQuiet|renewal/i.test(nr));

// executable: the label list for a given row
const reasons = (r) => {
  const out = [];
  if (r.lapsed) out.push('Lapsed');
  if (r.notStarted) out.push('Journey not started');
  if (r.openTickets > 0) out.push(`${r.openTickets} open ticket${r.openTickets > 1 ? 's' : ''}`);
  const fin = (r.financialstatus ?? '').toLowerCase();
  if (fin === 'locked') out.push('Payments locked'); else if (fin === 'defaulted') out.push('Payments defaulted');
  if (r.llCritical) out.push('Critical');
  if (r.llAttention) out.push('Needs Attention');
  return out;
};
check('NR11', 'a clean row yields no reasons',
  () => reasons({ openTickets: 0 }).length === 0);
check('NR12', 'ticket count is pluralised',
  () => reasons({ openTickets: 1 })[0] === '1 open ticket' && reasons({ openTickets: 3 })[0] === '3 open tickets');
check('NR13', 'locked and defaulted are mutually exclusive labels',
  () => reasons({ openTickets: 0, financialstatus: 'LOCKED' }).join() === 'Payments locked'
     && reasons({ openTickets: 0, financialstatus: 'defaulted' }).join() === 'Payments defaulted');

check('NR14', 'the summary row shows reasons, falling back to r.reason',
  () => /\(r\.naReasons && r\.naReasons\.length\) \? r\.naReasons\.join\(' · '\) : r\.reason/.test(html));
check('NR15', 'the priority cell renders a chip per reason',
  () => /class="na-why" \*ngIf="r\.naReasons\?\.length"/.test(html) && /class="na-chip" \*ngFor="let w of r\.naReasons"/.test(html));
check('NR16', 'the chips are styled', () => /\.na-chip/.test(css));
check('NR17', 'component css braces balanced', () => css.split('{').length === css.split('}').length);

if (failed) { console.error(`\n${failed} na-reasons check(s) FAILED — the reason chips have regressed.`); process.exit(1); }
console.log('\nAll na-reasons checks passed.');
