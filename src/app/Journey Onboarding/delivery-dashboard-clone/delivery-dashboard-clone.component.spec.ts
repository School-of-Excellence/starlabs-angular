import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliveryDashboardCloneComponent } from './delivery-dashboard-clone.component';

describe('DeliveryDashboardCloneComponent', () => {
  let component: DeliveryDashboardCloneComponent;
  let fixture: ComponentFixture<DeliveryDashboardCloneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliveryDashboardCloneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeliveryDashboardCloneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});