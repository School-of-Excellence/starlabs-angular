import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OnboardingRemarkComponent } from './onboarding-remark.component';

describe('OnboardingRemarkComponent', () => {
  let component: OnboardingRemarkComponent;
  let fixture: ComponentFixture<OnboardingRemarkComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingRemarkComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OnboardingRemarkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
