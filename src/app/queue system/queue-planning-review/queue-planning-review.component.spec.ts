import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueuePlanningReviewComponent } from './queue-planning-review.component';

describe('QueuePlanningReviewComponent', () => {
  let component: QueuePlanningReviewComponent;
  let fixture: ComponentFixture<QueuePlanningReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueuePlanningReviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueuePlanningReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
