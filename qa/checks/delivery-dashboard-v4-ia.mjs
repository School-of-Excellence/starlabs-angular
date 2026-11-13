// v4 information architecture: ONE number, ONE home.
//
// Before this change the dashboard printed the same populations three times - the KPI
// bento (.dd-kcell), the "Needs Your Attention" tiles (.dd-tile) and the funnel - and
// drew the per-product stage split twice (.dd-pby plus the Products table columns).
// 26 numbers rendered, 7 of them more than once.
//
// The invariant that matters: each population binding appears EXACTLY ONCE in the
// template, and every drill-down the deleted panels provided still exists, re-homed
// onto the surviving number. A panel that comes back duplicates a binding and fails here.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/delivery-dashboard-clone/';
const html = readFileSync(D + 'delivery-dashboard-clone.component.html', 'utf8');
const ts = readFileSync(D + 'delivery-dashboard-clone.component.ts', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const count = (s, re) => (s.match(re) || []).length;

// The invariant is about the HEADLINE area - everything above the tab strip. A count
// inside a tab is a different statement: "Bulk Initiate Ready (6)" on the Participants
// tab labels the button with how many you are about to act on, which is an affordance,
// not a second printing of the headline. So the once-only rule is scoped to the head.
const TAB_MARK = '<!-- TAB STRIP (custom, drives outerTabIndex) =============';
if (!html.includes(TAB_MARK)) { console.log('FAIL  IA0  tab-strip marker missing'); process.exit(1); }
const head = html.slice(0, html.indexOf(TAB_MARK));
const body = html.slice(html.indexOf(TAB_MARK));

// --- the duplicating panels are gone -------------------------------------------
check('IA1', 'KPI bento removed (.dd-kcell / .dd-kpi-grid)',
  () => !/dd-kcell|dd-kpi-grid/.test(html));
check('IA2', 'Needs Your Attention tiles removed (.dd-tile / .dd-attention)',
  () => !/dd-attention|dd-tile__/.test(html));
check('IA3', 'standalone Delivery Pipeline by Product removed (.dd-pby)',
  () => !/dd-pby/.test(html));

// --- each population is printed exactly once -----------------------------------
for (const [id, binding] of [
  ['IA4', 'kpiAwaitingTotal'],
  ['IA5', 'kpiReadyToInitiate'],
  ['IA6', 'kpiStuck'],
  ['IA7', 'kpiInitiatedNotConsuming'],
  ['IA8', 'kpiOngoingTotal'],
  ['IA9', 'kpiCompletedTotal'],
]) {
  check(id, `${binding} rendered exactly once in the headline area`,
    () => count(head, new RegExp(`\\{\\{\\s*${binding}\\b`, 'g')) === 1);
}

// The one sanctioned restatement, pinned so it cannot quietly multiply.
check('IA9b', 'the only kpi* figure repeated below the tabs is the Bulk Initiate button label',
  () => count(body, /\{\{\s*kpiReadyToInitiate\b/g) === 1
     && /Bulk Initiate Ready/.test(body)
     && ['kpiAwaitingTotal', 'kpiStuck', 'kpiInitiatedNotConsuming', 'kpiOngoingTotal', 'kpiCompletedTotal']
          .every(b => count(body, new RegExp(`\\{\\{\\s*${b}\\b`, 'g')) === 0));

// --- every drill-down the deleted panels provided still exists ------------------
for (const [id, target] of [
  ['IA10', 'awaiting'], ['IA11', 'ready'], ['IA12', 'stuck'], ['IA13', 'idle'],
]) {
  check(id, `navToAttention('${target}') survives, exactly once`,
    () => count(head, new RegExp(`navToAttention\\('${target}'\\)`, 'g')) === 1);
}

// --- hooks --------------------------------------------------------------------
for (const [id, hook] of [
  ['IA14', 'dd-funnel'], ['IA15', 'dd-funnel-awaiting'], ['IA16', 'dd-funnel-ready'],
  ['IA17', 'dd-funnel-indelivery'], ['IA18', 'dd-funnel-stuck'], ['IA19', 'dd-funnel-idle'],
  ['IA20', 'dd-funnel-delivered'], ['IA21', 'dd-strip'], ['IA22', 'dd-strip-all'],
  ['IA23', 'dd-strip-chip'], ['IA24', 'dd-speed'], ['IA25', 'dd-kpi-avg-complete'],
]) {
  check(id, `data-testid="${hook}" present`,
    () => html.includes(`data-testid="${hook}"`));
}
check('IA26', 'no interpolated data-testid anywhere', () => !/data-testid="[^"]*\{\{/.test(html));

// --- the strip is a VIEW of the dropdown, not a second filter -------------------
check('IA27', 'strip writes productFilterControl and runs the normal change path',
  () => /selectProductFromStrip\(cardId: string \| null\)/.test(ts)
     && /this\.productFilterControl\?\.setValue\(next\)/.test(ts)
     && /await this\.onProductMultiFilterChange\(\)/.test(ts));
check('IA28', 'strip resolves a product through cardLabelForProductId, like the cohorts do',
  () => /private cardFilterLabel\(cardId: string\): string \{[\s\S]{0,220}this\.cardLabelForProductId\(cardId\)/.test(ts));
check('IA29', 'the multi-select dropdown is still present (strip did not replace it)',
  () => /<mat-select multiple \[formControl\]="productFilterControl"/.test(html));
check('IA30', 'chips are clickable and bound to the strip handler',
  () => /\(click\)="selectProductFromStrip\(cardId\)"/.test(html)
     && /\(click\)="selectProductFromStrip\(null\)"/.test(html));

// --- nothing silently lost ------------------------------------------------------
check('IA31', 'all three sparklines still render',
  () => /sparkReady/.test(html) && /sparkStuck/.test(html) && /sparkCompleted/.test(html));
check('IA32', 'the avg gauge is a 0-90d scale with the target marked inside it',
  () => /readonly avgGaugeMaxDays = 90;/.test(ts) && /avgTargetMarkPct/.test(html));
check('IA33', 'Not recorded still shown when there is nothing to average',
  () => /dd-speed__nr[^>]*>Not recorded</.test(html) && /hasAvgCompleteData/.test(html));
check('IA34', 'Stages / Specialist Slots / Completion History untouched',
  () => /flow-section/.test(html) && /specialist-section-container/.test(html));
check('IA35', 'the three outer tabs survive',
  () => /outerTabIndex = 0/.test(html) && /outerTabIndex = 1/.test(html) && /outerTabIndex = 2/.test(html));

// --- set relationships: the layout must not assert containment it does not have ---
// In delivery = status 'ongoing'. Stuck = 'initiated' OR 'ongoing', stalled.
// Not-consuming = 'initiated' only, so it is DISJOINT from In delivery.
// Live starlabs-test: Glimpse reads In delivery 0, Stuck 13, Not consuming 13.
// Drawing the flags inside the In-delivery step would assert 13 inside 0.
check('IA52', 'Stuck and Not-consuming are NOT nested inside the In-delivery step',
  () => !/data-testid="dd-funnel-indelivery"[\s\S]*?data-testid="dd-funnel-stuck"[\s\S]*?<\/div>\s*<\/div>\s*<div class="dd-fnl-step"/.test(html)
     && /class="dd-funnel-alerts"/.test(html));
check('IA53', 'they sit in their own needs-attention row',
  () => /dd-funnel-alerts[\s\S]{0,1400}data-testid="dd-funnel-stuck"/.test(html)
     && /dd-funnel-alerts[\s\S]{0,2200}data-testid="dd-funnel-idle"/.test(html));
check('IA54', 'the row says what population they span',
  () => /spans Initiated and Ongoing/.test(html));
check('IA55', 'the In-delivery step no longer contains a flag',
  () => !/dd-fnl-step--delivery[\s\S]{0,900}dd-fnl-flag/.test(html));

// --- stage mix: the pby bar re-homed into the Products row -----------------------
check('IA36', 'stage-mix bar present in the product row',
  () => /class="dd-stagemix"[\s\S]{0,200}data-testid="dd-stagemix"/.test(html));
check('IA37', 'it is one bar per product row, not a second panel',
  () => count(html, /class="dd-stagemix"/g) === 1 && !/dd-pby/.test(html));
for (const [id, stage] of [
  ['IA38', 'initiated'], ['IA39', 'awaiting'], ['IA40', 'started'],
  ['IA41', 'ongoing'], ['IA42', 'completed'],
]) {
  check(id, `stage-mix '${stage}' segment opens its list`,
    () => new RegExp(`dd-stagemix__seg[\\s\\S]{0,420}openCardFunnelModal\\(cardId, '${stage}'`).test(html));
}
check('IA43', 'all five segments are present',
  () => count(html, /dd-stagemix__seg/g) === 5);

// COMPLETENESS: the bar ADDS the shape, it must not have replaced the five figures.
for (const [id, stage] of [
  ['IA44', 'awaiting'], ['IA45', 'initiated'], ['IA46', 'started'],
  ['IA47', 'ongoing'], ['IA48', 'completed'],
]) {
  check(id, `the numeric '${stage}' pill still renders in the row`,
    () => new RegExp(`dd-fstep__pill[\\s\\S]{0,260}getCardFunnel\\(cardId\\)\\.${stage}`).test(html)
       || new RegExp(`getCardFunnel\\(cardId\\)\\.${stage}\\??\\.length[\\s\\S]{0,120}dd-fstep__lbl`).test(html));
}
check('IA49', 'stage colours are legended',
  () => /data-testid="dd-stagemix-legend"/.test(html)
     && ['s1', 's2', 's3', 's4', 's5'].every(c => new RegExp(`dd-mixleg__i"><i class="dd-bg-${c}"`).test(html)));
check('IA50', 'the bar is readable without sight or hover',
  () => /\[attr\.aria-label\]="stageMixLabel\(cardId\)"/.test(html)
     && /stageMixLabel\(cardId: string\): string \{/.test(ts));
check('IA51', 'an empty pipeline says so instead of showing a blank track',
  () => /dd-stagemix__empty[\s\S]{0,120}getCardPipelineTotal\(cardId\) === 0/.test(html));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
