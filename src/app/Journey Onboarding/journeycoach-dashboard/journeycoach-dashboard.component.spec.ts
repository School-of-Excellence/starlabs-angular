import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneycoachDashboardComponent } from './journeycoach-dashboard.component';

describe('JourneycoachDashboardComponent', () => {
  let component: JourneycoachDashboardComponent;
  let fixture: ComponentFixture<JourneycoachDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneycoachDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneycoachDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
