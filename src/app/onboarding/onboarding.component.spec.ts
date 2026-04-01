import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JourneyOnboardingFormComponent } from './onboarding.component';

describe('JourneyOnboardingFormComponent', () => {
  let component: JourneyOnboardingFormComponent;
  let fixture: ComponentFixture<JourneyOnboardingFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyOnboardingFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(JourneyOnboardingFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
