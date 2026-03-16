import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MarkAppointmentProcedureComponent } from './mark-appointment-procedure.component';

describe('MarkAppointmentProcedureComponent', () => {
  let component: MarkAppointmentProcedureComponent;
  let fixture: ComponentFixture<MarkAppointmentProcedureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarkAppointmentProcedureComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MarkAppointmentProcedureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
