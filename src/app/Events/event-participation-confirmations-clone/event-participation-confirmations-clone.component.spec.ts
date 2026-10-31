import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventParticipationConfirmationsCloneComponent } from './event-participation-confirmations-clone.component';

describe('EventParticipationConfirmationsCloneComponent', () => {
  let component: EventParticipationConfirmationsCloneComponent;
  let fixture: ComponentFixture<EventParticipationConfirmationsCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventParticipationConfirmationsCloneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventParticipationConfirmationsCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
