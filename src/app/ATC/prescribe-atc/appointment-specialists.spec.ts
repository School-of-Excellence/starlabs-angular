import {
  appointmentSpecialistRows, propertyLabel, AtcActivity, completedNewestFirst, AppointmentSummary, appointmentRoleIds,
  hostRoleIds, appointmentHostIds, activityIdsOf, pickAtcAppointment,
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

  it('roles come from hostRole keys; appointmentrole is the fallback, then every mapped role', () => {
    const hostRole = { 'eisroles/R_DIAG': [ref('profile_data/a')], 'eisroles/R_IMPL': [ref('profile_data/b')] };
    // hostRole wins over appointmentrole
    expect(appointmentSpecialistRows({ appointmentrole: [ref('eisroles/R_DIAG')], hostRole }, MAP, ACTS).map(r => r.roleId)).toEqual(['R_DIAG', 'R_IMPL']);
    // empty hostRole -> appointmentrole
    expect(appointmentSpecialistRows({ appointmentrole: [ref('eisroles/R_SHADOW')], hostRole: {} }, MAP, ACTS).map(r => r.roleId)).toEqual(['R_SHADOW']);
    // neither -> every atcrolemap role
    expect(appointmentSpecialistRows({}, MAP, ACTS).map(r => r.roleId)).toEqual(['R_DIAG', 'R_SHADOW', 'R_IMPL']);
  });

  it('reads role ids from hostRole keys, ignoring keys that are not eisroles paths', () => {
    expect(hostRoleIds({ hostRole: { 'eisroles/PaKfMmwbBiGWV7QuXkqN': [], 'other/x': [] } })).toEqual(['PaKfMmwbBiGWV7QuXkqN']);
    expect(hostRoleIds({})).toEqual([]);
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

  it('each row targets only the one activity its role maps to (other activities of that property are untouched)', () => {
    const rows = appointmentSpecialistRows({
      hostRole: { 'eisroles/R_DIAG': [ref('profile_data/disha')], 'eisroles/R_IMPL': [ref('profile_data/ishara')] },
    }, MAP, ACTS);
    // R_DIAG -> A_SOLO only (not the other author activity A_CONS); R_IMPL -> A_EIIMPL
    expect(rows.map(r => [r.roleId, r.activityId])).toEqual([['R_DIAG', 'A_SOLO'], ['R_IMPL', 'A_EIIMPL']]);
  });

  it('a role mapped to several activities (array) gives one row per activity, each with that role\'s hosts', () => {
    const rows = appointmentSpecialistRows(
      { hostRole: { 'eisroles/R_SHADOW': [ref('profile_data/ishara')] } },
      { atcrequired: true, atcrolemap: { R_SHADOW: ['A_SHADOW', 'A_EIIMPL', 'GONE'] } }, ACTS);
    expect(rows.map(r => [r.roleId, r.activityId, r.label, r.profilePaths])).toEqual([
      ['R_SHADOW', 'A_SHADOW', 'OBSERVER', ['profile_data/ishara']],
      ['R_SHADOW', 'A_EIIMPL', 'CA', ['profile_data/ishara']],
    ]);
  });

  it('reads atcrolemap values as arrays or single ids', () => {
    expect(activityIdsOf(['a', 'b', 'a', '', 3])).toEqual(['a', 'b']);
    expect(activityIdsOf('a')).toEqual(['a']);
    expect(activityIdsOf(undefined)).toEqual([]);
  });

  it('lists every host on an appointment (hostRole people + hosts), as profile ids', () => {
    expect(appointmentHostIds({
      hostRole: { 'eisroles/R1': [ref('profile_data/raksha')], 'eisroles/R2': ['profile_data/vignesh'] },
      hosts: [ref('profile_data/raksha'), ref('profile_data/charan')],
    }).sort()).toEqual(['charan', 'raksha', 'vignesh']);
    expect(appointmentHostIds({})).toEqual([]);
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
  const NOW = new Date(2026, 9, 20, 15, 0);            // 20 Oct 2026, 3 pm
  const at = (d: number, h = 10) => new Date(2026, 9, d, h);
  const a = (id: string, start: Date | null, over: Partial<AppointmentSummary> = {}): AppointmentSummary =>
    ({ id, start, attended: true, cancelled: false, typeId: 'T', ...over });

  it('past days need attended; newest first', () => {
    const list = [a('old', at(10)), a('new', at(18)), a('mid', at(14)), a('notMarked', at(19), { attended: false })];
    expect(completedNewestFirst(list, NOW).map(x => x.id)).toEqual(['new', 'mid', 'old']);
  });

  it('today counts even before its status is updated, including later today', () => {
    const list = [a('yesterday', at(19)), a('todayUnmarked', at(20, 9), { attended: false }), a('todayLater', at(20, 18), { attended: false })];
    expect(completedNewestFirst(list, NOW).map(x => x.id)).toEqual(['todayLater', 'todayUnmarked', 'yesterday']);
  });

  it('never takes future days (even if marked attended), cancelled, untyped or undated appointments', () => {
    const list = [
      a('ok', at(12)),
      a('tomorrow', at(21), { attended: true }),
      a('cancelledToday', at(20, 9), { cancelled: true }),
      a('noCancelledField', at(19), { cancelled: undefined }),
      a('untyped', at(16), { typeId: null }),
      a('nodate', null),
    ];
    expect(completedNewestFirst(list, NOW).map(x => x.id)).toEqual(['ok']);
  });
});

describe('pickAtcAppointment', () => {
  const NOW = new Date(2026, 9, 21, 15, 0);
  const at = (d: number, h = 10) => new Date(2026, 9, d, h);
  const a = (id: string, d: number, over: any = {}) =>
    ({ id, start: at(d), attended: true, cancelled: false, typeId: 'EI_DIAG', hostIds: ['me', 'other'], ...over });
  const types = new Set(['EI_DIAG', 'EI_IMPL']);

  it('picks the newest appointment of a matching type that the logged-in specialist hosted', () => {
    expect(pickAtcAppointment([a('old', 10), a('new', 18, { typeId: 'EI_IMPL' }), a('mid', 14)], types, 'me', NOW)).toBe('new');
  });

  it('ignores other types, appointments you did not host, future and cancelled ones', () => {
    const list = [
      a('ok', 12),
      a('otherType', 19, { typeId: 'EI_SOL' }),
      a('notMine', 20, { hostIds: ['someone'] }),
      a('tomorrow', 22),
      a('cancelled', 20, { cancelled: true }),
    ];
    expect(pickAtcAppointment(list, types, 'me', NOW)).toBe('ok');
  });

  it('returns null when nothing matches (the specialist fills the pickers manually)', () => {
    expect(pickAtcAppointment([a('x', 12, { hostIds: ['someone'] })], types, 'me', NOW)).toBeNull();
    expect(pickAtcAppointment([a('x', 12)], new Set(), 'me', NOW)).toBeNull();
    expect(pickAtcAppointment([a('x', 12)], types, '', NOW)).toBeNull();
  });
});
