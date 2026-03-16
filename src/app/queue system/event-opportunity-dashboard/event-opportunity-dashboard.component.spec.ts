import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventOpportunityDashboardComponent } from './event-opportunity-dashboard.component';

describe('EventOpportunityDashboardComponent', () => {
  let component: EventOpportunityDashboardComponent;
  let fixture: ComponentFixture<EventOpportunityDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventOpportunityDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventOpportunityDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
