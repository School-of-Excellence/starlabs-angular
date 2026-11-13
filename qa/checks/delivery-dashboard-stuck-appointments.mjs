// Stuck Cases: four columns that were not telling the truth.
//
// Before: APPOINTMENT and APPOINTMENT STATUS were hardcoded 'N/A', ASSIGNED TO was
// hardcoded 'Unassigned', APPOINTMENT DATE showed lastActivity (a status-change date,
// not an appointment), and DAYS STUCK counted from that same status field — so a coach
// who updated a status without the participant attending anything reset the clock.
//
// After: one roster-scoped query for each participant's most recent ATTENDED
// appointment fills those four. The invariant that matters is that the columns either
// carry real appointment data or SAY they are falling back — never silently.
import { readFileSync } from 'node:fs';

const D = 'src/app/Journey Onboarding/delivery-dashboard-clone/';
const ts = readFileSync(D + 'delivery-dashboard-clone.component.ts', 'utf8');
const html = readFileSync(D + 'delivery-dashboard-clone.component.html', 'utf8');
const idx = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));

let failed = 0;
const check = (id, label, fn) => {
  let ok = false; try { ok = !!fn(); } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
};
const count = (s, re) => (s.match(re) || []).length;

// --- the lies are gone ---------------------------------------------------------
check('SA1', "APPOINTMENT no longer hardcoded 'N/A' in the stuck row",
  () => !/stuck\.push\(\{[\s\S]{0,900}appointment: 'N\/A'/.test(ts));
check('SA2', "APPOINTMENT STATUS no longer hardcoded 'N/A' in the stuck row",
  () => !/stuck\.push\(\{[\s\S]{0,900}appointmentstatus: 'N\/A'/.test(ts));
check('SA3', 'APPOINTMENT DATE no longer seeded from lastActivity (a status date)',
  () => /stuck\.push\(\{[\s\S]{0,1200}date: null,/.test(ts)
     && !/stuck\.push\(\{[\s\S]{0,1200}date: lastActivity,/.test(ts));

// --- the lookup ----------------------------------------------------------------
check('SA4', 'queries the most recent ATTENDED appointment, newest first',
  () => /where\('participantproductid', 'in', chunk\)/.test(ts)
     && /where\('attended', '==', true\)/.test(ts)
     && /orderBy\('endtime', 'desc'\)/.test(ts));
check('SA5', 'roster-scoped and chunked at the Firestore in-limit, never a whole-collection read',
  () => /const CHUNK = 30;/.test(ts)
     && /ids\.slice\(i, i \+ CHUNK\)/.test(ts)
     && !/getDocs\(\s*collection\(this\.firestore, 'appointments'\)\s*\)/.test(ts));
check('SA6', 'only the stuck set is looked up, not every participant',
  () => /stuckItems\.map\(i => i\.participantproductid\)/.test(ts));
check('SA7', 'a newer refresh wins (stale-response guard)',
  () => /const requestId = \+\+this\.stuckLookupId;/.test(ts)
     && /if \(requestId !== this\.stuckLookupId\) return;/.test(ts));
check('SA8', 'first row per product is taken, which is correct only because of the ordering',
  () => /if \(pid && !latest\.has\(pid\)\) latest\.set\(pid, a\);/.test(ts));

// --- the five columns get filled ------------------------------------------------
check('SA9',  'APPOINTMENT filled via the existing resolveAppointmentType',
  () => /item\.appointment = this\.resolveAppointmentType\(appt\)/.test(ts));
check('SA10', "APPOINTMENT STATUS is 'Attended' — not a guess, every row passed attended == true",
  () => /item\.appointmentstatus = 'Attended';/.test(ts));
check('SA11', 'APPOINTMENT DATE is the real appointment endtime',
  () => /item\.date = endtime;/.test(ts) && /item\.recentappointmentdate = endtime;/.test(ts));
// Wired but INERT on starlabs-test: appt['assignedto'] was falsy for all 8 resolving
// rows, so ASSIGNED TO still reads 'Unassigned'. The coach is probably in the
// appointment's `hosts` array. Pinned as a fallback chain so it cannot regress into
// overwriting a good value with undefined.
check('SA12', 'ASSIGNED TO reads from the appointment but never clobbers the existing value',
  () => /item\.assignedto = appt\['assignedto'\] \|\| item\.assignedto \|\| 'Unassigned';/.test(ts));
check('SA13', 'DAYS STUCK switches to the appointment basis only when a date resolved',
  () => /const since = this\.daysSinceTs\(endtime\);/.test(ts)
     && /if \(since !== null\) \{/.test(ts)
     && /item\.stuckdaysbasis = 'appointment';/.test(ts));

// --- honesty about the fallback --------------------------------------------------
check('SA14', 'the stuck header reads stuckdays, not the raw status field',
  () => /\{ key: 'stuckdays', label: 'DAYS STUCK'/.test(ts)
     && !/\{ key: 'waitingperiod', label: 'DAYS STUCK'/.test(ts));
check('SA15', 'waitingperiod is preserved as the fallback basis, not overwritten',
  () => /waitingperiod: days,\s*\n\s*stuckdays: days,\s*\n\s*stuckdaysbasis: 'status',/.test(ts));
check('SA16', 'the cell marks rows that fell back to status data',
  () => /data-testid="pm-stuck-days"/.test(html)
     && /pm-days-basis[\s\S]{0,120}stuckdaysbasis'\] !== 'appointment'/.test(html));
check('SA17', 'the cell says which basis it used',
  () => /last attended an appointment/.test(html)
     && /counting from the last status change/.test(html));
check('SA18', 'a missing value renders an em dash, never a green 0 DAYS',
  () => /isKnownWait\(participant\['stuckdays'\]\)/.test(html));

// --- index failure is stated, not disguised ---------------------------------------
check('SA19', 'a failed lookup records an error instead of leaving blanks',
  () => /catch \(err\)[\s\S]{0,260}this\.stuckAppointmentsError = /.test(ts));
check('SA20', 'the banner exists and lives inside the Stuck Cases tab',
  () => {
    const i = html.indexOf('data-testid="pm-tab-stuck"');
    const b = html.indexOf('data-testid="pm-stuck-appointments-error"');
    const nextTab = html.indexOf('mat-tab-label', i + 10);
    return i !== -1 && b > i && (nextTab === -1 || b < nextTab + 4000);
  });
check('SA21', 'the banner says blank means failed, not absent',
  () => /because the lookup failed, not because there is no appointment/.test(html));
check('SA22', 'exactly one banner — it must not appear on the other two cohort tabs',
  () => count(html, /data-testid="pm-stuck-appointments-error"/g) === 1);

// --- the index the query needs ------------------------------------------------------
check('SA23', 'composite index participantproductid + attended + endtime exists', () => {
  const want = ['participantproductid', 'attended', 'endtime'];
  return idx.indexes.some(i => i.collectionGroup === 'appointments'
    && i.fields.length === 3
    && i.fields.every((f, n) => f.fieldPath === want[n])
    && i.fields[2].order === 'DESCENDING');
});
check('SA24', 'the pre-existing journeycoach index was not displaced',
  () => idx.indexes.some(i => i.collectionGroup === 'appointments'
    && i.fields.some(f => f.fieldPath === 'journeycoach')));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
