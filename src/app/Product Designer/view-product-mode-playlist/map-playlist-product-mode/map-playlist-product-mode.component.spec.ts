import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapPlaylistProductModeComponent } from './map-playlist-product-mode.component';

describe('MapPlaylistProductModeComponent', () => {
  let component: MapPlaylistProductModeComponent;
  let fixture: ComponentFixture<MapPlaylistProductModeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPlaylistProductModeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapPlaylistProductModeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
