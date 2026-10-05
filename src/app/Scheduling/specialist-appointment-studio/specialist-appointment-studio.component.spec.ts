import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { AppointmentBookingService, Bookable, TypeRoles } from '../book-appointment/appointment-booking.service';
import {
  SpecialistAppointmentStudioComponent, NAV, HomeTab, TeamTable, AddDialog, WindowDialog, FilterBar, PersonPicker,
  PeriodBar, BookTab, BookSlotDialog, SettingsTab,
} from './specialist-appointment-studio.component';
import { SpecialistAppointmentService, ApptRow } from './specialist-appointment.service';
import { Appt, AvailWindow, NO_SHOW_REASON, Period, availableViews, periodOf, resolveViewRole } from './sas-logic';

/* Everything the screen reads, empty by default; each test overrides what it needs. */
function fakeSvc(over: Record<string, any> = {}): any {
  const roles = over['roles'] ?? {};
  return {
    roles, views: availableViews(roles), viewRole: resolveViewRole(roles), profileId: 'me',
    init: () => Promise.resolve(),
    name: (id: string | null) => id ?? '—', mapAppointment: {}, mapAppointmentData: {},
    filterOptions: () => Promise.resolve({ products: [], types: [] }),
    specialists: () => Promise.resolve([]), mentors: () => Promise.resolve([]), atcModels: () => Promise.resolve([]),
    windows: () => Promise.resolve([]), appointments: () => Promise.resolve([]),
    pastPage: () => Promise.resolve({ rows: [], cursor: null, done: true }),
    productsFor: () => Promise.resolve([]), teamForAtcModels: () => Promise.resolve({ productIds: [], memberIds: [] }),
    typesFor: () => Promise.resolve([]), futureIntervals: () => Promise.resolve([]), unmarkedLastAppointment: () => Promise.resolve(null),
    ...over,
  };
}

/* template '' = the component as a host for the tab / dialog classes, without rendering. */
async function make(svc: any, opts: { template?: string; booking?: any; init?: boolean } = {}) {
  await TestBed.configureTestingModule({
    imports: [SpecialistAppointmentStudioComponent, NoopAnimationsModule],
    providers: [
      provideRouter([]),
      { provide: Firestore, useValue: {} },
      { provide: AuthguardService, useValue: {} },
      { provide: AppointmentBookingService, useValue: opts.booking ?? new AppointmentBookingService({} as any) },
    ],
  }).overrideComponent(SpecialistAppointmentStudioComponent, {
    set: { providers: [DatePipe, { provide: SpecialistAppointmentService, useValue: svc }], ...(opts.template != null ? { template: opts.template } : {}) },
  }).compileComponents();
  const fixture = TestBed.createComponent(SpecialistAppointmentStudioComponent);
  const c = fixture.componentInstance;
  if (opts.init !== false) { await c.ngOnInit(); fixture.detectChanges(); }
  return { fixture, c };
}
const settle = async (f: ComponentFixture<unknown>) => { await f.whenStable(); await new Promise(r => setTimeout(r)); f.detectChanges(); };

