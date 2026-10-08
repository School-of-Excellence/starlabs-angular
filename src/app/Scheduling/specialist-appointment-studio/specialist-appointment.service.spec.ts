import { hostIdsOf, PARTICIPANT_PRODUCT_LIVE } from './specialist-appointment.service';

describe('hostIdsOf', () => {
  it('reads hosts plus every profile under hostRole, once each', () => {
    const ref = (id: string) => ({ id, path: 'profile_data/' + id });
    expect(hostIdsOf({ hosts: [ref('impl')], hostRole: { 'roles/a': [ref('impl')], 'roles/b': [ref('diag')] } })).toEqual(['impl', 'diag']);
    expect(hostIdsOf({ hosts: [], hostRole: { 'roles/a': ['profile_data/diag'] } })).toEqual(['diag']);
    expect(hostIdsOf({})).toEqual([]);
  });
});

describe('participant lookup statuses', () => {
  it('lists only not-started, initiated and ongoing products', () => {
    expect(PARTICIPANT_PRODUCT_LIVE).toEqual([null, 'initiated', 'ongoing']);
    expect(PARTICIPANT_PRODUCT_LIVE.includes('cancelled')).toBeFalse();
    expect(PARTICIPANT_PRODUCT_LIVE.includes('shifted')).toBeFalse();
  });
});
