import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaylistConfigurationComponent } from './playlist-configuration.component';

describe('PlaylistConfigurationComponent', () => {
  let component: PlaylistConfigurationComponent;
  let fixture: ComponentFixture<PlaylistConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlaylistConfigurationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlaylistConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