/* ================================================================ shell */
describe('SpecialistAppointmentStudioComponent · shell', () => {
  it('gives each role its own nav', () => {
    expect(NAV.cw.map(n => n.tab)).toEqual(['home']);
    expect(NAV.mentor.map(n => n.tab)).toEqual(['home', 'team']);
    expect(NAV.ah.map(n => n.tab)).toEqual(['overview', 'mentors', 'util', 'book', 'settings']);
  });

  it('opens A&H on Overview', async () => {
    const { c } = await make(fakeSvc({ roles: { scheduler: true } }), { template: '' });
    expect(c.tab).toBe('overview');
    expect(c.home?.mode).toBe('all');
    expect(c.nav.length).toBe(5);
  });

  it('opens a mentor with a product on Home', async () => {
    const { c } = await make(fakeSvc({ roles: { mentor: true, productowner: ['EIS'] } }), { template: '' });
    expect(c.viewRole).toBe('mentor');
    expect(c.tab).toBe('home');
  });

  it('View as lists every view the user holds a role for, and switches', async () => {
    const { c } = await make(fakeSvc({ roles: { mentor: true, productowner: ['EIS'], admin: true, eis: true } }), { template: '' });
    expect(c.views).toEqual(['mentor', 'ah', 'cw']);
    c.setView('ah');
    expect(c.tab).toBe('overview');
    c.setView('cw');
    expect(c.nav.map(n => n.tab)).toEqual(['home']);
  });

  it('opens a mentor with no product on their other view', async () => {
    const { c } = await make(fakeSvc({ roles: { mentor: true, eis: true } }), { template: '' });
    expect(c.viewRole).toBe('cw');
    c.setView('mentor');
    expect(c.noProduct).toBeTrue();
    expect(c.nav.length).toBe(0);
  });

  it('Mentor view without a product says no product owner is assigned', async () => {
    const { fixture } = await make(fakeSvc({ roles: { mentor: true } }));
    expect(fixture.nativeElement.querySelector('[data-testid="sas-no-product"]')?.textContent).toContain('No product owner is assigned to you');
  });

  it('shows the no-role message without a scheduling role', async () => {
    const { fixture } = await make(fakeSvc({ roles: { participant: true } }));
    expect(fixture.nativeElement.querySelector('[data-testid="sas-no-role"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sas-nav"]')).toBeNull();
  });

  it('renders every A&H tab from the one template', async () => {
    const { fixture, c } = await make(fakeSvc({ roles: { scheduler: true } }));
    for (const [tab, id] of [['mentors', 'sas-mentors-title'], ['util', 'sas-util-title'], ['book', 'sas-book-title'],
      ['settings', 'sas-settings-title'], ['overview', 'sas-home-title']] as const) {
      c.go(tab);
      await settle(fixture);
      expect(fixture.nativeElement.querySelector(`[data-testid="${id}"]`)).withContext(tab).toBeTruthy();
    }
  });
});

/* ================================================================ Home: past sessions + Join */
describe('HomeTab · past sessions and Join', () => {
  // 60 past appointments, newest first: every 3rd is unmarked (pending), every 3rd+1 completed,
  // every 3rd+2 cancelled — half of those as no-shows.
  const history: ApptRow[] = Array.from({ length: 60 }, (_, i) => {
    const end = new Date(Date.now() - (i + 1) * 3600000), k = i % 3;
    const appt: Appt = {
      id: 'a' + i, start: new Date(end.getTime() - 3600000), end, attended: k === 1, cancelled: k === 2,
      cancelledReason: k === 2 ? (i % 2 ? NO_SHOW_REASON : 'Cancelled By Client') : null,
      hostIds: ['me'], participantId: 'p', typeId: 't', productId: null, zoomUrl: null,
    };
    return { appt, raw: {} };
  });
  let c: SpecialistAppointmentStudioComponent, h: HomeTab, fixture: ComponentFixture<SpecialistAppointmentStudioComponent>;

  beforeEach(async () => {
    const svc = fakeSvc({
      roles: { eis: true }, mapAppointment: { t: 'Journey Coach' },
      pastPage: (_h: string | null, cursor: any, size: number) => {
        const from = cursor ?? 0, rows = history.slice(from, from + size);
        return Promise.resolve({ rows, cursor: from + rows.length, done: from + size >= history.length });
      },
    });
    ({ fixture, c } = await make(svc));
    await settle(fixture);
    h = c.home!;
  });

  it('loads only the first page of pending sessions', () => {
    // 25 appointments are read per Firestore page, so a page can add a few more than 10 matches.
    expect(h.past.length).toBeGreaterThanOrEqual(10);
    expect(h.past.length).toBeLessThan(20);
    expect(h.past.every(r => !r.appt.attended && !r.appt.cancelled)).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="sas-home-past-more"]')).toBeTruthy();
  });

  it('adds the next page on Load more, and stops when history runs out', async () => {
    const first = h.past.length;
    await h.loadPast(false);
    expect(h.past.length).toBeGreaterThan(first);
    while (!h.pastDone) await h.loadPast(false);
    expect(h.past.length).toBe(20);
    expect(new Set(h.past.map(r => r.appt.id)).size).toBe(h.past.length);
  });

  it('starts again when the filter changes, and never says no-show', async () => {
    h.pastFilter = 'cancelled';
    await h.loadPast(true);
    fixture.detectChanges();
    expect(h.past.every(r => r.appt.cancelled)).toBeTrue();
    const text: string = fixture.nativeElement.textContent;
    expect(text.toLowerCase()).not.toContain('no-show');
    expect(text).not.toContain(NO_SHOW_REASON);
  });

  const soon = (startInMin: number): Appt => ({
    ...history[0].appt, id: 'APPT1', start: new Date(Date.now() + startInMin * 60000), end: new Date(Date.now() + (startInMin + 60) * 60000),
  });

  it('Join opens the appointment in AppointmentZoomView, in a new tab', () => {
    const open = spyOn(window, 'open');
    c.clock = new Date();
    c.join({ appt: soon(2), raw: { zoomdata: { id: 123 } } });
    expect(open).toHaveBeenCalledWith('/openappointmentzoom/APPT1', '_blank');
  });

  it('Join opens 5 minutes before the start and closes at the end', () => {
    c.clock = new Date();
    const later = { appt: soon(30), raw: { zoomdata: {} } };
    expect(c.canJoin(later)).toBeFalse();
    expect(c.joinTip(later)).toContain('Opens at');
    expect(c.canJoin({ appt: soon(4), raw: {} })).toBeTrue();
    expect(c.canJoin({ appt: soon(-30), raw: {} })).toBeTrue();
    const ended = { appt: history[0].appt, raw: { zoomdata: {} } };
    expect(c.canJoin(ended)).toBeFalse();
    expect(c.joinTip(ended)).toBe('This session has ended');
    const open = spyOn(window, 'open');
    c.join(later);
    expect(open).not.toHaveBeenCalled();
  });

  it('Join does not open a tab when the session has no Zoom meeting', () => {
    const open = spyOn(window, 'open');
    c.clock = new Date();
    c.join({ appt: soon(2), raw: {} });
    expect(open).not.toHaveBeenCalled();
  });
});

