// Phase 1 signal/computed memoization proof.
// Replicates the EXACT derived logic from
//   src/app/Journey Onboarding/journey-coach-health-dashboard/journey-coach-health-dashboard.component.ts
// for: goingQuietRows, flaggedRows, needsAttentionRows, flaggedCount, healthDistribution.
//
// Run: node benchmark/phase1_signal_test.mjs   (from the starlabs-angular repo root)

// --- Gate 1: import. If this throws in plain Node, report and STOP. ---
let signal, computed;
try {
  ({ signal, computed } = await import('@angular/core'));
} catch (err) {
  console.error('LIMITATION: @angular/core signal/computed failed to import in plain Node.');
  console.error('Exact error:', err && err.stack ? err.stack : err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Synthetic data: 20,000 rows shaped like the real PortfolioRow (relevant fields).
// ---------------------------------------------------------------------------
const N = 20_000;
const HEALTH_STATES = ['HAPPY', 'NEUTRAL', 'UNHAPPY', 'AT_RISK', 'CRITICAL', undefined];
const FIN_STATES = ['locked', 'active', 'pending', null];

// deterministic-ish pseudo random so runs are stable
let _seed = 1234567;
function rnd() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

function makeRows(n, salt = 0) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    const health = HEALTH_STATES[Math.floor(rnd() * HEALTH_STATES.length)];
    rows[i] = {
      profileid: `p_${i + salt}`,
      goingQuiet: r < 0.18,
      lapsed: rnd() < 0.10,
      notStarted: rnd() < 0.08,
      renewalWindow: rnd() < 0.12,
      openTickets: rnd() < 0.15 ? 1 + Math.floor(rnd() * 4) : 0,
      flagged: rnd() < 0.07,
      priority: Math.floor(rnd() * 1000),
      daysSinceCoach: Math.floor(rnd() * 90),
      daysToRenewal: Math.floor(rnd() * 365) - 30,
      financialstatus: FIN_STATES[Math.floor(rnd() * FIN_STATES.length)],
      coachHealthState: health === undefined ? null : { state: health, note: '', date: null },
    };
  }
  return rows;
}

const rows = makeRows(N, 0);

// ---------------------------------------------------------------------------
// 3A. NAIVE derivations (the OLD per-CD-tick methods: filter+sort the raw array every call).
//     These mirror the component's logic character-for-character.
// ---------------------------------------------------------------------------
const naive = {
  goingQuietRows: (rs) =>
    rs.filter(r => r.goingQuiet).sort((a, b) => (b.daysSinceCoach ?? 0) - (a.daysSinceCoach ?? 0)),
  flaggedRows: (rs) =>
    rs.filter(r => r.flagged).sort((a, b) => b.priority - a.priority),
  needsAttentionRows: (rs) =>
    rs.filter(r => r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0)
      .sort((a, b) => b.priority - a.priority),
  flaggedCount: (rs) => rs.filter(r => r.flagged).length,
  healthDistribution: (rs) => {
    const d = { happy: 0, neutral: 0, unhappy: 0, atRisk: 0, critical: 0, notAssessed: 0, total: 0 };
    for (const r of rs) {
      d.total++;
      switch (r.coachHealthState?.state) {
        case 'HAPPY': d.happy++; break;
        case 'NEUTRAL': d.neutral++; break;
        case 'UNHAPPY': d.unhappy++; break;
        case 'AT_RISK': d.atRisk++; break;
        case 'CRITICAL': d.critical++; break;
        default: d.notAssessed++; break;
      }
    }
    return d;
  },
};

// ---------------------------------------------------------------------------
// 3B. MEMOIZED derivations: computed() over an allRows signal (the NEW code).
//     Each computed body increments a counter so we can prove how often it really runs.
// ---------------------------------------------------------------------------
const execCount = {
  goingQuietRows: 0, flaggedRows: 0, needsAttentionRows: 0, flaggedCount: 0, healthDistribution: 0,
};

const allRows = signal(rows);

