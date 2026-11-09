// Finance-collapse: the two standalone KPI tiles (Defaulted, Payments locked) are folded into the
// Needs-attention hero as a finance breakdown. This is a RELOCATION, not a removal — both chips stay
// clickable and keep their original drills (goToDefaulted / goToPaymentsLocked). Revert the change
// (restore the tiles, drop the chips) and these assertions go RED.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');
const css = readFileSync(D + 'journey-coach-health-dashboard.component.css', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// Isolate the hero column (from the wrapper open to the status-band section) so we can assert the
// chips live INSIDE the hero, not merely somewhere on the page.
const heroCol = html.match(/<div class="ios2-hero-col">([\s\S]*?)<section class="ios2-card jchd-status-band">/)?.[1] ?? '';

check('FC1', 'hero has a finance breakdown row', () => /class="ios2-hero-finance"[^>]*data-testid="jchd-hero-finance"/.test(heroCol));
check('FC2', 'Defaulted chip is in the hero and drills via goToDefaulted()',
  () => /data-testid="jchd-hero-defaulted"/.test(heroCol) && /\(click\)="goToDefaulted\(\)"/.test(heroCol));
check('FC3', 'Payments-locked chip is in the hero and drills via goToPaymentsLocked()',
  () => /data-testid="jchd-hero-locked"/.test(heroCol) && /\(click\)="goToPaymentsLocked\(\)"/.test(heroCol));
check('FC4', 'the chips still show the live counts (relocated, not stubbed)',
  () => /summary\.defaulted/.test(heroCol) && /summary\.paymentsLocked/.test(heroCol));

// The standalone tiles must be gone from the KPI tile row.
check('FC5', 'no standalone ios2-tile calls goToDefaulted()', () => !/class="ios2-tile"[^>]*\(click\)="goToDefaulted\(\)"/.test(html));
check('FC6', 'no standalone ios2-tile calls goToPaymentsLocked()', () => !/class="ios2-tile"[^>]*\(click\)="goToPaymentsLocked\(\)"/.test(html));

// Completeness: the drills themselves were NOT deleted — each is still wired somewhere
// (the hero chip, plus the pre-existing Participants-view finance filter card, which we did not touch).
check('FC7', 'goToDefaulted() still referenced (drill preserved)', () => /goToDefaulted\(\)/.test(html));
check('FC8', 'goToPaymentsLocked() still referenced (drill preserved)', () => /goToPaymentsLocked\(\)/.test(html));

// The tile grid was tightened to the 5 remaining tiles so the row has no empty columns.
check('FC9', 'tile grid is repeat(5)', () => /\.ios2-tiles\s*\{[^}]*repeat\(5,/.test(css));
check('FC10', 'finance chip styles exist', () => /\.ios2-fin-chip\s*\{/.test(css) && /\.ios2-hero-finance\s*\{/.test(css));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
