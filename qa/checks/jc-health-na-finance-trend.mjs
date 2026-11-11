// Journey Coach Health -> Needs attention / payments / daily trend (item 6).
// (1) Payments locked + defaulted leave Needs attention; (2) Participants tiles get a Payment defaulted tile and literal
// testids; NA tooltip fixed; paged NA count excludes addressed like the list; (3) daily snapshot + 14-day trend + new
// since yesterday. Predicates and the sparkline are executed (methods transpiled with the repo's TypeScript).
// Revert the change and these assertions go RED.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const src = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');
const spec = readFileSync(D + 'journey-coach-health-dashboard.needs-attention.spec.ts', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const method = (name) => { const i = src.search(new RegExp(`\\n  (private |async |private async )?${name}\\(`)); return i < 0 ? '' : src.slice(i + 1, src.indexOf('\n  }\n', i) + 4); };
const strip = (m) => m.replace(/^  (private |async |private async )/, '  ');
let X = null;
const parts = ['isNeedsAttention', 'isNeedsAttentionLite', 'activeIssues', 'sparkPoints'].map(method);
if (parts.every(Boolean)) {
  const js = ts.transpileModule(`export class X { ${parts.map(strip).join('\n')} }`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  X = new ((await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).X)();
}
const clean = { lapsed: false, notStarted: false, openTickets: 0, llCritical: false, llAttention: false, financialstatus: 'active' };
const strip0 = (() => { const i = html.indexOf('<section class="ios-mini-summary"'); return i < 0 ? '' : html.slice(i, html.indexOf('</section>', i)); })();

check('NF1', 'locked / defaulted no longer trigger Needs attention (row + lite predicates)',
  () => !X.isNeedsAttention({ ...clean, financialstatus: 'Locked' }) && !X.isNeedsAttention({ ...clean, financialstatus: 'DEFAULTED' })
     && !X.isNeedsAttentionLite({ ...clean, financialstatus: 'locked' }) && !X.isNeedsAttentionLite({ ...clean, financialstatus: 'defaulted' })
     && X.isNeedsAttention({ ...clean, openTickets: 1 }) && X.isNeedsAttentionLite({ ...clean, lapsed: true }));
check('NF2', "activeIssues has no 'financial' key; naReasonsFor has no payment reasons",
  () => X.activeIssues({ ...clean, financialstatus: 'locked' }).length === 0 && !/financial/.test(method('activeIssues'))
     && !/Payments locked|Payments defaulted/.test(method('naReasonsFor')));
check('NF3', 'spec updated: finance statuses are NOT needs-attention',
  () => /does NOT flag any finance status/.test(spec) && /financialstatus: 'Locked' \}\)\)\.toBeFalsy\(\)/.test(spec));
check('NF4', 'Summary hero finance chips stay (Defaulted / Payments locked)',
  () => /data-testid="jchd-hero-defaulted"/.test(html) && /data-testid="jchd-hero-locked"/.test(html));
check('NF5', 'Participants tiles: literal testids on all seven, in order, Payment defaulted right after Payments locked',
  () => { const o = ['jchd-mc-needs', 'jchd-mc-quiet', 'jchd-mc-locked', 'jchd-mc-defaulted', 'jchd-mc-renewing', 'jchd-mc-tickets', 'jchd-mc-flagged']
            .map(t => strip0.indexOf(`data-testid="${t}"`));
          return o.every((v, i) => v > 0 && (i === 0 || v > o[i - 1])); });
check('NF6', 'Payment defaulted tile: count = summary.defaulted, click = goToDefaulted() (toggle clears)',
  () => /data-testid="jchd-mc-defaulted" \[class\.is-on\]="financeFilters\.includes\('defaulted'\)"\s*\(click\)="financeFilters\.includes\('defaulted'\) \? clearFilters\(\) : goToDefaulted\(\)"/.test(strip0)
     && /Payment defaulted<\/span>\s*<span class="mc-num">\{\{ summary\.defaulted \}\}<\/span>/.test(strip0));
check('NF7', 'Needs Attention tooltip matches the rule (no going quiet / renewing / payments)',
  () => { const m = /data-testid="jchd-mc-needs"[\s\S]*?matTooltip="([^"]*)"/.exec(strip0); const t = m ? m[1] : '';
          return /Lapsed/.test(t) && /open tickets/.test(t) && /addressed/i.test(t) && !/Going quiet|renewing|payment/i.test(t); });
check('NF8', 'paged mode: NA count and matched set exclude addressed (count == list)',
  () => /this\.isNeedsAttentionLite\(l\) && !this\.isAddressedLite\(l\) \? 1 : 0/.test(src)
     && /if \(this\.isNeedsAttentionLite\(lite\) && !this\.isAddressedLite\(lite\)\) na\+\+;/.test(src)
     && /\(!this\.isNeedsAttentionLite\(lite\) \|\| this\.isAddressedLite\(lite\)\)\) return false;/.test(src)
     && /return this\.addressedCovers\(l\.profileid, this\.activeIssues\(l\)\);/.test(method('isAddressedLite')));
