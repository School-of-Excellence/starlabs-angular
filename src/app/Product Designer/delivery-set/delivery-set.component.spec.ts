import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliverySetComponent } from './delivery-set.component';

describe('DeliverySetComponent', () => {
  let component: DeliverySetComponent;
  let fixture: ComponentFixture<DeliverySetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliverySetComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeliverySetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
