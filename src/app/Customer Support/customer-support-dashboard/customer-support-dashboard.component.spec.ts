import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerSupportDashboardComponent } from './customer-support-dashboard.component';

describe('CustomerSupportDashboardComponent', () => {
  let component: CustomerSupportDashboardComponent;
  let fixture: ComponentFixture<CustomerSupportDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerSupportDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerSupportDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
