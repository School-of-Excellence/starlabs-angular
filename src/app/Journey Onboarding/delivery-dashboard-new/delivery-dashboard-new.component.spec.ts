import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliveryDashboardNewComponent } from './delivery-dashboard-new.component';

describe('DeliveryDashboardNewComponent', () => {
  let component: DeliveryDashboardNewComponent;
  let fixture: ComponentFixture<DeliveryDashboardNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliveryDashboardNewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeliveryDashboardNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
