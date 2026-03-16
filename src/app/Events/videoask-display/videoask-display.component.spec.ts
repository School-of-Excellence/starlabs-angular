import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoaskDisplayComponent } from './videoask-display.component';

describe('VideoaskDisplayComponent', () => {
  let component: VideoaskDisplayComponent;
  let fixture: ComponentFixture<VideoaskDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoaskDisplayComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VideoaskDisplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
