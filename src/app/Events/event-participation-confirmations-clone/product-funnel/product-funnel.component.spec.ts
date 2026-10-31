import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductFunnelComponent } from './product-funnel.component';

describe('ProductFunnelComponent', () => {
  let component: ProductFunnelComponent;
  let fixture: ComponentFixture<ProductFunnelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductFunnelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductFunnelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
