import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductModeConfigComponent } from './product-mode-config.component';

describe('ProductModeConfigComponent', () => {
  let component: ProductModeConfigComponent;
  let fixture: ComponentFixture<ProductModeConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductModeConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductModeConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
