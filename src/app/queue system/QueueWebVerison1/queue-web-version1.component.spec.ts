import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueWebVersion1Component } from './queue-web-version1.component';

describe('QueueWebVersion1Component', () => {
  let component: QueueWebVersion1Component;
  let fixture: ComponentFixture<QueueWebVersion1Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueWebVersion1Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueWebVersion1Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});