/* ================================================================ Home: all specialists */
describe('HomeTab · calendar for all specialists', () => {
  it('shows every specialist\'s windows, each booking under its own specialist\'s window', async () => {
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
    const at = (hr: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), hr);
    const win = (id: string, who: string): any => ({ id, profileId: who, start: at(9), end: at(12), typeIds: ['t'], slots: [] });
    const row = (id: string, who: string[]): ApptRow => ({ raw: {}, appt: {
      id, start: at(10), end: at(11), attended: false, cancelled: false, cancelledReason: null,
      hostIds: who, participantId: 'p', typeId: 't', productId: null, zoomUrl: null } });
    const svc = fakeSvc({
      roles: { scheduler: true },
      windows: () => Promise.resolve([win('wA', 'anita'), win('wB', 'bala')]),
      appointments: () => Promise.resolve([row('xB', ['bala']), row('xA', ['anita']), row('joint', ['anita', 'bala'])]),
    });
    const { fixture, c } = await make(svc);
    const h = c.home!;
    h.bar.emit({ mode: 'week', from: monday, to: new Date(monday.getTime() + 7 * 86400000) });   // next week, straight away
    await settle(fixture);
    expect(h.days[0].date.getTime()).toBe(monday.getTime());   // the older load did not overwrite the newer week
    const day = h.days[0];
    expect(day.windows.map(x => x.w.profileId)).toEqual(['anita', 'bala']);
    expect(day.windows[0].sessions.map(r => r.appt.id).sort()).toEqual(['joint', 'xA']);
    expect(day.windows[1].sessions.map(r => r.appt.id).sort()).toEqual(['joint', 'xB']);   // collaborative: under both
    const who = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="sas-home-window-who"]')).map((e: any) => e.textContent.trim());
    expect(who).toEqual(['anita', 'bala']);
  });
});

