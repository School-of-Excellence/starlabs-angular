import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigEventInvitationComponent } from './big-event-invitation.component';

describe('BigEventInvitationComponent', () => {
  let component: BigEventInvitationComponent;
  let fixture: ComponentFixture<BigEventInvitationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigEventInvitationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigEventInvitationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
