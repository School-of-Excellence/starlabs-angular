import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueCreationV3Component } from './queue-creation-v3.component';

describe('QueueCreationV3Component', () => {
  let component: QueueCreationV3Component;
  let fixture: ComponentFixture<QueueCreationV3Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueCreationV3Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueCreationV3Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
