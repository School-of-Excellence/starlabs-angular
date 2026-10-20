import {
  appointmentSpecialistRows, propertyLabel, AtcActivity, completedNewestFirst, AppointmentSummary, appointmentRoleIds,
  specialistsByProperty,
} from './appointment-specialists';

const ACTS: AtcActivity[] = [
  { docid: 'A_SOLO', activity: 'Diagnostics Solo', atcproperty: 'author' },
  { docid: 'A_CONS', activity: 'Consultation Solo', atcproperty: 'author' },
  { docid: 'A_SHADOW', activity: 'Diagnostics Shadow', atcproperty: 'observer' },
  { docid: 'A_EIIMPL', activity: 'EI Implementation', atcproperty: 'assigned_to' },
  { docid: 'A_PLAIN', activity: 'Plain', atcproperty: null },
];
const ref = (path: string) => ({ path, id: path.split('/').pop() });
const MAP = { atcrequired: true, atcrolemap: { R_DIAG: 'A_SOLO', R_SHADOW: 'A_SHADOW', R_IMPL: 'A_EIIMPL' } };

describe('appointment-specialists', () => {
  it('one row per appointmentrole: role -> activity -> property, with that role\'s hosts', () => {
    const rows = appointmentSpecialistRows({
      appointmentrole: [ref('eisroles/R_DIAG'), ref('eisroles/R_SHADOW')],
      hostRole: { 'eisroles/R_DIAG': [ref('profile_data/disha')], 'eisroles/R_SHADOW': [ref('profile_data/ishara')] },
    }, MAP, ACTS);
    expect(rows).toEqual([
      { roleId: 'R_DIAG', activityId: 'A_SOLO', activity: 'Diagnostics Solo', atcproperty: 'author', label: 'AUTHOR', profilePaths: ['profile_data/disha'] },
      { roleId: 'R_SHADOW', activityId: 'A_SHADOW', activity: 'Diagnostics Shadow', atcproperty: 'observer', label: 'OBSERVER', profilePaths: ['profile_data/ishara'] },
    ]);
  });

  it('only the appointment\'s roles count; without appointmentrole every mapped role does', () => {
    const hostRole = { 'eisroles/R_DIAG': [ref('profile_data/a')], 'eisroles/R_IMPL': [ref('profile_data/b')] };
    expect(appointmentSpecialistRows({ appointmentrole: [ref('eisroles/R_DIAG')], hostRole }, MAP, ACTS).map(r => r.roleId)).toEqual(['R_DIAG']);
    expect(appointmentSpecialistRows({ hostRole }, MAP, ACTS).map(r => r.roleId)).toEqual(['R_DIAG', 'R_SHADOW', 'R_IMPL']);
  });

  it('accepts path strings and bare ids as hosts, de-duplicated; a role nobody hosted keeps an empty row', () => {
    const [row] = appointmentSpecialistRows(
      { appointmentrole: ['eisroles/R_DIAG'], hostRole: { 'eisroles/R_DIAG': ['profile_data/a', 'b', ref('profile_data/a')] } }, MAP, ACTS);
    expect(row.profilePaths).toEqual(['profile_data/a', 'profile_data/b']);
    const [empty] = appointmentSpecialistRows({ appointmentrole: [ref('eisroles/R_IMPL')], hostRole: {} }, MAP, ACTS);
    expect(empty.label).toBe('CA');
    expect(empty.profilePaths).toEqual([]);
  });

  it('returns nothing when ATC is not required, the mapping is missing, or the role maps to no known activity', () => {
    const appt = { appointmentrole: [ref('eisroles/R_DIAG')], hostRole: { 'eisroles/R_DIAG': [ref('profile_data/a')] } };
    expect(appointmentSpecialistRows(appt, { ...MAP, atcrequired: false }, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(appt, null, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(null, MAP, ACTS)).toEqual([]);
    expect(appointmentSpecialistRows(appt, { atcrequired: true, atcrolemap: { R_DIAG: 'GONE' } }, ACTS)).toEqual([]);
  });

  it('pools specialists per property, so a role covers every activity of its property', () => {
    const rows = appointmentSpecialistRows({
      appointmentrole: [ref('eisroles/R_DIAG'), ref('eisroles/R_SHADOW'), ref('eisroles/R_IMPL')],
      hostRole: {
        'eisroles/R_DIAG': [ref('profile_data/disha')],
        'eisroles/R_SHADOW': [ref('profile_data/ishara')],
        'eisroles/R_IMPL': [ref('profile_data/ishara'), ref('profile_data/vignesh')],
      },
    }, MAP, ACTS);
    expect(specialistsByProperty(rows)).toEqual({
      author: ['profile_data/disha'],
      observer: ['profile_data/ishara'],
      assigned_to: ['profile_data/ishara', 'profile_data/vignesh'],
    });
  });

  it('reads appointmentrole ids from refs or path strings', () => {
    expect(appointmentRoleIds({ appointmentrole: [ref('eisroles/R1'), 'eisroles/R2'] })).toEqual(['R1', 'R2']);
    expect(appointmentRoleIds({})).toBeNull();
  });

  it('labels properties', () => {
    expect(propertyLabel('mentoring')).toBe('MENTOR');
    expect(propertyLabel('custom')).toBe('CUSTOM');
    expect(propertyLabel(null)).toBe('');
  });
});

describe('completedNewestFirst', () => {
  const day = (d: number) => new Date(2026, 9, d, 10);
  const a = (id: string, d: number, over: Partial<AppointmentSummary> = {}): AppointmentSummary =>
    ({ id, start: day(d), attended: true, cancelled: false, typeId: 'T', ...over });

  it('keeps attended, not-cancelled, typed, dated appointments, newest first', () => {
    const list = [
      a('old', 10), a('new', 18), a('mid', 14),
      a('notyet', 19, { attended: false }),
      a('cancelled', 17, { cancelled: true }),
      a('untyped', 16, { typeId: null }),
      a('nodate', 15, { start: null }),
    ];
    expect(completedNewestFirst(list).map(x => x.id)).toEqual(['new', 'mid', 'old']);
  });
});