/* ================================================================ Home: filters, Day view, bulk delete */
describe('HomeTab · filters, Day view and bulk delete', () => {
  let h: HomeTab, fixture: ComponentFixture<SpecialistAppointmentStudioComponent>;
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + 2);
  const at = (hr: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hr, m);
  const slot = (typeId: string, hr: number, m: number, len: number, booked = false) =>
    ({ typeId, start: at(hr, m), end: new Date(at(hr, m).getTime() + len * 60000), booked, available: !booked });
  // w1 offers a (60 min) and b (30 min), one a-slot booked; w2 offers only b, nothing booked.
  const w1: any = { id: 'w1', profileId: 'me', start: at(9), end: at(11), typeIds: ['a', 'b'],
    slots: [slot('a', 9, 0, 60, true), slot('a', 10, 0, 60), slot('b', 9, 0, 30), slot('b', 10, 0, 30)] };
  const w2: any = { id: 'w2', profileId: 'me', start: at(14), end: at(15), typeIds: ['b'], slots: [slot('b', 14, 0, 30), slot('b', 14, 30, 30)] };
  const booking: ApptRow = { raw: {}, appt: { id: 'x1', start: at(9), end: at(10), attended: false, cancelled: false, cancelledReason: null,
    hostIds: ['me'], participantId: 'p', typeId: 'a', productId: 'P1', zoomUrl: null } };

  beforeEach(async () => {
    const svc = fakeSvc({
      roles: { eis: true }, mapAppointment: { a: 'Kick-off', b: 'Review' }, mapAppointmentData: { a: { duration: 60 }, b: { duration: 30 } },
      windows: () => Promise.resolve([w1, w2]), appointments: () => Promise.resolve([booking]),
    });
    let c: SpecialistAppointmentStudioComponent;
    ({ fixture, c } = await make(svc));
    h = c.home!;
    h.gotoDay(day);
    await settle(fixture);
  });

  it('a calendar date opens Day view with one column per delivery type', () => {
    expect(h.period.mode).toBe('day');
    expect(h.dayCols.map(x => x.typeId)).toEqual(['a', 'b']);
    expect(h.dayCols[0].entries.length).toBe(2);
    expect(h.entryStatus(h.dayCols[0].entries[0])).toBe('Booked');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="sas-home-day-col"]').length).toBe(2);
  });

  it('a type filter keeps only matching slots and counts hours from them', () => {
    h.onFilter({ productId: null, typeIds: ['a'], booked: 'all' });
    expect(h.dayCols.map(x => x.typeId)).toEqual(['a']);
    expect(h.hours!.availMin).toBe(120);
    h.onFilter({ productId: null, typeIds: null, booked: 'all' });
    expect(h.hours!.availMin).toBe(180);
  });

  it('Booked / Not booked narrows the calendar but not the stats', () => {
    h.onFilter({ productId: null, typeIds: null, booked: 'booked' });
    expect(h.dayCols.flatMap(x => x.entries).every(e => e.booked)).toBeTrue();
    expect(h.hours!.availMin).toBe(180);
    h.onFilter({ productId: null, typeIds: null, booked: 'open' });
    expect(h.dayCols.flatMap(x => x.entries).every(e => !e.booked)).toBeTrue();
  });

  it('Sort by time puts the day\'s slots in one time-ordered list', () => {
    h.setGroup('time');
    expect(h.dayCols.length).toBe(1);
    expect(h.dayCols[0].typeId).toBe('');
    const starts = h.dayCols[0].entries.map(e => e.start.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('a filtered Week lists slots, so Booked and Not booked never show the same one', async () => {
    h.bar.emit(periodOf('week', day));
    await settle(fixture);
    h.onFilter({ productId: null, typeIds: null, booked: 'booked' });
    expect(h.slotMode).toBeTrue();
    const booked = h.slotDays.flatMap(d => d.cols.flatMap(x => x.entries));
    h.onFilter({ productId: null, typeIds: null, booked: 'open' });
    const open = h.slotDays.flatMap(d => d.cols.flatMap(x => x.entries));
    expect(booked.length).toBe(1);
    expect(open.length).toBe(5);
    expect(open.some(o => booked.some(b => b.start.getTime() === o.start.getTime() && b.typeId === o.typeId))).toBeFalse();
    h.onFilter({ productId: null, typeIds: null, booked: 'all' });
    expect(h.slotMode).toBeFalse();
  });

  it('Select all picks only future windows with nothing booked', () => {
    expect(h.availList.map(w => w.id)).toEqual(['w1', 'w2']);
    h.toggleAll();
    expect([...h.selected]).toEqual(['w2']);
    h.toggleAll();
    expect(h.selected.size).toBe(0);
  });
});

/* ================================================================ Team table */
describe('TeamTable', () => {
  const base = new Date(); base.setDate(base.getDate() + 7); base.setHours(0, 0, 0, 0);
  const at = (hr: number, dayOffset = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hr);
  const win = (id: string, s: number, e: number, d = 0): AvailWindow => ({
    id, profileId: 'eis1', start: at(s, d), end: at(e, d), typeIds: ['t1'],
    slots: [{ typeId: 't1', start: at(s, d), end: at(s + 1, d), booked: false, available: true }],
  });
  const row = (id: string, hr: number, d = 0, over: Partial<Appt> = {}): ApptRow => ({ raw: {}, appt: {
    id, start: at(hr, d), end: at(hr + 1, d), attended: false, cancelled: false, cancelledReason: null,
    hostIds: ['eis1'], participantId: 'p1', typeId: 't1', productId: 'prod', zoomUrl: null, ...over } });
  let fixture: ComponentFixture<SpecialistAppointmentStudioComponent>, tt: TeamTable;

  beforeEach(async () => {
    const svc = fakeSvc({
      roles: { mentor: true, productowner: ['M'] }, mapAppointment: { t1: 'EI Implementation' },
      name: (id: string) => ({ eis1: 'Anita Desai', p1: 'Aditi Sharma' } as any)[id] ?? '—',
      windows: () => Promise.resolve([win('w2', 14, 16, 1), win('w1', 9, 12)]),
      appointments: () => Promise.resolve([row('a1', 10), row('a2', 15, 1, { cancelled: true }), row('a3', 18, 2)]),
      productsFor: () => Promise.resolve([]), teamForAtcModels: () => Promise.resolve({ productIds: ['prod'], memberIds: ['eis1'] }),
    });
    let c: SpecialistAppointmentStudioComponent;
    ({ fixture, c } = await make(svc));
    c.go('team');
    await settle(fixture);
    tt = c.team!.table!;
    c.team!.bar.emit(periodOf('month', base));
    await settle(fixture);
  });

  it('lists every window in time order with the sessions booked inside it', () => {
    const r = tt.rows[0];
    expect(r.avail.map(a => a.w.id)).toEqual(['w1', 'w2']);
    expect(r.avail[0].sessions.map(s => s.appt.id)).toEqual(['a1']);
    expect(r.avail[1].sessions.map(s => s.appt.id)).toEqual(['a2']);
    expect(r.outside.map(s => s.appt.id)).toEqual(['a3']);
  });

  it('shows availability, type, participant and status when a name is opened', () => {
    tt.toggle('eis1');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('[data-testid="sas-tt-avail-row"]').length).toBe(2);
    const bookings = Array.from(el.querySelectorAll('[data-testid="sas-tt-booking"]')).map(b => b.textContent ?? '');
    expect(bookings.length).toBe(3);
    expect(bookings[0]).toContain('EI Implementation');
    expect(bookings[0]).toContain('Aditi Sharma');
    expect(bookings[1]).toContain('Cancelled');
    expect(el.querySelector('[data-testid="sas-tt-outside-row"]')).toBeTruthy();
  });

  it('filters by name without reloading', () => {
    tt.q = 'zzz';
    expect(tt.rows.length).toBe(1);
    expect(tt.shown.length).toBe(0);
    tt.q = 'aditi';
    expect(tt.shown.length).toBe(1);
  });
});

