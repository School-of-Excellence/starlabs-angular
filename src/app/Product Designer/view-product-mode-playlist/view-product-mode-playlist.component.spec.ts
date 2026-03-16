import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewProductModePlaylistComponent } from './view-product-mode-playlist.component';

describe('ViewProductModePlaylistComponent', () => {
  let component: ViewProductModePlaylistComponent;
  let fixture: ComponentFixture<ViewProductModePlaylistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewProductModePlaylistComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewProductModePlaylistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
