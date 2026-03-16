import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventParticipationApproveComponent } from './event-participation-approve.component';

describe('EventParticipationApproveComponent', () => {
  let component: EventParticipationApproveComponent;
  let fixture: ComponentFixture<EventParticipationApproveComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventParticipationApproveComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventParticipationApproveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
