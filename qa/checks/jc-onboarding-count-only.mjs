// Journey Coach Health -> Onboarding tab: Gross Sales and Assured Sales show the count only
// (operator 2026-11-11). Standalone /JourneycoachDashboard-new keeps every detail.
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.';
const html = readFileSync(J + 'html', 'utf8');
const css = readFileSync(J + 'css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

const slice = (from, to) => html.slice(html.indexOf(from), html.indexOf(to));
const gross = slice('<!-- GROSS SALES -->', '<!-- ASSURED SALES -->');
const assured = slice('<!-- ASSURED SALES -->', '<!-- AR HEALTH');

// Body = everything after the count line; it must sit inside a !embedOnboarding container.
const detailGated = (card, firstDetail) => {
  const gate = card.indexOf('<ng-container *ngIf="!embedOnboarding">');
  const detail = card.indexOf(firstDetail);
  const close = card.lastIndexOf('</ng-container>');
  return gate >= 0 && detail > gate && close > card.indexOf('class="avgpill"');
};

check('CO1', 'Gross: embed shows only the gross-sale count',
  () => /<div class="big jcd-embed-count" data-testid="jcd-embed-gross-count" \*ngIf="embedOnboarding">\{\{originalData\['grosssale'\]\.count\}\}<\/div>/.test(gross));
check('CO2', 'Assured: embed shows only the assured-sale count',
  () => /<div class="big jcd-embed-count" data-testid="jcd-embed-assured-count" \*ngIf="embedOnboarding">\{\{originalData\['assuredsale'\]\.count\}\}<\/div>/.test(assured));
check('CO3', 'Gross: value, EMI, split, negatives, legend, avg pill hidden in embed only',
  () => detailGated(gross, '{{totalGrossValue') && ['jcd-div-013', 'jcd-div-016', 'glegend', 'jcd-div-019'].every(t => gross.indexOf(t) > gross.indexOf('*ngIf="!embedOnboarding"')));
check('CO4', 'Assured: value, EMI, split, negatives, avg pill hidden in embed only',
  () => detailGated(assured, '{{totalAssuredValue') && ['jcd-div-021', 'jcd-div-024', 'jcd-div-027'].every(t => assured.indexOf(t) > assured.indexOf('*ngIf="!embedOnboarding"')));
check('CO5', 'Standalone keeps every detail element (nothing deleted)',
  () => ['jcd-div-013','jcd-div-014','jcd-div-015','jcd-div-016','jcd-div-017','jcd-div-018','jcd-div-019',
         'jcd-div-021','jcd-div-022','jcd-div-023','jcd-div-024','jcd-div-025','jcd-div-026','jcd-div-027']
         .every(t => html.includes(`data-testid="${t}"`)) && gross.includes('glegend'));
check('CO6', 'Drill-down kept: card click + Open table link outside the gate',
  () => /<div data-testid="jcd-div-012" class="card span4" \(click\)="onBoxClick\('grossSales'\)"/.test(gross)
     && gross.indexOf('jcd-lnk-gross-table') < gross.indexOf('jcd-embed-gross-count')
     && /<div data-testid="jcd-div-020" class="card span4" \(click\)="onBoxClick\('assuredSales'\)"/.test(assured)
     && assured.indexOf('jcd-lnk-assured-table') < assured.indexOf('jcd-embed-assured-count'));
check('CO7', 'Count style is scoped to .jcd-embed',
  () => /\.jcd-root\.jcd-embed \.jcd-embed-count \{/.test(css) && !/^\.jcd-root \.jcd-embed-count/m.test(css));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
