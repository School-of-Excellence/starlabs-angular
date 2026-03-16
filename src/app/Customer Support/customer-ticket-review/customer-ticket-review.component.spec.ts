import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerTicketReviewComponent } from './customer-ticket-review.component';

describe('CustomerTicketReviewComponent', () => {
  let component: CustomerTicketReviewComponent;
  let fixture: ComponentFixture<CustomerTicketReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerTicketReviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerTicketReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