/* ================================================================ Add availability dialog */
describe('AddDialog', () => {
  let c: SpecialistAppointmentStudioComponent, a: AddDialog, blocked: string | null;
  const tomorrow = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; };

  beforeEach(async () => {
    blocked = null;
    const svc = fakeSvc({
      typesFor: () => Promise.resolve([
        { path: 'appointmenttype/a', id: 'a', name: 'Consultation', duration: 60 },
        { path: 'appointmenttype/b', id: 'b', name: 'Diagnostics', duration: 120 },
      ]),
      unmarkedLastAppointment: () => Promise.resolve(blocked),
    });
    ({ c } = await make(svc, { template: '', init: false }));
    a = new AddDialog(c, { profileId: 'p1', specialists: [] });
    a.ref = { close: jasmine.createSpy('close') } as any;
    await a.loadProfile();
  });

  it('loads only the types mapped to the specialist', () => {
    expect(a.types.map(t => t.name)).toEqual(['Consultation', 'Diagnostics']);
  });

  it('starts on Auto configuration and asks for types, then dates, before saving', async () => {
    expect(a.mode).toBe('auto');
    await a.save();
    expect(a.error).toContain('delivery type');
    a.toggleType(a.types[0]);
    await a.save();
    expect(a.error).toContain('dates');
  });

  it('Select all ticks every delivery type, and again clears them', () => {
    a.toggleAllTypes();
    expect(a.allPicked).toBeTrue();
    expect(a.picked.size).toBe(a.types.length);
    a.toggleAllTypes();
    expect(a.picked.size).toBe(0);
  });

  it('auto mode needs the longest selected type to fit', async () => {
    a.types.forEach(t => a.toggleType(t));
    a.pickDay(tomorrow()); a.pickDay(tomorrow());
    a.startTime = '09:00'; a.endTime = '10:00';
    await a.save();
    expect(a.error).toContain('120 Minutes');
  });

  it('previews computeSlot start times in auto mode', () => {
    a.toggleType(a.types[0]);
    a.pickDay(tomorrow()); a.pickDay(tomorrow());
    a.startTime = '09:00'; a.endTime = '11:00';
    expect(a.preview()[0].starts.length).toBe(3);
  });

  it('static: each slot ends after its delivery type\'s duration; a new slot starts empty', () => {
    const d = tomorrow();
    a.mode = 'static';
    a.pickDay(d); a.pickDay(d);
    const rows = a.rowsFor(d);
    expect(rows).toEqual([{ typePath: null, start: '' }]);
    rows[0].typePath = 'appointmenttype/b'; rows[0].start = '09:00';
    expect(a.rowEndMin(rows[0])).toBe(11 * 60);
    a.addRow(d);
    expect(a.rowsFor(d)[1]).toEqual({ typePath: null, start: '' });
    expect(a.rowEnd(a.rowsFor(d)[1])).toBe('—');
  });

  it('static: each picked day has its own slots, and Copy fills the rest', () => {
    const d = tomorrow(), d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    a.mode = 'static';
    a.pickDay(d); a.pickDay(d2);
    a.rowsFor(d)[0] = { typePath: 'appointmenttype/a', start: '09:00' };
    expect(a.rowsFor(d2)[0].typePath).toBeNull();
    a.copyToAll();
    expect(a.rowsFor(d2)).toEqual([{ typePath: 'appointmenttype/a', start: '09:00' }]);
    a.rowsFor(d2)[0].start = '14:00';
    expect(a.rowsFor(d)[0].start).toBe('09:00');
  });

  it('static: rejects slots that overlap on the same day', async () => {
    const d = tomorrow();
    a.mode = 'static';
    a.pickDay(d); a.pickDay(d);
    a.rowsFor(d).splice(0, 1, { typePath: 'appointmenttype/b', start: '09:00' }, { typePath: 'appointmenttype/a', start: '10:00' });
    await a.save();
    expect(a.error).toContain('slots 1 and 2 overlap');
  });

  it('static: writes one doc per slot, each day with its own slots', () => {
    const d = tomorrow(), d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    a.mode = 'static';
    a.pickDay(d); a.pickDay(d2);
    a.rowsFor(d).splice(0, 1, { typePath: 'appointmenttype/b', start: '09:00' }, { typePath: 'appointmenttype/a', start: '13:00' });
    a.rowsFor(d2).splice(0, 1, { typePath: 'appointmenttype/a', start: '11:00' });
    const out = a.intervals();
    expect(out.length).toBe(3);
    expect(out[0].e.getHours()).toBe(11);
    expect(out[2].s.getDate()).toBe(d2.getDate());
    expect(out[2].s.getHours()).toBe(11);
  });

  it('a range calendar pick sets start then end', () => {
    const x = tomorrow(), y = new Date(x); y.setDate(y.getDate() + 3);
    a.pickDay(x);
    expect(a.picking).toBeTrue();
    a.pickDay(y);
    expect(a.picking).toBeFalse();
    expect(a.dates().length).toBe(4);
  });

  it('blocks saving while the last appointment is unmarked', async () => {
    blocked = 'EI Diagnostics';
    await a.loadProfile();
    await a.save();
    expect(a.error).toContain("'EI Diagnostics'");
  });

  it('A&H gets a searchable specialist picker first', () => {
    const pick = new AddDialog(c, { profileId: null, specialists: [{ profileId: 's1', name: 'Priya', role: 'cw', productowner: [] }] });
    expect(pick.picker?.people.map(p => p.name)).toEqual(['Priya']);
    expect(pick.profileId).toBeNull();
  });
});

