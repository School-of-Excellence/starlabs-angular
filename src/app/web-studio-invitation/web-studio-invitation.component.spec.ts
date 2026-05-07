import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebStudioInvitationComponent } from './web-studio-invitation.component';

describe('WebStudioInvitationComponent', () => {
  let component: WebStudioInvitationComponent;
  let fixture: ComponentFixture<WebStudioInvitationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebStudioInvitationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WebStudioInvitationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
