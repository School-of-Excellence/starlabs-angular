import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyProductPurchaseComponent } from './journey-product-purchase.component';

describe('JourneyProductPurchaseComponent', () => {
  let component: JourneyProductPurchaseComponent;
  let fixture: ComponentFixture<JourneyProductPurchaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyProductPurchaseComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyProductPurchaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