describe('AddDialog · rendered', () => {
  it('shows only the picker until a specialist is chosen, then a working type dropdown', async () => {
    const svc = fakeSvc({ roles: { scheduler: true },
      typesFor: () => Promise.resolve([{ path: 'appointmenttype/a', id: 'a', name: 'Consultation', duration: 60 }, { path: 'appointmenttype/b', id: 'b', name: 'Diagnostics', duration: 120 }]) });
    const { fixture, c } = await make(svc);
    c.openAdd({ profileId: null, specialists: [{ profileId: 'p1', name: 'Priya', role: 'cw', productowner: [] }] });
    await settle(fixture);
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    expect(q('sas-add-pick-first')).toBeTruthy();
    expect(q('sas-add-calendar')).toBeNull();
    expect((q('sas-add-save') as HTMLButtonElement).disabled).toBeTrue();

    c.add!.picker!.pick('p1');
    await settle(fixture);
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1);
    c.add!.mode = 'static';
    c.add!.pickDay(d); c.add!.pickDay(d);
    await settle(fixture);
    (document.querySelector('[data-testid="sas-add-slot-type"] .mat-mdc-select-trigger') as HTMLElement).click();
    await settle(fixture);
    const options = Array.from(document.querySelectorAll('[data-testid="sas-add-slot-type-option"]')) as HTMLElement[];
    expect(options.length).toBe(2);
    options[1].click();
    await settle(fixture);
    expect(c.add!.rowsFor(d)[0].typePath).toBe('appointmenttype/b');
    c.add!.close();
    await settle(fixture);
  });
});

