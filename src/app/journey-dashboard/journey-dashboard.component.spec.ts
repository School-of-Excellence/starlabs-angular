import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JourneyDashboardComponent } from './journey-dashboard.component';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';

describe('JourneyDashboardComponent', () => {
  let component: JourneyDashboardComponent;
  let fixture: ComponentFixture<JourneyDashboardComponent>;

  const firestoreMock = {
    collection: jasmine.createSpy(),
    doc: jasmine.createSpy(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        JourneyDashboardComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
      ],
      providers: [
        { provide: Firestore, useValue: firestoreMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JourneyDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
