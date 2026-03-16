import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantEnrollmentDashboardComponent } from './participant-enrollment-dashboard.component';

describe('ParticipantEnrollmentDashboardComponent', () => {
  let component: ParticipantEnrollmentDashboardComponent;
  let fixture: ComponentFixture<ParticipantEnrollmentDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantEnrollmentDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantEnrollmentDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
