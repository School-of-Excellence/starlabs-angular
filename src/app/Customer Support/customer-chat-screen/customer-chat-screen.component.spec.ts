import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerChatScreenComponent } from './customer-chat-screen.component';

describe('CustomerChatScreenComponent', () => {
  let component: CustomerChatScreenComponent;
  let fixture: ComponentFixture<CustomerChatScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerChatScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerChatScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