/* ================================================================ Availability details dialog */
describe('WindowDialog', () => {
  const at = (hr: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hr, 0, 0, 0); return d; };
  const slot = (typeId: string, hr: number, booked = false) => ({ typeId, start: at(hr), end: at(hr + 1), booked, available: !booked });
  const w = (booked: boolean): AvailWindow => ({ id: 'w', profileId: 'anita', start: at(9), end: at(12), typeIds: ['a', 'b'],
    slots: [slot('a', 9, booked), slot('a', 10), slot('b', 9)] });
  let c: SpecialistAppointmentStudioComponent;

  beforeEach(async () => {
    ({ c } = await make(fakeSvc({ mapAppointmentData: { a: { appointmenttype: 'Kick-off', duration: 60 }, b: { appointmenttype: 'Review', duration: 30 } } }),
      { template: '', init: false }));
  });

  it('lists every delivery type with slots given, booked and still open', () => {
    const d = new WindowDialog(c, w(false), []);
    expect(d.types.map(t => [t.name, t.duration, t.given, t.booked, t.open])).toEqual([['Kick-off', 60, 2, 0, 2], ['Review', 30, 1, 0, 1]]);
  });

  it('offers Delete only while nothing is booked', () => {
    expect(new WindowDialog(c, w(false), []).canDelete).toBeTrue();
    expect(new WindowDialog(c, w(true), []).canDelete).toBeFalse();
  });
});

/* ================================================================ shared pieces */
describe('FilterBar', () => {
  let fb: FilterBar, out: any[];
  beforeEach(async () => {
    out = [];
    const svc = fakeSvc({ filterOptions: () => Promise.resolve({
      products: [{ id: 'P1', name: 'Leadership', typeIds: ['a', 'b'] }, { id: 'P2', name: 'Empty', typeIds: [] }],
      types: [{ id: 'a', name: 'Kick-off', duration: 60 }, { id: 'b', name: 'Review', duration: 30 }, { id: 'c', name: 'Other', duration: 45 }],
    }) });
    fb = new FilterBar(svc, 'all', 'me', true, f => out.push(f));
    await fb.ready;
  });

  it('a picked product limits the type list to its own types, all ticked', () => {
    expect(fb.shownTypes.map(t => t.id)).toEqual(['a', 'b', 'c']);
    fb.productId = 'P1';
    fb.onProduct();
    expect(fb.shownTypes.map(t => t.id)).toEqual(['a', 'b']);
    expect(out.pop()).toEqual({ productId: 'P1', typeIds: ['a', 'b'], booked: 'all' });
  });

  it('a product with no types you can give filters to nothing', () => {
    fb.productId = 'P2';
    fb.onProduct();
    expect(out.pop().typeIds).toEqual([]);
  });

  it('Booked / Not booked, and Clear resets everything', () => {
    fb.setBooked('open');
    expect(out.pop().booked).toBe('open');
    fb.clear();
    expect(out.pop()).toEqual({ productId: null, typeIds: null, booked: 'all' });
  });
});

describe('PersonPicker and PeriodBar', () => {
  it('PersonPicker filters names by the search text and emits the pick', () => {
    const out: (string | null)[] = [];
    const p = new PersonPicker([{ id: '1', name: 'Priya Shah' }, { id: '2', name: 'Ravi Menon' }, { id: '3', name: 'Priyanka Rao' }], null, v => out.push(v), 'x', 'y');
    p.q = 'pri';
    expect(p.shown.map(x => x.id)).toEqual(['1', '3']);
    p.pick('3');
    p.pick(undefined as any);           // the search row
    expect(out).toEqual(['3']);
  });

  it('PeriodBar moves by week, day or month and Today opens Day on the calendar screens', () => {
    const got: Period[] = [];
    const wk = new PeriodBar(periodOf('week', new Date(2026, 8, 30)), p => got.push(p));
    wk.shift(1);
    expect(got.pop()!.from.getTime()).toBe(new Date(2026, 9, 5).getTime());
    wk.setMode('month');
    expect(got.pop()!.from.getMonth()).toBe(9);
    wk.today();
    expect(got.pop()!.mode).toBe('month');
    const cal = new PeriodBar(periodOf('day', new Date(2026, 8, 30)), p => got.push(p), true);
    cal.shift(1);
    expect(got.pop()!.from.getTime()).toBe(new Date(2026, 9, 1).getTime());
    cal.today();
    expect(got.pop()!.from.getTime()).toBe(periodOf('day', new Date()).from.getTime());
  });
});

