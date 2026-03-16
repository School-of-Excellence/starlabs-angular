import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoasktranscribeComponent } from './videoasktranscribe.component';

describe('VideoasktranscribeComponent', () => {
  let component: VideoasktranscribeComponent;
  let fixture: ComponentFixture<VideoasktranscribeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoasktranscribeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VideoasktranscribeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
