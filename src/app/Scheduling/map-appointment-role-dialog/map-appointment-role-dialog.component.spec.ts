import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapAppointmentRoleDialogComponent } from './map-appointment-role-dialog.component';

describe('MapAppointmentRoleDialogComponent', () => {
  let component: MapAppointmentRoleDialogComponent;
  let fixture: ComponentFixture<MapAppointmentRoleDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapAppointmentRoleDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapAppointmentRoleDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
