import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentStatusUpdateComponent } from './appointment-status-update.component';

describe('AppointmentStatusUpdateComponent', () => {
  let component: AppointmentStatusUpdateComponent;
  let fixture: ComponentFixture<AppointmentStatusUpdateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentStatusUpdateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentStatusUpdateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
