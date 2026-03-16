import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueEventHealthComponent } from './queue-event-health.component';

describe('QueueEventHealthComponent', () => {
  let component: QueueEventHealthComponent;
  let fixture: ComponentFixture<QueueEventHealthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueEventHealthComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueEventHealthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
