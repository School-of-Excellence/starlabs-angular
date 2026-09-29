import {
  resolveViewRole, unionMinutes, bookedMinutes, hoursSummary, previewSlots, apptStatus,
  windowState, periodOf, shiftPeriod, overlapsAny, AvailWindow, Appt, NO_SHOW_REASON,
  openMinutes, availStatus, windowLabel, windowStatus, availableViews,
} from './sas-logic';

const T = (h: number, m = 0) => new Date(2026, 8, 28, h, m);

const win = (over: Partial<AvailWindow> = {}): AvailWindow => ({
  id: 'w', profileId: 'p', start: T(9), end: T(12), typeIds: ['a', 'b'], slots: [], ...over,
});

const appt = (over: Partial<Appt> = {}): Appt => ({
  id: 'x', start: T(9), end: T(10), attended: false, cancelled: false, cancelledReason: null,
  hostIds: ['p'], participantId: 'c', typeId: 'a', productId: null, zoomUrl: null, ...over,
});

describe('sas-logic', () => {
  describe('resolveViewRole', () => {
    const po = { productowner: ['EIS'] };
    it('ranks Mentor (with a product) above A&H above CW', () => {
      expect(resolveViewRole({ eis: true, mentor: true, scheduler: true, ...po })).toBe('mentor');
      expect(resolveViewRole({ admin: true, mentor: true, ...po })).toBe('mentor');
      expect(resolveViewRole({ eis: true, ah: true })).toBe('ah');
      expect(resolveViewRole({ eis: true, mentor: true, ...po })).toBe('mentor');
      expect(resolveViewRole({ changeagent: true })).toBe('cw');
      expect(resolveViewRole({ journeycoach: true })).toBe('cw');
    });
    it('opens a mentor with no product on their next view, or Mentor if it is their only one', () => {
      expect(resolveViewRole({ mentor: true })).toBe('mentor');
      expect(resolveViewRole({ mentor: true, productowner: [] })).toBe('mentor');
      expect(resolveViewRole({ mentor: true, admin: true })).toBe('ah');
      expect(resolveViewRole({ mentor: true, eis: true })).toBe('cw');
      expect(resolveViewRole({ eis: true, productowner: ['EIS'] })).toBe('cw');
    });
    it('offers every view the user holds a role for, Mentor first', () => {
      expect(availableViews({ eis: true, scheduler: true, mentor: true })).toEqual(['mentor', 'ah', 'cw']);
      expect(availableViews({ changeagent: true })).toEqual(['cw']);
      expect(availableViews({ tester: true, journeycoach: true })).toEqual(['ah', 'cw']);
      expect(availableViews({ participant: true })).toEqual([]);
    });
    it('treats every A&H key as A&H', () => {
      for (const k of ['admin', 'ah', 'ahmember', 'developer', 'tester', 'scheduler']) {
        expect(resolveViewRole({ [k]: true })).toBe('ah');
      }
    });
    it('returns null with no scheduling role', () => {
      expect(resolveViewRole({ participant: true })).toBeNull();
      expect(resolveViewRole(null)).toBeNull();
    });
  });

  describe('unionMinutes', () => {
    it('counts overlapping time once', () => {
      expect(unionMinutes([{ start: T(9), end: T(10) }, { start: T(9, 30), end: T(10, 30) }])).toBe(90);
    });
    it('adds disjoint intervals', () => {
      expect(unionMinutes([{ start: T(9), end: T(10) }, { start: T(11), end: T(12) }])).toBe(120);
    });
  });

  describe('bookedMinutes', () => {
    it('does not double count one booking echoed across two type arrays', () => {
      const w = win({ slots: [
        { typeId: 'a', start: T(9), end: T(10), booked: true, available: false },
        { typeId: 'b', start: T(9), end: T(10), booked: true, available: false },
        { typeId: 'a', start: T(10), end: T(11), booked: false, available: true },
      ] });
      expect(bookedMinutes(w)).toBe(60);
    });
  });

  describe('hoursSummary', () => {
    it('uses window hours for available and delivered ÷ available for utilisation', () => {
      const w = win({ slots: [{ typeId: 'a', start: T(9), end: T(10), booked: true, available: false }] });
      const h = hoursSummary([w], [
        appt({ attended: true }),
        appt({ id: 'y', cancelled: true, cancelledReason: NO_SHOW_REASON }),
        appt({ id: 'z', cancelled: true, cancelledReason: 'Cancelled By Client' }),
      ]);
      expect(h.availMin).toBe(180);
      expect(h.bookedMin).toBe(60);
      expect(h.deliveredMin).toBe(60);
      expect(h.unutilisedMin).toBe(120);
      expect(Math.round(h.pct)).toBe(33);
      expect(h.cancelledMin).toBe(120);   // a no-show is a cancellation
    });
    it('is 0% with no availability', () => {
      expect(hoursSummary([], [appt({ attended: true })]).pct).toBe(0);
    });
  });

  describe('previewSlots (mirrors computeSlot)', () => {
    it('offers a start every 30 minutes that fits the duration', () => {
      const r = previewSlots(T(9), T(11), [{ id: 'a', duration: 60 }]);
      expect(r['a'].map(s => s.start.getHours() * 60 + s.start.getMinutes())).toEqual([540, 570, 600]);
    });
    it('cuts exactly one slot when the window is one duration long (static slots)', () => {
      for (const d of [15, 45, 60, 120]) {
        const r = previewSlots(T(9), new Date(T(9).getTime() + d * 60000), [{ id: 'a', duration: d }]);
        expect(r['a'].length).withContext(d + ' min').toBe(1);
      }
    });
    it('offers nothing when the type is longer than the window', () => {
      expect(previewSlots(T(9), T(10), [{ id: 'a', duration: 120 }])['a'].length).toBe(0);
    });
  });

  describe('apptStatus', () => {
    const now = T(11);
    it('derives each status', () => {
      expect(apptStatus(appt({ attended: true }), now)).toBe('Completed');
      expect(apptStatus(appt({ cancelled: true, cancelledReason: NO_SHOW_REASON }), now)).toBe('Cancelled');
      expect(apptStatus(appt({ cancelled: true }), now)).toBe('Cancelled');
      expect(apptStatus(appt(), now)).toBe('Pending');
      expect(apptStatus(appt({ start: T(10, 30), end: T(11, 30) }), now)).toBe('In session');
      expect(apptStatus(appt({ start: T(13), end: T(14) }), now)).toBe('Booked');
    });
  });

  describe('windowState', () => {
    it('is open while a future slot is free, unused once past with no bookings', () => {
      const slots = [{ typeId: 'a', start: T(10), end: T(11), booked: false, available: true }];
      expect(windowState(win({ slots }), T(9))).toBe('open');
      expect(windowState(win({ slots }), T(13))).toBe('unused');
    });
  });

  describe('openMinutes and availStatus', () => {
    const now = T(8);
    // 9–12 window, one 2-hour type: 9–11 booked, 10–12 closed by it, so nothing is bookable.
    const full = win({ slots: [
      { typeId: 'a', start: T(9), end: T(11), booked: true, available: false },
      { typeId: 'a', start: T(10), end: T(12), booked: false, available: false },
    ] });
    const open = win({ id: 'o', slots: [
      { typeId: 'a', start: T(9), end: T(10), booked: false, available: true },
      { typeId: 'b', start: T(9), end: T(10), booked: false, available: true },
    ] });

    it('counts only bookable slot time, overlap once', () => {
      expect(openMinutes(full, now)).toBe(0);
      expect(openMinutes(open, now)).toBe(60);
    });
    it('never says Fully booked while there is open time', () => {
      expect(availStatus([open, full], [], now)).toBe('Available');
      expect(availStatus([full], [], now)).toBe('Fully booked');
      expect(availStatus([], [], now)).toBe('No availability');
      expect(availStatus([open], [appt({ start: T(7, 30), end: T(8, 30) })], now)).toBe('In session');
    });
  });

  describe('windowLabel', () => {
    it('reads Partly booked when one start time is taken and another is free', () => {
      // 12:00–13:00 window, 30-minute type: 12:00 booked, 12:30 free (the Vignesh case).
      const w = win({ start: T(12), end: T(13), slots: [
        { typeId: 'a', start: T(12), end: T(12, 30), booked: true, available: false },
        { typeId: 'a', start: T(12, 30), end: T(13), booked: false, available: true },
      ] });
      expect(windowLabel(w, T(11))).toBe('Partly booked');
      expect(openMinutes(w, T(11))).toBe(30);
      expect(windowLabel(w, T(12, 45))).toBe('Fully booked');
    });
  });

  describe('windowStatus (operator rules)', () => {
    const w = (end: number) => win({ start: T(9), end: T(end), slots: [
      { typeId: 'a', start: T(9), end: T(10), booked: true, available: false },
      { typeId: 'a', start: T(10), end: T(11), booked: false, available: true },
    ] });
    it('marks a past, booked, unmarked session as Completion pending', () => {
      expect(windowStatus(w(11), [appt()], T(12))).toBe('Completion pending');
      expect(windowStatus(w(12), [appt()], T(10, 30))).toBe('Completion pending');
    });
    it('is Completed when every live booking is marked completed', () => {
      expect(windowStatus(w(11), [appt({ attended: true }), appt({ id: 'c', cancelled: true })], T(12))).toBe('Completed');
    });
    it('is Cancelled / Unused for a past window without live bookings', () => {
      expect(windowStatus(w(11), [appt({ cancelled: true })], T(12))).toBe('Cancelled');
      expect(windowStatus(w(11), [], T(12))).toBe('Unused');
    });
    it('reads the booking state of a window that is still running or ahead', () => {
      expect(windowStatus(w(11), [appt()], T(8))).toBe('Partly booked');
      expect(windowStatus(w(11), [], T(8))).toBe('Open for booking');
      expect(windowStatus(w(11), [appt({ start: T(9), end: T(10) })], T(10, 15))).toBe('Completion pending');
    });
  });

  describe('period', () => {
    it('starts a week on Monday and a month on the 1st', () => {
      const p = periodOf('week', new Date(2026, 8, 30));
      expect(p.from.getDay()).toBe(1);
      expect(periodOf('month', new Date(2026, 8, 30)).from.getDate()).toBe(1);
      expect(shiftPeriod(p, 1).from.getDate()).toBe(new Date(2026, 9, 5).getDate());
    });
  });

  it('overlapsAny matches the existing availability rule', () => {
    expect(overlapsAny(T(10), T(11), [{ start: T(9), end: T(12) }])).toBeTrue();
    expect(overlapsAny(T(12), T(13), [{ start: T(9), end: T(12) }])).toBeFalse();
  });
});