check('NF9', 'snapshot: deterministic setDoc snap_${scope}_${YYYY-MM-DD} into healthtracker_activity, no profileid / names',
  () => { const m = method('ensureDailySnapshot');
          return /setDoc\(doc\(this\.firestore, 'healthtracker_activity', `snap_\$\{scope\}_\$\{today\}`\), \{/.test(m)
            && /type: 'daily_snapshot', scope, date: today, counts,\s*needsAttentionIds: cur\.na, goingQuietIds: cur\.gq, timestamp: serverTimestamp\(\),/.test(m)
            && !/profileid|actorName|name:/.test(m.slice(m.indexOf('await setDoc'), m.indexOf('list.push({ date: today'))); });
check('NF10', 'snapshot: written only when today\'s is missing and the summary filter is default; scope = coach or ALL',
  () => /if \(!list\.some\(x => x\.date === today\) && this\.trendFilterDefault\(\)\)/.test(method('ensureDailySnapshot'))
     && /return this\.selectedCoachId === this\.ALL \? 'ALL' : this\.selectedCoachId;/.test(method('snapScope'))
     && /this\.sumLifecycle\(\) === 'active' && this\.sumJourneys\(\)\.size === 0/.test(method('trendFilterDefault')));
check('NF11', 'last 14 read by id (documentId in, no composite index)',
  () => /Array\.from\(\{ length: 14 \}, \(_, i\) => `snap_\$\{scope\}_\$\{this\.isoDay\(this\.dayOffset\(-i\)\)\}`\)/.test(method('ensureDailySnapshot'))
     && /where\(documentId\(\), 'in', ids\)/.test(method('ensureDailySnapshot')));
check('NF12', 'nothing shows before yesterday\'s snapshot exists (trend null)',
  () => /if \(!s \|\| !yday \|\| this\.trendDataScope !== scope \|\| !this\.trendFilterDefault\(\)\) \{\s*if \(this\.trend\(\)\) this\.trend\.set\(null\);/.test(method('refreshTrend'))
     && /<span class="jchd-trend" \*ngIf="trendFor\(k\) as t"/.test(html));
check('NF13', 'snapshot counts == tile counts (same sets: NA rows / GQ rows / summary locked / defaulted)',
  () => /return \{ needsAttention: ids\.na\.length, goingQuiet: ids\.gq\.length, paymentsLocked: this\.summary\.paymentsLocked, defaulted: this\.summary\.defaulted \};/.test(method('liveTrendCounts'))
     && /na: this\.needsAttentionRows\(\)\.map\(r => r\.profileid\), gq: this\.goingQuietRows\(\)\.map\(r => r\.profileid\)/.test(method('currentTrendIds')));
check('NF14', 'new since yesterday = today\'s set minus yesterday\'s ids; rows highlighted in the opened list',
  () => /naNew: new Set\(cur\.na\.filter\(id => !yNa\.has\(id\)\)\), gqNew: new Set\(cur\.gq\.filter\(id => !yGq\.has\(id\)\)\)/.test(method('refreshTrend'))
     && /\[class\.jchd-row-new\]="isNewRow\(row\)"/.test(html) && /data-testid="jchd-row-new"/.test(html)
     && /if \(this\.activeLever === 'needsAttention'\) return t\.naNew\.has\(r\.profileid\);/.test(method('isNewRow')));
check('NF15', '+N new on Needs attention and Going quiet, both views (literal hooks)',
  () => ['jchd-new-na', 'jchd-new-gq', 'jchd-mc-new-na', 'jchd-mc-new-gq'].every(t => html.includes(`data-testid="${t}"`)));
check('NF16', 'delta + sparkline on all four tiles in both views',
  () => ['needsAttention', 'goingQuiet', 'paymentsLocked', 'defaulted']
      .every(k => (html.match(new RegExp(`\\*ngTemplateOutlet="trendTpl; context: \\{ k: '${k}' \\}"`, 'g')) || []).length === 2));
check('NF17', 'sparkline points: 14-day slots, flat series handled, min at bottom / max at top',
  () => X.sparkPoints([{ i: 0, v: 2 }, { i: 13, v: 5 }]) === '0,13.0 52,1.0' && X.sparkPoints([{ i: 12, v: 3 }, { i: 13, v: 3 }]) === '48,13.0 52,13.0');
check('NF18', 'snapshot taken only after every tile input lands (paged: tickets + contact + A&H; full: exact tickets)',
  () => /void Promise\.all\(\[exactP, attnP, llP\]\)\.then\(\(\) => this\.ensureDailySnapshot\(\)\)/.test(src)
     && /void exactP\.then\(\(\) => this\.ensureDailySnapshot\(\)\)/.test(method('loadFullPortfolio')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
