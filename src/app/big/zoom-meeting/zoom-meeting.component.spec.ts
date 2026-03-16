import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoomMeetingComponent } from './zoom-meeting.component';

describe('ZoomMeetingComponent', () => {
  let component: ZoomMeetingComponent;
  let fixture: ComponentFixture<ZoomMeetingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoomMeetingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoomMeetingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
