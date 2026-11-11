// Journey Coach Health -> Onboarding tab.
// Gross & Assured sales + Onboarding by product come from the Journey Experience dashboard
// (journeycoach-dashboard) embedded with [embedOnboarding]="true"; the intake pipeline
// (onboarding-pipeline) sits directly below. The standalone dashboard must be unchanged
// (embedOnboarding defaults to false). Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';

const J = 'src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.';
const H = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.';
const jts = readFileSync(J + 'ts', 'utf8');
const jhtml = readFileSync(J + 'html', 'utf8');
const jcss = readFileSync(J + 'css', 'utf8');
const hts = readFileSync(H + 'ts', 'utf8');
const hhtml = readFileSync(H + 'html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// --- journeycoach-dashboard: opt-in embed mode, standalone unchanged ---
check('OT1', 'embedOnboarding input exists and defaults to false (standalone unchanged)',
  () => /@Input\(\) embedOnboarding = false;/.test(jts));
check('OT2', 'root carries .jcd-embed only in embed mode',
  () => /<div class="jcd-root" \[class\.jcd-dark\]="darkMode" \[class\.jcd-embed\]="embedOnboarding">/.test(jhtml));
check('OT3', 'AR Health, rail and rows 3-4 are hidden in embed mode',
  () => /<!-- AR HEALTH[^\n]*-->\n<ng-container \*ngIf="!embedOnboarding">/.test(jhtml)
     && /<ng-container \*ngIf="!embedOnboarding"><!-- rail \+ rows 3-4/.test(jhtml));
check('OT4', 'brand, love pill and theme toggle are hidden in embed mode',
  () => /class="brand" \*ngIf="!embedOnboarding"/.test(jhtml)
     && /class="lovepill" \*ngIf="!embedOnboarding"/.test(jhtml)
     && /class="themebtn" \*ngIf="!embedOnboarding"/.test(jhtml));
const keep = jhtml.slice(jhtml.indexOf('<!-- GROSS SALES -->'), jhtml.indexOf('<!-- AR HEALTH'));
check('OT5', 'Gross & Assured sales cards are NOT gated (they render in the tab)',
  // Card containers themselves carry no *ngIf; count-only bodies in embed mode are covered by jc-onboarding-count-only.
  () => /<div data-testid="jcd-div-012" class="card span4" \(click\)="onBoxClick\('grossSales'\)"/.test(keep)
     && /<div data-testid="jcd-div-020" class="card span4" \(click\)="onBoxClick\('assuredSales'\)"/.test(keep));
// End the slice BEFORE the rail's gate so the gate itself isn't counted as gating the card.
const railGate = jhtml.indexOf('<ng-container *ngIf="!embedOnboarding"><!-- rail');
const row2 = jhtml.slice(jhtml.indexOf('<!-- ROW 2 -->'), railGate >= 0 ? railGate : jhtml.indexOf('<div class="rail a">'));
check('OT6', 'Onboarding by product card (tiles + product table) is NOT gated',
  () => row2.includes('Onboarding · by product') && row2.includes('onboardingProducts') && !/\*ngIf="!embedOnboarding"/.test(row2));
check('OT7', 'table section + dialogs are not gated, so every drill-down still works',
  () => /<div class="jcd-table-section" \*ngIf="showTable"/.test(jhtml) && !/jcd-table-section[^>]*embedOnboarding/.test(jhtml));
check('OT8', 'Pipeline link scrolls to the pipeline when embedded, opens the page when standalone',
  () => /if \(this\.embedOnboarding\) \{\s*document\.getElementById\('jx-onboarding-pipeline'\)/.test(jts)
     && /window\.open\('\/onboarding-pipeline', '_blank'\)/.test(jts));
check('OT9', 'embed CSS is scoped and the fixed full-screen loader becomes local',
  () => /\.jcd-root\.jcd-embed \.loading-overlay \{ position: relative;/.test(jcss)
     && /\.jcd-root\.jcd-embed \.top \{ position: static;/.test(jcss));

// --- coach-health: Onboarding tab composition ---
check('OT10', 'coach-health imports both embedded components',
  () => /JourneycoachDashboardComponent, OnboardingPipelineComponent,/.test(hts));
const panel = hhtml.slice(hhtml.indexOf('data-testid="jx-panel-onboarding"'));
const iSales = panel.indexOf('<app-journeycoach-dashboard [embedOnboarding]="true"');
const iPipe = panel.indexOf('id="jx-onboarding-pipeline"');
check('OT11', 'Onboarding tab embeds the sales/onboarding sections', () => iSales >= 0);
check('OT12', 'intake pipeline is BELOW the by-product table', () => iSales >= 0 && iPipe > iSales && panel.includes('<app-onboarding-pipeline>'));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
