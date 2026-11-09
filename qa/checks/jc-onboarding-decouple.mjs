// Onboarding intake decoupled from the salescrm gate.
//
// The coach intake funnel (journey-coach Sources) reads the MAIN starlabs Firestore and must render
// even when salescrm is unconfigured or access is denied. Only a genuine (non-salescrm) init failure
// — fatalError — may blank the whole screen; a salescrm denial shows an inline notice in the pipelines
// section while the funnel stays usable. Revert the decouple (gate the screen on accessDenied again)
// and these assertions go RED.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/onboarding-pipeline/';
const ts = readFileSync(D + 'onboarding-pipeline.component.ts', 'utf8');
const html = readFileSync(D + 'onboarding-pipeline.component.html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

// ngOnInit loads the intake BEFORE (and independent of) the salescrm config check.
const init = ts.match(/async ngOnInit\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? '';
const idxLoad = init.indexOf('this.loadSourceBuckets()');
const idxCfg = init.indexOf("['salescrm']");
check('OB1', 'ngOnInit calls loadSourceBuckets()', () => idxLoad >= 0);
check('OB2', 'intake loads before the salescrm config gate', () => idxLoad >= 0 && idxCfg >= 0 && idxLoad < idxCfg);
check('OB3', 'a separate fatalError flag exists', () => /fatalError\s*:\s*boolean/.test(ts));
check('OB4', 'only a fatal error blanks the whole screen', () => /\*ngIf="!loading && fatalError"/.test(html));
check('OB5', 'content/listing is NOT gated on accessDenied', () => /\*ngIf="!loading && !fatalError && !selectedPipeline"/.test(html));
check('OB6', 'pipelines list is gated on !accessDenied', () => /<section class="op-pipelines" \*ngIf="!accessDenied">/.test(html));
check('OB7', 'salescrm denial shows an inline notice (not a full-screen block)', () => /op-pipelines--notice" \*ngIf="accessDenied"/.test(html));
check('OB8', 'intake Sources section is present and ungated by salescrm', () => /class="op-sources"/.test(html) && !/op-sources[^>]*accessDenied/.test(html));

console.log(failed ? `\n${failed} FAIL` : '\nALL PASS');
process.exit(failed ? 1 : 0);
