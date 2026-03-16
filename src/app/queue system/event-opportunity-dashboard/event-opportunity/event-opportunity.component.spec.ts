import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventOpportunityComponent } from './event-opportunity.component';

describe('EventOpportunityComponent', () => {
  let component: EventOpportunityComponent;
  let fixture: ComponentFixture<EventOpportunityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventOpportunityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventOpportunityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
