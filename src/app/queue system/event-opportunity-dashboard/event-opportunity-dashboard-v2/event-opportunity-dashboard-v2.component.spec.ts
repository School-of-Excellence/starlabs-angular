import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventOpportunityDashboardV2Component } from './event-opportunity-dashboard-v2.component';

describe('EventOpportunityDashboardV2Component', () => {
  let component: EventOpportunityDashboardV2Component;
  let fixture: ComponentFixture<EventOpportunityDashboardV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventOpportunityDashboardV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventOpportunityDashboardV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
