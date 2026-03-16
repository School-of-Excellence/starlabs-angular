import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantFormTrackerComponent } from './participant-form-tracker.component';

describe('ParticipantFormTrackerComponent', () => {
  let component: ParticipantFormTrackerComponent;
  let fixture: ComponentFixture<ParticipantFormTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantFormTrackerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantFormTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
