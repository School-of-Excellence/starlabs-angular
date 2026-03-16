import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicQueueManagerCloneComponent } from './dynamic-queue-manager-clone.component';

describe('DynamicQueueManagerCloneComponent', () => {
  let component: DynamicQueueManagerCloneComponent;
  let fixture: ComponentFixture<DynamicQueueManagerCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicQueueManagerCloneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DynamicQueueManagerCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
