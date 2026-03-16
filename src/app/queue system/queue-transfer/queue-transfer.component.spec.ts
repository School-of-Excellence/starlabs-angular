import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueTransferComponent } from './queue-transfer.component';

describe('QueueTransferComponent', () => {
  let component: QueueTransferComponent;
  let fixture: ComponentFixture<QueueTransferComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueTransferComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueTransferComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
