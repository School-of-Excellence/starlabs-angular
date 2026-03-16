import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InviteOtherStudioComponent } from './invite-other-studio.component';

describe('InviteOtherStudioComponent', () => {
  let component: InviteOtherStudioComponent;
  let fixture: ComponentFixture<InviteOtherStudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InviteOtherStudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InviteOtherStudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
