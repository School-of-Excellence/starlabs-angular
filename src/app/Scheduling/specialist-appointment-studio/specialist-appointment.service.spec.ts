import { hostIdsOf } from './specialist-appointment.service';

describe('hostIdsOf', () => {
  it('reads hosts plus every profile under hostRole, once each', () => {
    const ref = (id: string) => ({ id, path: 'profile_data/' + id });
    expect(hostIdsOf({ hosts: [ref('impl')], hostRole: { 'roles/a': [ref('impl')], 'roles/b': [ref('diag')] } })).toEqual(['impl', 'diag']);
    expect(hostIdsOf({ hosts: [], hostRole: { 'roles/a': ['profile_data/diag'] } })).toEqual(['diag']);
    expect(hostIdsOf({})).toEqual([]);
  });
});
