import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentRolesDialogComponent } from './appointment-roles-dialog.component';

describe('AppointmentRolesDialogComponent', () => {
  let component: AppointmentRolesDialogComponent;
  let fixture: ComponentFixture<AppointmentRolesDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentRolesDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentRolesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
