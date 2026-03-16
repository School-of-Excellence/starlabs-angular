import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DynamicQueueManagerComponent } from './dynamic-queue-manager.component';

describe('DynamicQueueManagerComponent', () => {
  let component: DynamicQueueManagerComponent;
  let fixture: ComponentFixture<DynamicQueueManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicQueueManagerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DynamicQueueManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
