import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaylistAdsComponent } from './playlist-ads.component';

describe('PlaylistAdsComponent', () => {
  let component: PlaylistAdsComponent;
  let fixture: ComponentFixture<PlaylistAdsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistAdsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlaylistAdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
