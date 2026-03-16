import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentRolesComponent } from './appointment-roles.component';

describe('AppointmentRolesComponent', () => {
  let component: AppointmentRolesComponent;
  let fixture: ComponentFixture<AppointmentRolesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentRolesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentRolesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
