import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapAppointmentRoleComponent } from './map-appointment-role.component';

describe('MapAppointmentRoleComponent', () => {
  let component: MapAppointmentRoleComponent;
  let fixture: ComponentFixture<MapAppointmentRoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapAppointmentRoleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapAppointmentRoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
