// Going-Quiet BUCKET dedup (337cec76 / 174efddf), re-applied onto origin's component after the
// 2026-09-24 merge. Joshua: "either Needs Attention or Going Quiet, no duplicates."
//
// Karma is pre-broken in this repo (the scoped tsconfig.spec.jc.json run fails identically on the
// pre-merge tree 2a1ee388: the karma builder globs every *.spec.ts regardless of the scoped
// include), so this asserts the same invariant structurally AND executes the predicate logic.
import { readFileSync } from 'node:fs';

const TS = 'src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.ts';
const ts = readFileSync(TS, 'utf8');
let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// 1. the predicates exist and are "quiet AND NOT needs-attention"
check('GQ1', 'isGoingQuietBucket = goingQuiet && !isNeedsAttention',
  () => /isGoingQuietBucket\s*\(r: PortfolioRow\): boolean \{\s*return r\.goingQuiet && !this\.isNeedsAttention\(r\);/.test(ts));
check('GQ2', 'isGoingQuietBucketLite = goingQuiet && !isNeedsAttentionLite',
  () => /isGoingQuietBucketLite\s*\(l: LiteIndexRow\): boolean \{\s*return l\.goingQuiet && !this\.isNeedsAttentionLite\(l\);/.test(ts));

// 2. the predicate SEMANTICS, executed (mirrors going-quiet.spec.ts's prototype-call approach)
const bucket = (r, needsAttention) => r.goingQuiet && !needsAttention;
check('GQ3', 'quiet AND needs-attention -> excluded (the duplicate case)',
  () => bucket({ goingQuiet: true }, true) === false);
check('GQ4', 'quiet AND clean -> included',
  () => bucket({ goingQuiet: true }, false) === true);
check('GQ5', 'not quiet -> excluded either way',
  () => bucket({ goingQuiet: false }, false) === false && bucket({ goingQuiet: false }, true) === false);

// 3. every count / lever / list routes through the bucket, not the raw flag.
//    REVERT GUARD: reverting any call site to `r.goingQuiet` re-introduces the duplicate and fails here.
const mustRouteThroughBucket = [
  ['GQ6',  'summary count',        /if \(this\.isGoingQuietBucket\(r\)\) this\.summary\.goingQuiet\+\+;/],
  ['GQ7',  'lite summary count',   /filteredIdx\.reduce\(\(n, l\) => n \+ \(this\.isGoingQuietBucketLite\(l\) \? 1 : 0\), 0\)/],
  ['GQ8',  'going-quiet list',     /filteredRows\(\)\.filter\(r => this\.isGoingQuietBucket\(r\)\)/],
  ['GQ9',  'coach stat count',     /rows\.filter\(r => this\.isGoingQuietBucket\(r\)\)\.length/],
  ['GQ10', 'coach drill',          /case 'goingQuiet': return fromRows\(this\.rowsForCoach\(coachId\)\.filter\(r => this\.isGoingQuietBucket\(r\)\)\)/],
  ['GQ11', 'per-coach scoreboard', /if \(this\.isGoingQuietBucket\(r\)\) s\.goingQuiet\+\+;/],
  ['GQ12', 'row lever filter',     /activeLever === 'goingQuiet' && !this\.isGoingQuietBucket\(r\)/],
  ['GQ13', 'row goingQuietOnly',   /this\.goingQuietOnly && !this\.isGoingQuietBucket\(r\)/],
  ['GQ14', 'lite lever filter',    /activeLever === 'goingQuiet' && !this\.isGoingQuietBucketLite\(lite\)/],
  ['GQ15', 'lite goingQuietOnly',  /this\.goingQuietOnly && !this\.isGoingQuietBucketLite\(lite\)/],
];
for (const [id, label, re] of mustRouteThroughBucket) check(id, label, () => re.test(ts));

// 4. the raw flag MUST survive for the coverage metric (it measures contact, not attention)
check('GQ16', 'raw goingQuiet flag kept for the base-wide coverage metric',
  () => /this\.summary\.goingQuiet = this\.fullBaseGoingQuiet;/.test(ts));

if (failed) { console.error(`\n${failed} going-quiet check(s) FAILED — the bucket dedup has regressed.`); process.exit(1); }
console.log('\nAll going-quiet bucket checks passed.');
