import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LivePrescriptionComponent } from './live-prescription.component';

describe('LivePrescriptionComponent', () => {
  let component: LivePrescriptionComponent;
  let fixture: ComponentFixture<LivePrescriptionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LivePrescriptionComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LivePrescriptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
