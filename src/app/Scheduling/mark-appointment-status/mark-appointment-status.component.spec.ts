import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarkAppointmentStatusComponent } from './mark-appointment-status.component';

describe('MarkAppointmentStatusComponent', () => {
  let component: MarkAppointmentStatusComponent;
  let fixture: ComponentFixture<MarkAppointmentStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkAppointmentStatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MarkAppointmentStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