/* ================================================================ Book Session */
describe('BookTab · calendar', () => {
  const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + 1);
  const at = (hr: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hr);
  const slot = (hr: number, booked = false, index = 0) => ({ typeId: 't', start: at(hr), end: at(hr + 1), booked, available: !booked, index });
  const wins = [
    { id: 'wa', profileId: 'anu', start: at(9), end: at(12), typeIds: ['t'], slots: [slot(9, false, 0), slot(10, true, 1)] },
    { id: 'wr', profileId: 'ravi', start: at(9), end: at(12), typeIds: ['t'], slots: [slot(9, false, 0), slot(10, false, 1)] },
  ];

  it('needs a product and a delivery type, then shows collaborative times only when every role is free', async () => {
    const real = new AppointmentBookingService({} as any);
    const booking = {
      typeRoles: () => Promise.resolve({ required: ['diag', 'impl'], additional: [], eis: { diag: ['profile_data/anu'], impl: ['profile_data/ravi'] } }),
      mergeSlots: real.mergeSlots.bind(real),
    };
    const { c } = await make(fakeSvc({ windows: () => Promise.resolve(wins), mapAppointment: { t: 'Joint review' } }), { template: '', init: false, booking });
    const b = new BookTab(c);
    expect(b.ready).toBeFalse();
    b.filter = { productId: 'P', typeIds: ['t'], booked: 'all' };
    b.bar.period = { mode: 'day', from: day, to: new Date(day.getTime() + 86400000) };
    await b.load();
    const slots = b.days[0].groups.flatMap(g => g.slots);
    expect(slots.map(x => x.slot.start.getHours())).toEqual([9]);       // 10:00 — anu is booked
    expect(slots[0].slot.specialist).toBe('anu, ravi');
  });
});

describe('BookSlotDialog', () => {
  it('lists only participants who fit the slot, and books the picked one', async () => {
    const base: TypeRoles = { required: ['diag'], additional: [], eis: { diag: ['profile_data/anu'] } };
    const slot = { start: new Date(2026, 9, 6, 9), end: new Date(2026, 9, 6, 10), specialist: 'anu', eisprofiles: ['profile_data/anu'], docdata: [{ id: 'd', index: 0 }] };
    const who = (id: string, mapped: any = null): Bookable => ({ participantId: id, mapped, target: { id: 't' } as any });
    const real = new AppointmentBookingService({} as any);
    const book = jasmine.createSpy('book').and.returnValue(Promise.resolve('booked'));
    const { c } = await make(fakeSvc({ profileId: 'admin', mapAppointment: { t: 'Kick-off' } }),
      { template: '', init: false, booking: { planForSlot: real.planForSlot.bind(real), book } });
    const d = new BookSlotDialog(c, { typeId: 't', productId: 'P', slot, base,
      bookables: Promise.resolve([who('p1'), who('p2', { diag: [{ path: 'profile_data/ravi' }] }), who('p3')]) });
    const close = jasmine.createSpy('close');
    d.ref = { close } as any;
    await d.ready;
    expect(d.picker!.people.map(p => p.id)).toEqual(['p1', 'p3']);
    expect(d.excluded).toBe(1);
    d.picker!.pick('p3');
    await d.book();
    expect(book.calls.mostRecent().args[0].participantId).toBe('p3');
    expect(book.calls.mostRecent().args[0].loggedinPID).toBe('admin');
    expect(close).toHaveBeenCalledWith(true);
  });
});

/* ================================================================ Delivery Type Details */
describe('SettingsTab', () => {
  it('lists delivery types sorted and filters by search', async () => {
    const { c } = await make(fakeSvc({ mapAppointmentData: {
      b: { appointmenttype: 'W!SH Diagnostics', duration: 120, ischangeworkrequired: true },
      a: { appointmenttype: 'Consultation', duration: 60, groupappointment: true, maxbooking: 5 },
    } }), { template: '', init: false });
    const s = new SettingsTab(c);
    await s.init();
    expect(s.rows.map(r => r.name)).toEqual(['Consultation', 'W!SH Diagnostics']);
    s.q = 'wish';
    expect(s.shown.length).toBe(0);
    s.q = 'w!sh';
    expect(s.shown.length).toBe(1);
  });
});
