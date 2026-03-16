import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapJourneyProductComponent } from './map-journey-product.component';

describe('MapJourneyProductComponent', () => {
  let component: MapJourneyProductComponent;
  let fixture: ComponentFixture<MapJourneyProductComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapJourneyProductComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapJourneyProductComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