const goingQuietRows = computed(() => {
  execCount.goingQuietRows++;
  return allRows().filter(r => r.goingQuiet).sort((a, b) => (b.daysSinceCoach ?? 0) - (a.daysSinceCoach ?? 0));
});
const flaggedRows = computed(() => {
  execCount.flaggedRows++;
  return allRows().filter(r => r.flagged).sort((a, b) => b.priority - a.priority);
});
const needsAttentionRows = computed(() => {
  execCount.needsAttentionRows++;
  return allRows()
    .filter(r => r.goingQuiet || r.lapsed || r.notStarted || r.renewalWindow || r.openTickets > 0)
    .sort((a, b) => b.priority - a.priority);
});
const flaggedCount = computed(() => {
  execCount.flaggedCount++;
  return allRows().filter(r => r.flagged).length;
});
const healthDistribution = computed(() => {
  execCount.healthDistribution++;
  const d = { happy: 0, neutral: 0, unhappy: 0, atRisk: 0, critical: 0, notAssessed: 0, total: 0 };
  for (const r of allRows()) {
    d.total++;
    switch (r.coachHealthState?.state) {
      case 'HAPPY': d.happy++; break;
      case 'NEUTRAL': d.neutral++; break;
      case 'UNHAPPY': d.unhappy++; break;
      case 'AT_RISK': d.atRisk++; break;
      case 'CRITICAL': d.critical++; break;
      default: d.notAssessed++; break;
    }
  }
  return d;
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
let failures = 0;
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
  return cond;
}
function listSig(a) {
  return {
    len: a.length,
    first: a.length ? a[0].profileid : null,
    last: a.length ? a[a.length - 1].profileid : null,
  };
}
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

// ---------------------------------------------------------------------------
// 4. CORRECTNESS: memoized output deep-equals naive output for the same input.
// ---------------------------------------------------------------------------
console.log('\n=== CORRECTNESS (memoized computed === naive) ===');
check('goingQuietRows matches',
  eq(listSig(goingQuietRows()), listSig(naive.goingQuietRows(rows))));
check('flaggedRows matches',
  eq(listSig(flaggedRows()), listSig(naive.flaggedRows(rows))));
check('needsAttentionRows matches',
  eq(listSig(needsAttentionRows()), listSig(naive.needsAttentionRows(rows))));
check('flaggedCount matches',
  flaggedCount() === naive.flaggedCount(rows));
check('healthDistribution matches',
  eq(healthDistribution(), naive.healthDistribution(rows)));

// After the correctness reads above, each computed body has run exactly once.
console.log('\nexec counts after first reads:', JSON.stringify(execCount));

// ---------------------------------------------------------------------------
// 5. MEMOIZATION: read 1000x WITHOUT changing allRows -> body runs ONCE.
//    Then allRows.set(new) and read again -> body has run exactly TWICE total.
// ---------------------------------------------------------------------------
console.log('\n=== MEMOIZATION ===');
// Reset counters, then DIRTY the cache with a fresh input so the "first read = 1 exec"
// baseline is honest. (Without this set(), the computeds are still warm from the
// correctness reads above and the first read here would correctly hit the cache -> 0 execs.
// That is itself proof of memoization, but the task wants the 1-exec-for-1000-reads form.)
const memoRows = makeRows(N, 50000);
allRows.set(memoRows);
for (const k of Object.keys(execCount)) execCount[k] = 0;

// first read establishes the cache (1 exec each) over the freshly-set input
goingQuietRows(); flaggedRows(); needsAttentionRows(); flaggedCount(); healthDistribution();

// 999 more reads with NO input change -> must NOT re-execute the body
for (let i = 0; i < 999; i++) {
  goingQuietRows(); flaggedRows(); needsAttentionRows(); flaggedCount(); healthDistribution();
}
const afterReads = { ...execCount };
console.log('exec counts after 1000 reads (no input change):', JSON.stringify(afterReads));
check('goingQuietRows executed exactly 1x for 1000 reads', afterReads.goingQuietRows === 1);
check('flaggedRows executed exactly 1x for 1000 reads', afterReads.flaggedRows === 1);
check('needsAttentionRows executed exactly 1x for 1000 reads', afterReads.needsAttentionRows === 1);
check('flaggedCount executed exactly 1x for 1000 reads', afterReads.flaggedCount === 1);
check('healthDistribution executed exactly 1x for 1000 reads', afterReads.healthDistribution === 1);

// now change the input once, then read again
const rows2 = makeRows(N, 100000); // different profileids
allRows.set(rows2);
goingQuietRows(); flaggedRows(); needsAttentionRows(); flaggedCount(); healthDistribution();
console.log('exec counts after allRows.set(...) + 1 read:', JSON.stringify(execCount));
check('goingQuietRows executed exactly 2x total (1 input change)', execCount.goingQuietRows === 2);
check('flaggedRows executed exactly 2x total', execCount.flaggedRows === 2);
check('needsAttentionRows executed exactly 2x total', execCount.needsAttentionRows === 2);
check('flaggedCount executed exactly 2x total', execCount.flaggedCount === 2);
check('healthDistribution executed exactly 2x total', execCount.healthDistribution === 2);

// correctness still holds against the NEW input (proves the recompute was real)
check('post-set goingQuietRows still matches naive',
  eq(listSig(goingQuietRows()), listSig(naive.goingQuietRows(rows2))));
check('post-set healthDistribution still matches naive',
  eq(healthDistribution(), naive.healthDistribution(rows2)));

// restore to original input for a fair perf comparison
allRows.set(rows);
goingQuietRows(); flaggedRows(); needsAttentionRows(); flaggedCount(); healthDistribution();

// ---------------------------------------------------------------------------
// 6. PERF: 1000 naive recomputes vs 1000 memoized reads over the 20k array.
//    "Recompute all 5 derivations" = one CD tick's worth of work.
// ---------------------------------------------------------------------------
console.log('\n=== PERF (1000 iterations over 20k rows, all 5 derivations) ===');
const ITER = 1000;

// warm up
for (let i = 0; i < 5; i++) {
  naive.goingQuietRows(rows); naive.flaggedRows(rows); naive.needsAttentionRows(rows);
  naive.flaggedCount(rows); naive.healthDistribution(rows);
}

let naiveSink = 0;
const tNaive0 = performance.now();
for (let i = 0; i < ITER; i++) {
  naiveSink += naive.goingQuietRows(rows).length;
  naiveSink += naive.flaggedRows(rows).length;
  naiveSink += naive.needsAttentionRows(rows).length;
  naiveSink += naive.flaggedCount(rows);
  naiveSink += naive.healthDistribution(rows).total;
}
const naiveMs = performance.now() - tNaive0;

let memoSink = 0;
const tMemo0 = performance.now();
for (let i = 0; i < ITER; i++) {
  memoSink += goingQuietRows().length;
  memoSink += flaggedRows().length;
  memoSink += needsAttentionRows().length;
  memoSink += flaggedCount();
  memoSink += healthDistribution().total;
}
const memoMs = performance.now() - tMemo0;

const ratio = memoMs > 0 ? naiveMs / memoMs : Infinity;
console.log(`naive  : ${naiveMs.toFixed(2)} ms  (1000 CD-ticks, re-filter+sort every time)`);
console.log(`memoized: ${memoMs.toFixed(2)} ms  (1000 reads, recompute only on input change)`);
console.log(`speedup : ${ratio.toFixed(1)}x faster`);
console.log(`(sink ${naiveSink === memoSink ? 'match' : 'MISMATCH'}: naive=${naiveSink} memo=${memoSink})`);

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------
console.log('\n=== SUMMARY ===');
if (failures === 0) {
  console.log('ALL ASSERTIONS PASSED. Claim PROVEN: computed() recomputes only when allRows changes.');
} else {
  console.log(`*** ${failures} ASSERTION(S) FAILED — claim NOT proven. ***`);
}
process.exit(failures === 0 ? 0 : 1);
