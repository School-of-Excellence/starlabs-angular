import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { AuthguardService } from '../../../authguard.service';
import { SasHomeComponent } from './sas-home.component';
import { SpecialistAppointmentService, ApptRow } from '../specialist-appointment.service';
import { Appt, NO_SHOW_REASON } from '../sas-logic';

describe('SasHomeComponent · past sessions', () => {
  let fixture: ComponentFixture<SasHomeComponent>;
  let component: SasHomeComponent;
  let pageCalls: number;

  // 60 past appointments, newest first: every 3rd is unmarked (pending), every 3rd+1 completed,
  // every 3rd+2 cancelled — half of those as no-shows.
  const history: ApptRow[] = Array.from({ length: 60 }, (_, i) => {
    const end = new Date(Date.now() - (i + 1) * 3600000);
    const k = i % 3;
    const appt: Appt = {
      id: 'a' + i, start: new Date(end.getTime() - 3600000), end, attended: k === 1, cancelled: k === 2,
      cancelledReason: k === 2 ? (i % 2 ? NO_SHOW_REASON : 'Cancelled By Client') : null,
      hostIds: ['me'], participantId: 'p', typeId: 't', productId: null, zoomUrl: null,
    };
    return { appt, raw: {} };
  });

  beforeEach(async () => {
    pageCalls = 0;
    const fake = {
      init: () => Promise.resolve(), profileId: 'me', viewRole: 'cw', roles: {},
      name: () => 'X', mapAppointment: { t: 'Journey Coach' },
      windows: () => Promise.resolve([]),
      appointments: () => Promise.resolve([]),
      pastPage: (_h: string | null, cursor: any, size: number) => {
        pageCalls++;
        const from = cursor ?? 0, rows = history.slice(from, from + size);
        return Promise.resolve({ rows, cursor: from + rows.length, done: from + size >= history.length });
      },
    };
    await TestBed.configureTestingModule({
      imports: [SasHomeComponent, NoopAnimationsModule],
      providers: [
        DatePipe,
        provideRouter([]),
        { provide: SpecialistAppointmentService, useValue: fake },
        { provide: AuthguardService, useValue: {} },
        { provide: Firestore, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SasHomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();              // ngOnInit → load() → loadPast(true)
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads only the first page of pending sessions', () => {
    // 25 appointments are read per Firestore page, so a page can add a few more than 10 matches.
    expect(component.past.length).toBeGreaterThanOrEqual(10);
    expect(component.past.length).toBeLessThan(20);
    expect(component.past.every(r => !r.appt.attended && !r.appt.cancelled)).toBeTrue();
    expect(component.pastDone).toBeFalse();
    expect(fixture.nativeElement.querySelector('[data-testid="sah-past-more"]')).toBeTruthy();
  });

  it('adds the next page on Load more, and stops when history runs out', async () => {
    const first = component.past.length;
    await component.loadPast(false);
    expect(component.past.length).toBeGreaterThan(first);
    while (!component.pastDone) await component.loadPast(false);
    expect(component.past.length).toBe(20);          // every pending session, once
    expect(new Set(component.past.map(r => r.appt.id)).size).toBe(component.past.length);
  });

  it('Join opens the appointment in AppointmentZoomView, in a new tab', () => {
    const open = spyOn(window, 'open');
    const row = { appt: { ...history[0].appt, id: 'APPT1' }, raw: { zoomdata: { id: 123 } } };
    component.join(row);
    expect(open).toHaveBeenCalledWith('/openappointmentzoom/APPT1', '_blank');
  });

  it('Join does not open a tab when the session has no Zoom meeting', () => {
    const open = spyOn(window, 'open');
    component.join({ appt: history[0].appt, raw: {} });
    expect(open).not.toHaveBeenCalled();
  });

  it('starts again when the filter changes, and never says no-show', async () => {
    component.pastFilter = 'cancelled';
    await component.loadPast(true);
    fixture.detectChanges();
    expect(component.past.every(r => r.appt.cancelled)).toBeTrue();
    const text: string = fixture.nativeElement.textContent;
    expect(text.toLowerCase()).not.toContain('no-show');
    expect(text).not.toContain(NO_SHOW_REASON);
  });
});

describe('SasHomeComponent · calendar for all specialists', () => {
  it('shows every specialist\'s windows, each booking under its own specialist\'s window', async () => {
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 7);
    const at = (h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), h);
    const win = (id: string, who: string): any => ({ id, profileId: who, start: at(9), end: at(12), typeIds: ['t'], slots: [] });
    const row = (id: string, who: string): ApptRow => ({ raw: {}, appt: {
      id, start: at(10), end: at(11), attended: false, cancelled: false, cancelledReason: null,
      hostIds: [who], participantId: 'p', typeId: 't', productId: null, zoomUrl: null } });
    const fake = {
      init: () => Promise.resolve(), profileId: 'admin', viewRole: 'ah', roles: {}, name: (id: string) => id, mapAppointment: {},
      specialists: () => Promise.resolve([]),
      windows: () => Promise.resolve([win('wA', 'anita'), win('wB', 'bala')]),
      appointments: () => Promise.resolve([row('xB', 'bala'), row('xA', 'anita')]),
      pastPage: () => Promise.resolve({ rows: [], cursor: null, done: true }),
    };
    await TestBed.configureTestingModule({
      imports: [SasHomeComponent, NoopAnimationsModule],
      providers: [DatePipe, provideRouter([]),
        { provide: SpecialistAppointmentService, useValue: fake }, { provide: AuthguardService, useValue: {} }, { provide: Firestore, useValue: {} }],
    }).compileComponents();
    const fixture = TestBed.createComponent(SasHomeComponent);
    const c = fixture.componentInstance;
    c.mode = 'all';
    fixture.detectChanges();                 // ngOnInit loads this week…
    c.onPeriod({ mode: 'week', from: monday, to: new Date(monday.getTime() + 7 * 86400000) });   // …then next week, straight away
    await fixture.whenStable();
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    expect(c.period.from.getTime()).toBe(monday.getTime());
    expect(c.days[0].date.getTime()).toBe(monday.getTime());   // the older load did not overwrite the newer week
    expect(c.showCalendar).toBeTrue();
    const day = c.days[0];
    expect(day.windows.map(x => x.w.profileId)).toEqual(['anita', 'bala']);
    expect(day.windows[0].sessions.map(r => r.appt.id)).toEqual(['xA']);
    expect(day.windows[1].sessions.map(r => r.appt.id)).toEqual(['xB']);
    const who = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="sah-window-who"]')).map((e: any) => e.textContent.trim());
    expect(who).toEqual(['anita', 'bala']);
  });
});
