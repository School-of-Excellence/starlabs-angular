import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentAvailabilityComponent } from './appointment-availability.component';

describe('AppointmentAvailabilityComponent', () => {
  let component: AppointmentAvailabilityComponent;
  let fixture: ComponentFixture<AppointmentAvailabilityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentAvailabilityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentAvailabilityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
