import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SasSettingsComponent } from './sas-settings.component';
import { SpecialistAppointmentService } from '../specialist-appointment.service';

describe('SasSettingsComponent', () => {
  let fixture: ComponentFixture<SasSettingsComponent>;
  let component: SasSettingsComponent;

  beforeEach(async () => {
    const fake = {
      init: () => Promise.resolve(),
      mapAppointmentData: {
        b: { appointmenttype: 'W!SH Diagnostics', duration: 120, ischangeworkrequired: true },
        a: { appointmenttype: 'Consultation', duration: 60, groupappointment: true, maxbooking: 5 },
      },
    };
    await TestBed.configureTestingModule({
      imports: [SasSettingsComponent],
      providers: [{ provide: SpecialistAppointmentService, useValue: fake }],
    }).compileComponents();
    fixture = TestBed.createComponent(SasSettingsComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();
  });

  it('lists delivery types sorted, view only', () => {
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="sst-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Consultation');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('filters by search', () => {
    component.q = 'wish';
    expect(component.shown.length).toBe(0);
    component.q = 'w!sh';
    expect(component.shown.length).toBe(1);
  });
});
