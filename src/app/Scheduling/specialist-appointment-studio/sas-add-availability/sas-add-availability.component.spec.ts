import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Firestore } from '@angular/fire/firestore';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SasAddAvailabilityComponent } from './sas-add-availability.component';
import { SpecialistAppointmentService } from '../specialist-appointment.service';

describe('SasAddAvailabilityComponent', () => {
  let fixture: ComponentFixture<SasAddAvailabilityComponent>;
  let component: SasAddAvailabilityComponent;
  let blocked: string | null;

  const tomorrow = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; };

  beforeEach(async () => {
    blocked = null;
    const fake = {
      typesFor: () => Promise.resolve([
        { path: 'appointmenttype/a', id: 'a', name: 'Consultation', duration: 60 },
        { path: 'appointmenttype/b', id: 'b', name: 'Diagnostics', duration: 120 },
      ]),
      futureIntervals: () => Promise.resolve([]),
      unmarkedLastAppointment: () => Promise.resolve(blocked),
      name: () => 'X',
    };
    await TestBed.configureTestingModule({
      imports: [SasAddAvailabilityComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { profileId: 'p1', specialists: [] } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: Firestore, useValue: {} },
        { provide: SpecialistAppointmentService, useValue: fake },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SasAddAvailabilityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();          // ngOnInit → loadProfile()
    await fixture.whenStable();
  });

  it('loads only the types mapped to the specialist', () => {
    expect(component.types.map(t => t.name)).toEqual(['Consultation', 'Diagnostics']);
  });

  it('starts on Auto configuration and asks for types, then dates, before saving', async () => {
    expect(component.mode).toBe('auto');
    await component.save();
    expect(component.error).toContain('delivery type');
    component.toggleType(component.types[0]);
    await component.save();
    expect(component.error).toContain('dates');
  });

  it('auto mode needs the longest selected type to fit', async () => {
    component.mode = 'auto';
    component.types.forEach(t => component.toggleType(t));
    component.pickDay(tomorrow()); component.pickDay(tomorrow());
    component.startTime = '09:00'; component.endTime = '10:00';
    await component.save();
    expect(component.error).toContain('120 Minutes');
  });

  it('previews computeSlot start times in auto mode', () => {
    component.toggleType(component.types[0]);
    component.pickDay(tomorrow()); component.pickDay(tomorrow());
    component.startTime = '09:00'; component.endTime = '11:00';
    component.mode = 'auto';
    expect(component.preview()[0].starts.length).toBe(3);
  });

  it('static: each slot ends after its delivery type\'s duration; a new slot starts empty', () => {
    const d = tomorrow();
    component.mode = 'static';
    component.pickDay(d); component.pickDay(d);
    const rows = component.rowsFor(d);
    expect(rows).toEqual([{ typePath: null, start: '' }]);
    rows[0].typePath = 'appointmenttype/b'; rows[0].start = '09:00';          // Diagnostics, 120 min
    expect(component.rowEndMin(rows[0])).toBe(11 * 60);
    component.addRow(d);
    expect(component.rowsFor(d)[1]).toEqual({ typePath: null, start: '' });    // nothing picked for you
    expect(component.rowEnd(component.rowsFor(d)[1])).toBe('—');
  });

  it('static: each picked day has its own slots, and Copy fills the rest', () => {
    const d = tomorrow(), d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    component.mode = 'static';
    component.pickDay(d); component.pickDay(d2);
    component.rowsFor(d)[0] = { typePath: 'appointmenttype/a', start: '09:00' };
    expect(component.rowsFor(d2)[0].typePath).toBeNull();
    component.copyToAll();
    expect(component.rowsFor(d2)).toEqual([{ typePath: 'appointmenttype/a', start: '09:00' }]);
    component.rowsFor(d2)[0].start = '14:00';                                  // a copy, not the same object
    expect(component.rowsFor(d)[0].start).toBe('09:00');
  });

  it('static: rejects slots that overlap on the same day', async () => {
    const d = tomorrow();
    component.mode = 'static';
    component.pickDay(d); component.pickDay(d);
    component.rowsFor(d).splice(0, 1, { typePath: 'appointmenttype/b', start: '09:00' }, { typePath: 'appointmenttype/a', start: '10:00' });
    await component.save();
    expect(component.error).toContain('slots 1 and 2 overlap');
  });

  it('static: writes one fixed doc per slot, each day with its own slots', () => {
    const d = tomorrow(), d2 = new Date(d); d2.setDate(d2.getDate() + 1);
    component.mode = 'static';
    component.pickDay(d); component.pickDay(d2);
    component.rowsFor(d).splice(0, 1, { typePath: 'appointmenttype/b', start: '09:00' }, { typePath: 'appointmenttype/a', start: '13:00' });
    component.rowsFor(d2).splice(0, 1, { typePath: 'appointmenttype/a', start: '11:00' });
    const out = (component as any).intervals();
    expect(out.length).toBe(3);
    expect(out[0].e.getHours()).toBe(11);
    expect(out[2].s.getDate()).toBe(d2.getDate());
    expect(out[2].s.getHours()).toBe(11);
  });

  it('static: the delivery type dropdown opens and a pick sets the slot type', async () => {
    const d = tomorrow();
    component.mode = 'static';
    component.pickDay(d); component.pickDay(d);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('[data-testid="saa-slot-type"] .mat-mdc-select-trigger') as HTMLElement;
    expect(trigger).toBeTruthy();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll('[data-testid="saa-slot-type-option"]')) as HTMLElement[];
    expect(options.length).toBe(2);
    options[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.rowsFor(d)[0].typePath).toBe('appointmenttype/b');
  });

  it('static: says why when the specialist has no delivery types', () => {
    component.types = [];
    component.mode = 'static';
    component.pickDay(tomorrow()); component.pickDay(tomorrow());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="saa-slot-type"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No delivery types are mapped');
  });

  it('shows only the specialist picker until a specialist is chosen', async () => {
    component.profileId = null;
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="saa-pick-first"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="saa-calendar"]')).toBeNull();
    expect(el.querySelector('[data-testid="saa-mode-auto"]')).toBeNull();
    expect((el.querySelector('[data-testid="saa-save"]') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('a range calendar pick sets start then end', () => {
    const a = tomorrow(), b = new Date(a); b.setDate(b.getDate() + 3);
    component.pickDay(a);
    expect(component.picking).toBeTrue();
    component.pickDay(b);
    expect(component.picking).toBeFalse();
    expect(component.dates().length).toBe(4);
  });

  it('blocks saving while the last appointment is unmarked', async () => {
    blocked = 'EI Diagnostics';
    await component.loadProfile();
    await component.save();
    expect(component.error).toContain("'EI Diagnostics'");
  });
});
