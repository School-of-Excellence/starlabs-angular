import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JourneyOnboardingDetailComponent } from './journey-onboarding-detail.component';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';

describe('JourneyOnboardingDetailComponentComponent', () => {
  let component: JourneyOnboardingDetailComponent;
  let fixture: ComponentFixture<JourneyOnboardingDetailComponent>;

  const firestoreMock = {
    collection: jasmine.createSpy(),
    doc: jasmine.createSpy(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        JourneyOnboardingDetailComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: Firestore, useValue: firestoreMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JourneyOnboardingDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
