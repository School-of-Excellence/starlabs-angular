import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EisAppointmentRoleDialogComponent } from './eis-appointment-role-dialog.component';

describe('EisAppointmentRoleDialogComponent', () => {
  let component: EisAppointmentRoleDialogComponent;
  let fixture: ComponentFixture<EisAppointmentRoleDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EisAppointmentRoleDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EisAppointmentRoleDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
