import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotificationRecordComponent } from './notification-record.component';

describe('NotificationRecordComponent', () => {
  let component: NotificationRecordComponent;
  let fixture: ComponentFixture<NotificationRecordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationRecordComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NotificationRecordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
