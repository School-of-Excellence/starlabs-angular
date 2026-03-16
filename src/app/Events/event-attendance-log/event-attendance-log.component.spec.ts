import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventAttendanceLogComponent } from './event-attendance-log.component';

describe('EventAttendanceLogComponent', () => {
  let component: EventAttendanceLogComponent;
  let fixture: ComponentFixture<EventAttendanceLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventAttendanceLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventAttendanceLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
