import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddAppointmentAvailabilityComponent } from './add-appointment-availability.component';

describe('AddAppointmentAvailabilityComponent', () => {
  let component: AddAppointmentAvailabilityComponent;
  let fixture: ComponentFixture<AddAppointmentAvailabilityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddAppointmentAvailabilityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddAppointmentAvailabilityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
