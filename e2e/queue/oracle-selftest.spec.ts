// @ts-nocheck
// TEST-THE-TEST: prove the detectors actually fire, so the suite is not vacuously green.
// If these go red, the oracle/invariants have stopped catching real breakage.
import { test, expect } from '@playwright/test';
const cfg = require('../fixtures/sample-queue-config.json');
const { oracle, build } = require('../lib/flow-model');
const clone = () => JSON.parse(JSON.stringify(cfg));

test.describe('Oracle self-test (the suite can detect breakage)', { tag: '@oracle' }, () => {
  test('healthy config: oracle returns the known real issues only (2 documented orphans)', () => {
    const o = oracle(cfg);
    // baseline: matches validated spec §8 — 2 orphans, no dangling
    expect(o.dangling.length).toBe(0);
    expect(o.orphans.sort()).toEqual(['My Evolution Wishlist', 'uP! Prep Process - Hold'].sort());
  });

  test('detects a DANGLING nextstage edge (broken routing) → not ok', () => {
    const broken = clone();
    const s = broken.stages[5];
    broken.stageproperty[s].nextstage = [
      { stage: '__NONEXISTENT_STAGE__', calltoaction: 'go', markascompleted: false, variations: [] },
    ];
    const o = oracle(broken);
    expect(o.ok).toBe(false);
    expect(o.dangling.some(d => d.to === '__NONEXISTENT_STAGE__')).toBe(true);
  });

  test('detects a NEW orphan stage (added but unrouted) → flagged', () => {
    const broken = clone();
    broken.stages.push('__FLOATING_STAGE__');
    broken.stageproperty['__FLOATING_STAGE__'] = { nextstage: [], selfmovable: false, studiowidgets: [] };
    const o = oracle(broken);
    expect(o.orphans).toContain('__FLOATING_STAGE__');
  });

  test('detects a variation that cannot reach a terminal (cycle with no exit)', () => {
    const broken = clone();
    const v = broken.queuevariation.find(x => (x.stages || []).length >= 3);
    // make every stage in the variation route back to its first stage → no terminal
    const first = v.stages[0];
    v.stages.forEach(st => {
      broken.stageproperty[st] = broken.stageproperty[st] || { nextstage: [] };
      broken.stageproperty[st].nextstage = [{ stage: first, calltoaction: 'loop', markascompleted: false, variations: [v.id] }];
    });
    const o = oracle(broken);
    expect(o.unreachableTerminals.length).toBeGreaterThan(0);
  });
});
