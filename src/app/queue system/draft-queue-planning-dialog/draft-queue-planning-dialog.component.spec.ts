import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftQueuePlanningDialogComponent } from './draft-queue-planning-dialog.component';

describe('DraftQueuePlanningDialogComponent', () => {
  let component: DraftQueuePlanningDialogComponent;
  let fixture: ComponentFixture<DraftQueuePlanningDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftQueuePlanningDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DraftQueuePlanningDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
