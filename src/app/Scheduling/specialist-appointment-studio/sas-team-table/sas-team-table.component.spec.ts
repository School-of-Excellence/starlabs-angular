import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { SasTeamTableComponent } from './sas-team-table.component';
import { SpecialistAppointmentService, ApptRow } from '../specialist-appointment.service';
import { AvailWindow, Appt, periodOf } from '../sas-logic';

describe('SasTeamTableComponent', () => {
  let fixture: ComponentFixture<SasTeamTableComponent>;
  let component: SasTeamTableComponent;

  // Next week, so every window and session is in the future.
  const base = new Date(); base.setDate(base.getDate() + 7); base.setHours(0, 0, 0, 0);
  const at = (h: number, dayOffset = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h);
  const win = (id: string, s: number, e: number, day = 0): AvailWindow => ({
    id, profileId: 'eis1', start: at(s, day), end: at(e, day), typeIds: ['t1'],
    slots: [{ typeId: 't1', start: at(s, day), end: at(s + 1, day), booked: false, available: true }],
  });
  const row = (id: string, h: number, day = 0, over: Partial<Appt> = {}): ApptRow => ({
    raw: {}, appt: {
      id, start: at(h, day), end: at(h + 1, day), attended: false, cancelled: false, cancelledReason: null,
      hostIds: ['eis1'], participantId: 'p1', typeId: 't1', productId: 'prod', zoomUrl: null, ...over,
    },
  });

  beforeEach(async () => {
    const wins = [win('w2', 14, 16, 1), win('w1', 9, 12)];
    const appts = [row('a1', 10), row('a2', 15, 1, { cancelled: true }), row('a3', 18, 2)];
    const fake = {
      windows: () => Promise.resolve(wins),
      appointments: (_ids: string[], from: Date) => Promise.resolve(from.getTime() >= base.getTime() - 86400000 * 8 ? appts : []),
      productMap: () => Promise.resolve({ prod: 'EI Solutions' }),
      mapAppointment: { t1: 'EI Implementation' },
      name: (id: string) => ({ eis1: 'Anita Desai', p1: 'Aditi Sharma' } as any)[id] ?? '—',
    };
    await TestBed.configureTestingModule({
      imports: [SasTeamTableComponent],
      providers: [{ provide: SpecialistAppointmentService, useValue: fake }],
    }).compileComponents();
    fixture = TestBed.createComponent(SasTeamTableComponent);
    component = fixture.componentInstance;
    component.members = ['eis1'];
    component.period = periodOf('month', base);
    await component.ngOnChanges({ members: new SimpleChange(null, ['eis1'], true) });
    fixture.detectChanges();
  });

  it('lists every window in time order with the sessions booked inside it', () => {
    const r = component.rows[0];
    expect(r.avail.map(a => a.w.id)).toEqual(['w1', 'w2']);
    expect(r.avail[0].sessions.map(s => s.appt.id)).toEqual(['a1']);
    expect(r.avail[1].sessions.map(s => s.appt.id)).toEqual(['a2']);
    expect(r.outside.map(s => s.appt.id)).toEqual(['a3']);
  });

  it('shows availability, type, participant and status when a name is opened', () => {
    component.toggle('eis1');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('[data-testid="stt-avail-row"]').length).toBe(2);
    const bookings = Array.from(el.querySelectorAll('[data-testid="stt-booking"]')).map(b => b.textContent ?? '');
    expect(bookings.length).toBe(3);
    expect(bookings[0]).toContain('EI Implementation');
    expect(bookings[0]).toContain('Aditi Sharma');
    expect(bookings[1]).toContain('Cancelled');
    expect(el.querySelector('[data-testid="stt-outside-row"]')).toBeTruthy();
  });

  it('filters by name without reloading', async () => {
    component.q = 'zzz';
    await component.ngOnChanges({ q: new SimpleChange('', 'zzz', false) });
    expect(component.rows.length).toBe(1);
    expect(component.shown.length).toBe(0);
    component.q = 'aditi';
    expect(component.shown.length).toBe(1);
  });
});
