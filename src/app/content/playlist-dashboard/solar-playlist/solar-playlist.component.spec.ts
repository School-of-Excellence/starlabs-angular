import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SolarPlaylistComponent } from './solar-playlist.component';

describe('SolarPlaylistComponent', () => {
  let component: SolarPlaylistComponent;
  let fixture: ComponentFixture<SolarPlaylistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SolarPlaylistComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SolarPlaylistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
