import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentStudioComponent } from './appointment-studio.component';

describe('AppointmentStudioComponent', () => {
  let component: AppointmentStudioComponent;
  let fixture: ComponentFixture<AppointmentStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
