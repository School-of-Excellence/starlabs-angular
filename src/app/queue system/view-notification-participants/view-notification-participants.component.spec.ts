import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewNotificationParticipantsComponent } from './view-notification-participants.component';

describe('ViewNotificationParticipantsComponent', () => {
  let component: ViewNotificationParticipantsComponent;
  let fixture: ComponentFixture<ViewNotificationParticipantsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewNotificationParticipantsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewNotificationParticipantsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
