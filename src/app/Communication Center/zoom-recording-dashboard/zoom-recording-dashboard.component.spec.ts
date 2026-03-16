import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoomRecordingDashboardComponent } from './zoom-recording-dashboard.component';

describe('ZoomRecordingDashboardComponent', () => {
  let component: ZoomRecordingDashboardComponent;
  let fixture: ComponentFixture<ZoomRecordingDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoomRecordingDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ZoomRecordingDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
