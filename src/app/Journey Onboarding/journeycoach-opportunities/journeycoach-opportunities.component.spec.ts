import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneycoachOpportunitiesComponent } from './journeycoach-opportunities.component';

describe('JourneycoachOpportunitiesComponent', () => {
  let component: JourneycoachOpportunitiesComponent;
  let fixture: ComponentFixture<JourneycoachOpportunitiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneycoachOpportunitiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneycoachOpportunitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
