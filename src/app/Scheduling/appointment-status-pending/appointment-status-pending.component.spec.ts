import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentStatusPendingComponent } from './appointment-status-pending.component';

describe('AppointmentStatusPendingComponent', () => {
  let component: AppointmentStatusPendingComponent;
  let fixture: ComponentFixture<AppointmentStatusPendingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentStatusPendingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentStatusPendingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
