import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyProductComponent } from './journey-product.component';

describe('JourneyProductComponent', () => {
  let component: JourneyProductComponent;
  let fixture: ComponentFixture<JourneyProductComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyProductComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyProductComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
