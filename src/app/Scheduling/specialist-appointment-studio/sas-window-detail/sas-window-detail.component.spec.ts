import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SasWindowDetailComponent } from './sas-window-detail.component';
import { SpecialistAppointmentService, ApptRow } from '../specialist-appointment.service';

describe('SasWindowDetailComponent', () => {
  const at = (h: number) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); return d; };
  const slot = (typeId: string, h: number, booked = false) => ({ typeId, start: at(h), end: at(h + 1), booked, available: !booked });
  const fake = { name: (id: string) => id, mapAppointment: { a: 'Kick-off' }, mapAppointmentData: { a: { appointmenttype: 'Kick-off', duration: 60 }, b: { appointmenttype: 'Review', duration: 30 } } };

  async function make(booked: boolean, sessions: ApptRow[] = []) {
    const close = jasmine.createSpy('close');
    await TestBed.configureTestingModule({
      imports: [SasWindowDetailComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { w: { id: 'w', profileId: 'anita', start: at(9), end: at(12), typeIds: ['a', 'b'],
          slots: [slot('a', 9, booked), slot('a', 10), slot('b', 9)] }, sessions } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: SpecialistAppointmentService, useValue: fake },
      ],
    }).compileComponents();
    const f: ComponentFixture<SasWindowDetailComponent> = TestBed.createComponent(SasWindowDetailComponent);
    f.detectChanges();
    return { f, close, q: (id: string) => f.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null };
  }

  it('lists every delivery type with slots given, booked and still open', async () => {
    const { f } = await make(false);
    const rows = Array.from(f.nativeElement.querySelectorAll('[data-testid="saw-type-row"]'))
      .map((r: any) => Array.from(r.querySelectorAll('td')).map((td: any) => td.textContent.trim()).join('|'));
    expect(rows).toEqual(['Kick-off|1h|2|0|2', 'Review|30 min|1|0|1']);
  });

  it('offers Delete only while nothing is booked', async () => {
    const free = await make(false);
    expect(free.q('saw-delete')).toBeTruthy();
    free.q('saw-delete')!.click();
    expect(free.close).toHaveBeenCalledWith({ delete: true });
    TestBed.resetTestingModule();
    const row: ApptRow = { raw: {}, appt: { id: 'x', start: at(9), end: at(10), attended: false, cancelled: false, cancelledReason: null,
      hostIds: ['anita'], participantId: 'p', typeId: 'a', productId: null, zoomUrl: null } };
    const taken = await make(true, [row]);
    expect(taken.q('saw-delete')).toBeNull();
    taken.q('saw-booking')!.click();
    expect(taken.close).toHaveBeenCalledWith({ open: row });
  });
});
