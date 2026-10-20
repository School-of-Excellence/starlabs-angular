import { appointmentSpecialistRows, propertyLabel, AtcActivity, latestAtcAppointment, AppointmentSummary } from './appointment-specialists';

const ACTS: AtcActivity[] = [
  { docid: 'A_SOLO', activity: 'Diagnostics Solo', atcproperty: 'author' },
  { docid: 'A_SHADOW', activity: 'Diagnostics Shadow', atcproperty: 'observer' },
  { docid: 'A_EIIMPL', activity: 'EI Implementation', atcproperty: 'assigned_to' },
  { docid: 'A_PLAIN', activity: 'Plain', atcproperty: null },
];
const ref = (path: string) => ({ path, id: path.split('/').pop() });

describe('appointment-specialists', () => {
  it('maps each role to its activity and that role\'s hosts', () => {
    const rows = appointmentSpecialistRows(
      { hostRole: { 'eisroles/R_DIAG': [ref('profile_data/disha')], 'eisroles/R_SHADOW': [ref('profile_data/ishara')] } },
      { atcrequired: true, atcrolemap: { R_DIAG: 'A_SOLO', R_SHADOW: 'A_SHADOW' } },
      ACTS,
    );
    expect(rows).toEqual([
      { activityId: 'A_SOLO', activity: 'Diagnostics Solo', atcproperty: 'author', label: 'AUTHOR', profilePaths: ['profile_data/disha'] },
      { activityId: 'A_SHADOW', activity: 'Diagnostics Shadow', atcproperty: 'observer', label: 'OBSERVER', profilePaths: ['profile_data/ishara'] },
    ]);
  });

  it('accepts path strings and bare ids as hosts, and de-duplicates', () => {
    const [row] = appointmentSpecialistRows(
      { hostRole: { 'eisroles/R1': ['profile_data/a', 'b', ref('profile_data/a')] } },
      { atcrequired: true, atcrolemap: { R1: 'A_SOLO' } }, ACTS,
    );
    expect(row.profilePaths).toEqual(['profile_data/a', 'profile_data/b']);
  });

  it('keeps a row with no people when nobody hosted the role', () => {
    const [row] = appointmentSpecialistRows({ hostRole: {} }, { atcrequired: true, atcrolemap: { R1: 'A_EIIMPL' } }, ACTS);
    expect(row.label).toBe('CA');
    expect(row.profilePaths).toEqual([]);
  });

  it('merges two roles mapped to the same activity into one row', () => {
    const rows = appointmentSpecialistRows(
      { hostRole: { 'eisroles/R1': [ref('profile_data/a')], 'eisroles/R2': [ref('profile_data/b')] } },
      { atcrequired: true, atcrolemap: { R1: 'A_SOLO', R2: 'A_SOLO' } }, ACTS,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].profilePaths).toEqual(['profile_data/a', 'profile_data/b']);
  });

  it('returns nothing when ATC is not required, the mapping is missing, or the activity is unknown', () => {
    const appt = { hostRole: { 'eisroles/R1': [ref('profile_data/a')] } };
    expect(appointmentSpecialistRows(appt, { atcrequired: false, atcrolemap: { R1: 'A_SOLO' } }, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(appt, null, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(null, { atcrequired: true, atcrolemap: { R1: 'A_SOLO' } }, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(appt, { atcrequired: true, atcrolemap: { R1: 'GONE' } }, ACTS)).toEqual([]);
  });

  it('labels properties', () => {
    expect(propertyLabel('mentoring')).toBe('MENTOR');
    expect(propertyLabel('custom')).toBe('CUSTOM');
    expect(propertyLabel(null)).toBe('');
  });
});

describe('latestAtcAppointment', () => {
  const day = (d: number) => new Date(2026, 9, d, 10);
  const a = (id: string, d: number, over: Partial<AppointmentSummary> = {}): AppointmentSummary =>
    ({ id, start: day(d), attended: true, cancelled: false, typeId: 'ATC', ...over });
  const atc = new Set(['ATC']);

  it('picks the most recent completed appointment of an ATC type', () => {
    expect(latestAtcAppointment([a('old', 10), a('new', 18), a('mid', 14)], atc)).toBe('new');
  });

  it('skips not-attended, cancelled, non-ATC and undated appointments', () => {
    const list = [
      a('ok', 10),
      a('notyet', 19, { attended: false }),
      a('cancelled', 18, { cancelled: true }),
      a('otherType', 17, { typeId: 'PLAIN' }),
      a('nodate', 16, { start: null }),
    ];
    expect(latestAtcAppointment(list, atc)).toBe('ok');
  });

  it('returns null when nothing qualifies', () => {
    expect(latestAtcAppointment([a('x', 10, { typeId: 'PLAIN' })], atc)).toBeNull();
    expect(latestAtcAppointment([], atc)).toBeNull();
  });
});
