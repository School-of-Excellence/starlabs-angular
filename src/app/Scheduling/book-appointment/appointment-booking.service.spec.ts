import { AppointmentBookingService, Bookable, EisSlot, TypeRoles, slotGapMessage } from './appointment-booking.service';

describe('AppointmentBookingService (pure parts)', () => {
  const svc = new AppointmentBookingService({} as any);
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m);
  const s = (role: string, who: string, h: number, m = 0, doc = who + h): EisSlot =>
    ({ slotstart: at(h, m), slotend: at(h + 1, m), docid: doc, index: 0, eisprofile: 'profile_data/' + who, appointmentrole: role });

  it('mergeSlots: one role → every free slot', () => {
    const out = svc.mergeSlots([s('r1', 'priya', 10), s('r1', 'priya', 9)], ['r1'], id => id);
    expect(out.map(x => x.start.getHours())).toEqual([9, 10]);
    expect(out[0].specialist).toBe('priya');
  });

  it('mergeSlots: collaborative → only times when every role is free, with different people', () => {
    const out = svc.mergeSlots([
      s('diag', 'anu', 9), s('impl', 'ravi', 9),       // both free at 9 → bookable
      s('diag', 'anu', 10),                            // implementation not free at 10
      s('diag', 'kim', 11), s('impl', 'kim', 11),      // same person for both roles → not bookable
    ], ['diag', 'impl'], id => id);
    expect(out.length).toBe(1);
    expect(out[0].specialist).toBe('anu, ravi');
    expect(out[0].eisprofiles).toEqual(['profile_data/anu', 'profile_data/ravi']);
    expect(out[0].docdata.length).toBe(2);
  });

  it('mergeSlots: a role with no free slot → nothing', () => {
    expect(svc.mergeSlots([s('diag', 'anu', 9)], ['diag', 'impl'], id => id)).toEqual([]);
  });

  describe('planForSlot', () => {
    const base: TypeRoles = { required: ['diag'], additional: ['extra'], eis: { diag: ['profile_data/anu', 'profile_data/ravi'] } };
    const slot = { start: at(9), end: at(10), specialist: 'anu', eisprofiles: ['profile_data/anu'], docdata: [{ id: 'd', index: 0 }] };
    const who = (id: string, mapped: any = null): Bookable => ({ participantId: id, mapped, target: {} as any });

    it('anyone without a mapping can take it', () => {
      expect(svc.planForSlot(base, who('p1'), slot)?.roles).toEqual(['diag']);
    });
    it('a mapping that pins another specialist rules them out', () => {
      expect(svc.planForSlot(base, who('p2', { diag: [{ path: 'profile_data/ravi' }] }), slot)).toBeNull();
      expect(svc.planForSlot(base, who('p3', { diag: [{ path: 'profile_data/anu' }] }), slot)).not.toBeNull();
    });
    it('a mapped additional role rules them out (book those By participant)', () => {
      expect(svc.planForSlot(base, who('p4', { extra: [{ path: 'profile_data/kim' }] }), slot)).toBeNull();
    });
    it('a participant is never their own specialist', () => {
      expect(svc.planForSlot(base, who('anu'), slot)).toBeNull();
    });
  });

  describe('slotGapMessage', () => {
    const name = (r: string) => ({ 'roles/d': 'EI Diagnostics', 'roles/i': 'EI Implementation' } as any)[r];
    const roles = ['roles/d', 'roles/i'];
    const people = { 'roles/d': ['profile_data/anu'], 'roles/i': ['profile_data/ravi'] };

    it('names the role that has no open slots', () => {
      expect(slotGapMessage('Kick-off', roles, people, new Set(['roles/d']), name, 'on 7 Oct')).toBe(
        'Kick-off needs 2 specialists at the same time: EI Diagnostics and EI Implementation. '
        + 'EI Implementation has no open slots on 7 Oct. Ask an EI Implementation specialist to add availability.');
    });
    it('names a role nobody holds', () => {
      expect(slotGapMessage('Kick-off', roles, { ...people, 'roles/i': [] }, new Set(roles), name)).toContain('No specialist is mapped to EI Implementation');
    });
    it('says when both are free but never together', () => {
      expect(slotGapMessage('Kick-off', roles, people, new Set(roles), name, 'on 7 Oct')).toContain('never start at the same time on 7 Oct');
    });
    it('says when a type has no roles at all', () => {
      expect(slotGapMessage('Kick-off', [], {}, new Set(), name)).toContain('has no roles set up');
    });
  });
});
