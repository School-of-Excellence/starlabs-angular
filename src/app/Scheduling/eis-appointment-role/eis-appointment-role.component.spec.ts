import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EisAppointmentRoleComponent } from './eis-appointment-role.component';

describe('EisAppointmentRoleComponent', () => {
  let component: EisAppointmentRoleComponent;
  let fixture: ComponentFixture<EisAppointmentRoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EisAppointmentRoleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EisAppointmentRoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
