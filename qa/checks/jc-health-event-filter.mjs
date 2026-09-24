// Event confirmation filter (2a1ee388), re-applied onto origin's component after the 2026-09-24
// merge. Filters the Participants table by the status of each participant's most recent event
// request (Approved / Requested).
//
// Invariant that matters: changing the control must change the table — a filter that is declared
// but never consulted by the row predicate is a silent no-op, the failure class the gate exists for.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/journey-coach-health-dashboard/';
const ts = readFileSync(D + 'journey-coach-health-dashboard.component.ts', 'utf8');
const html = readFileSync(D + 'journey-coach-health-dashboard.component.html', 'utf8');

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};

check('EF1', 'eventStatusFilters state exists', () => /eventStatusFilters: string\[\] = \[\];/.test(ts));
check('EF2', 'options are exactly Approved / Requested',
  () => /\{ value: 'approved', label: 'Approved' \}/.test(ts) && /\{ value: 'requested', label: 'Requested' \}/.test(ts));
check('EF3', 'the control is bound and re-applies filters on change',
  () => /data-testid="event-status-filter"[^>]*\[\(ngModel\)\]="eventStatusFilters"/.test(html)
     && /data-testid="event-status-filter"[\s\S]{0,200}\(ngModelChange\)="applyFilters\(\)"/.test(html));

// THE no-op guard: the row predicate must actually consult the filter.
check('EF4', 'row predicate filters on recentEventRequest.status (changing A changes list B)',
  () => /this\.eventStatusFilters\.length && !this\.eventStatusFilters\.includes\(\(r\.recentEventRequest\?\.status \?\? ''\)\.toLowerCase\(\)\)/.test(ts));
check('EF5', 'status comparison is case-insensitive (stored values are not normalised)',
  () => /recentEventRequest\?\.status \?\? ''\)\.toLowerCase\(\)/.test(ts));
check('EF6', 'clearFilters resets it', () => /this\.eventStatusFilters = \[\];/.test(ts));
check('EF7', 'it counts toward "filters are active" in both predicates',
  () => (ts.match(/this\.eventStatusFilters\.length > 0/g) ?? []).length >= 2);

// executable semantics of the predicate itself
const pass = (filters, status) =>
  !(filters.length && !filters.includes((status ?? '').toLowerCase()));
check('EF8',  'no filter selected -> every row passes', () => pass([], 'approved') && pass([], null));
check('EF9',  'Approved selected -> approved passes, requested does not',
  () => pass(['approved'], 'Approved') && !pass(['approved'], 'requested'));
check('EF10', 'both selected -> both pass, a row with no request does not',
  () => pass(['approved','requested'], 'REQUESTED') && !pass(['approved','requested'], null));

if (failed) { console.error(`\n${failed} event-filter check(s) FAILED — the Event confirmation filter has regressed.`); process.exit(1); }
console.log('\nAll event-filter checks passed.');
