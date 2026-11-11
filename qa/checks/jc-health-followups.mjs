// Journey Coach Health -> scheduled follow-ups made visible (item 5): row chip, slide-over Follow-ups with Mark done,
// Journey Planning Schedule card Follow-ups (Today / Next 7 days / Overdue). Bucketing is executed for real
// (methods transpiled with the repo's TypeScript); the rest is read from source. Revert the change and these go RED.
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const src = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');
const so = readFileSync(D + 'participant-slideover.component.ts', 'utf8');
const types = readFileSync(D + 'coach-health.types.ts', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const method = (s, name) => { const i = s.search(new RegExp(`\\n  (private |async |private async )?${name}\\(`)); return i < 0 ? '' : s.slice(i + 1, s.indexOf('\n  }\n', i) + 4); };
const fuCard = (() => { const i = html.indexOf('data-testid="sched-fu"'); return i < 0 ? '' : html.slice(i, html.indexOf('<ng-template #noFu>', i)); })();
const planning = html.slice(html.indexOf('<ng-container *ngIf="experienceTab === \'planning\'">'), html.indexOf('<!-- ═══ end Journey Planning tab ═══ -->'));

let B = null;
const b = method(src, 'fuBucketOf');
if (b) {
  const js = ts.transpileModule(`export class B { startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); } ${b.replace(/^  private /, '  ')} }`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  B = (await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).B;
}
const t0 = new Date(); const day = (n) => new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + n).getTime();

check('FU1', 'buckets: yesterday = overdue, today = today, +1..+7 = next 7 days, +8 = none',
  () => { const x = new B(); return x.fuBucketOf(day(-1)) === 'overdue' && x.fuBucketOf(day(0)) === 'today'
            && x.fuBucketOf(day(1)) === 'week' && x.fuBucketOf(day(7)) === 'week' && x.fuBucketOf(day(8)) === null; });
check('FU2', 'load: specific coach = roster chunks, profileid in + type == (equality only, no orderBy)',
  () => { const m = method(src, 'loadFollowUps');
          return /this\.chunk30\(ids\)\.flatMap\(c => \[/.test(m)
            && /where\('profileid', 'in', c\), where\('type', '==', 'schedule'\)/.test(m)
            && /where\('profileid', 'in', c\), where\('type', '==', 'schedule_done'\)/.test(m) && !/orderBy\(/.test(m); });
check('FU3', 'load: ALL / UNASSIGNED = the two type == equality reads (loadAddressed shape), once',
  () => { const m = method(src, 'loadFollowUps');
          return /if \(this\.pagedMode\) \{\s*if \(this\.fuAllLoaded\) return;/.test(m)
            && /getDocs\(query\(coll, where\('type', '==', 'schedule'\)\)\)/.test(m) && /getDocs\(query\(coll, where\('type', '==', 'schedule_done'\)\)\)/.test(m); });
check('FU4', 'open = schedule docs without a schedule_done(scheduleId)',
  () => /if \(done\[f\.id\]\) continue;/.test(src) && /done\[x\['scheduleId'\]\] = true/.test(method(src, 'loadFollowUps')));
check('FU5', 'loaded on first paint and on every Viewing change',
  () => /void this\.loadFollowUps\(\);/.test(method(src, 'onCoachChange')) && /await this\.loadPortfolio\(\);[\s\S]{0,200}void this\.loadFollowUps\(\);/.test(src));
check('FU6', 'participants table: literal jchd-row-due chip, red when overdue',
  () => /<span class="jchd-due" \*ngIf="rowDue\(r\.profileid\) as due" \[class\.is-overdue\]="due\.overdue" data-testid="jchd-row-due"/.test(html)
     && /return this\.fuDueMap\(\)\[profileid\] \?\? null;/.test(method(src, 'rowDue'))
     && /private fuDueMap = computed\(\(\) => \{[\s\S]*?overdue: f\.dueMs < today/.test(src));
check('FU7', 'slide-over: Follow-ups list in the Events/Upcoming section, Mark done button, literal hooks',
  () => { const i = so.indexOf('No upcoming events.'); const seg = so.slice(i, i + 2000);
          return i > 0 && /<p class="so-group-label">Follow-ups<\/p>/.test(seg) && /data-testid="so-fu-list"/.test(seg)
            && /data-testid="so-fu-done" \[disabled\]="fuBusy\.has\(f\.id\)" \(click\)="markFollowUpDone\(f\.id\)">Mark done/.test(seg)
            && /data-testid="so-fu-empty">No open follow-ups\./.test(seg); });
check('FU8', 'slide-over list is live (callback) and wired to the dashboard write',
  () => /followUps: \(\) => this\.slideoverFollowUps\(row\.profileid\)/.test(src)
     && /onFollowUpDone: \(scheduleId: string\) => this\.markFollowUpDone\(row\.profileid, scheduleId\)/.test(src)
     && /followUpList\(\): SlideoverFollowUp\[\] \{ return this\.data\.followUps\?\.\(\) \?\? \[\]; \}/.test(so));
check('FU9', 'Mark done writes an additive schedule_done {scheduleId} activity (actor + timestamp via logActivity)',
  () => /await this\.logActivity\(profileid, 'schedule_done', \{ scheduleId \}\);/.test(method(src, 'markFollowUpDone'))
     && /this\.fuDone\.update\(m => \(\{ \.\.\.m, \[scheduleId\]: true \}\)\)/.test(method(src, 'markFollowUpDone'))
     && /'schedule_done'/.test(types) && /actorUid: this\.actorUid,\s*actorName: this\.coachName,\s*timestamp: serverTimestamp\(\)/.test(method(src, 'logActivity')));
check('FU10', 'new follow-up appears without reload: writeSchedule registers the saved doc id',
  () => /const ref: any = await this\.logActivity\(row\.profileid, 'schedule',/.test(method(src, 'writeSchedule'))
     && /if \(ref\?\.id\) this\.fuSched\.update\(m => \(\{ \.\.\.m, \[ref\.id\]:/.test(method(src, 'writeSchedule')));
check('FU11', 'Schedule card (Journey Planning): Follow-ups Today / Next 7 / Overdue tiles filter the list (toggle)',
  () => planning.includes('data-testid="sched-fu"')
     && /data-testid="sched-fu-today" \[class\.is-on\]="fuBucket\(\)==='today'" \(click\)="setFuBucket\('today'\)"[^>]*><span class="jcp-num">\{\{ fc\.today \}\}/.test(fuCard)
     && /data-testid="sched-fu-week" \[class\.is-on\]="fuBucket\(\)==='week'" \(click\)="setFuBucket\('week'\)"[^>]*><span class="jcp-num">\{\{ fc\.week \}\}/.test(fuCard)
     && /data-testid="sched-fu-overdue" \[class\.is-on\]="fuBucket\(\)==='overdue'" \(click\)="setFuBucket\('overdue'\)"[^>]*><span class="jcp-num">\{\{ fc\.overdue \}\}/.test(fuCard)
     && /this\.fuBucket\.set\(this\.fuBucket\(\) === b \? 'all' : b\)/.test(method(src, 'setFuBucket')));
check('FU12', 'tile == list: counts and list share fuInScope + fuBucketOf; Viewing scope = rosterIds',
  () => /for \(const f of this\.fuInScope\(\)\) \{ const b = this\.fuBucketOf\(f\.dueMs!\); if \(b\) c\[b\]\+\+; \}/.test(method(src, 'fuCounts'))
     && /\(\) => this\.fuInScope\(\)\s*\.map\(f => \(\{ f, b: this\.fuBucketOf\(f\.dueMs!\) \}\)\)\s*\.filter\(x => x\.b != null && \(sel === 'all' \|\| x\.b === sel\)\)/.test(method(src, 'fuList'))
     && /const inScope = new Set\(this\.rosterIds\(\)\);/.test(method(src, 'fuInScope')));
check('FU13', 'completeness: the JC and Onboarding schedule columns are unchanged and still disjoint',
  () => planning.includes('data-testid="sched-jc-col"') && planning.includes('data-testid="sched-ob-col"')
     && /if \(\(e\.onboarding === true\) !== onboarding\) continue;/.test(method(src, 'schedCounts')));

check('FU14', 'template lists keep identity between checks (memoized), so *ngFor does not rebuild rows every cycle',
  () => /return this\.memo\('fuCounts', this\.fuKey\(\),/.test(method(src, 'fuCounts'))
     && /return this\.memo\('fuList', \[\.\.\.this\.fuKey\(\), sel\],/.test(method(src, 'fuList'))
     && /return this\.memo\('so-fu', \[profileid, this\.fuByProfile\(\), today\],/.test(method(src, 'slideoverFollowUps')));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
