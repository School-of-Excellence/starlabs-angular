import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerTicketNewComponent } from './customer-ticket-new.component';

describe('CustomerTicketNewComponent', () => {
  let component: CustomerTicketNewComponent;
  let fixture: ComponentFixture<CustomerTicketNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerTicketNewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerTicketNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
