import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateBulkInvitationComponent } from './create-bulk-invitation.component';

describe('CreateBulkInvitationComponent', () => {
  let component: CreateBulkInvitationComponent;
  let fixture: ComponentFixture<CreateBulkInvitationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateBulkInvitationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateBulkInvitationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
