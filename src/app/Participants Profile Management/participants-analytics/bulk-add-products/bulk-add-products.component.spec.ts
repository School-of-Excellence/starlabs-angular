import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BulkAddProductsComponent } from './bulk-add-products.component';

describe('BulkAddProductsComponent', () => {
  let component: BulkAddProductsComponent;
  let fixture: ComponentFixture<BulkAddProductsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BulkAddProductsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BulkAddProductsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
