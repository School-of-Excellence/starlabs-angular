import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatchVideosComponent } from './watch-videos.component';

describe('WatchVideosComponent', () => {
  let component: WatchVideosComponent;
  let fixture: ComponentFixture<WatchVideosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchVideosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WatchVideosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
