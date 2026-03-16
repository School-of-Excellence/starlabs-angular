import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewParticipantAELComponent } from './review-participant-ael.component';

describe('ReviewParticipantAELComponent', () => {
  let component: ReviewParticipantAELComponent;
  let fixture: ComponentFixture<ReviewParticipantAELComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewParticipantAELComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewParticipantAELComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
