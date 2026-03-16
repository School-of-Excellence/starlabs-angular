import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueuePlanningCloneComponent } from './queue-planning-clone.component';

describe('QueuePlanningCloneComponent', () => {
  let component: QueuePlanningCloneComponent;
  let fixture: ComponentFixture<QueuePlanningCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueuePlanningCloneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueuePlanningCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
