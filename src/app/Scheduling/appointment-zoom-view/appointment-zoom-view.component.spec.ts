import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppointmentZoomViewComponent } from './appointment-zoom-view.component';

describe('AppointmentZoomViewComponent', () => {
  let component: AppointmentZoomViewComponent;
  let fixture: ComponentFixture<AppointmentZoomViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppointmentZoomViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppointmentZoomViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
