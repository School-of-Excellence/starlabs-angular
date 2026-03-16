import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueuePlanningComponent } from './queue-planning.component';

describe('QueuePlanningComponent', () => {
  let component: QueuePlanningComponent;
  let fixture: ComponentFixture<QueuePlanningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueuePlanningComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueuePlanningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
