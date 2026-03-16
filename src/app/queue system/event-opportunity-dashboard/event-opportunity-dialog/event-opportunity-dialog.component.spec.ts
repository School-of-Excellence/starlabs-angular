import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventOpportunityDialogComponent } from './event-opportunity-dialog.component';

describe('EventOpportunityDialogComponent', () => {
  let component: EventOpportunityDialogComponent;
  let fixture: ComponentFixture<EventOpportunityDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventOpportunityDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventOpportunityDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
