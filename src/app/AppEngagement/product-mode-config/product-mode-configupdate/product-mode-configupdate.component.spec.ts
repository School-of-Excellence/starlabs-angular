import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductModeConfigupdateComponent } from './product-mode-configupdate.component';

describe('ProductModeCongigupdateComponent', () => {
  let component: ProductModeConfigupdateComponent;
  let fixture: ComponentFixture<ProductModeConfigupdateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductModeConfigupdateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductModeConfigupdateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
