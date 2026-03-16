import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignQueueStudioComponent } from './assign-queue-studio.component';

describe('AssignQueueStudioComponent', () => {
  let component: AssignQueueStudioComponent;
  let fixture: ComponentFixture<AssignQueueStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignQueueStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignQueueStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
