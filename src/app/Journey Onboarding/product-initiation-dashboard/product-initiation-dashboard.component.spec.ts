import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductInitiationDashboardComponent } from './product-initiation-dashboard.component';

describe('ProductInitiationDashboardComponent', () => {
  let component: ProductInitiationDashboardComponent;
  let fixture: ComponentFixture<ProductInitiationDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductInitiationDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductInitiationDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
