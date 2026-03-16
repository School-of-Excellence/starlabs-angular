import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueInvitationApprovalComponent } from './queue-invitation-approval.component';

describe('QueueInvitationApprovalComponent', () => {
  let component: QueueInvitationApprovalComponent;
  let fixture: ComponentFixture<QueueInvitationApprovalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueInvitationApprovalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueInvitationApprovalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
