import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveEventDashboardV2Component } from './live-event-dashboard-v2.component';

describe('LiveEventDashboardV2Component', () => {
  let component: LiveEventDashboardV2Component;
  let fixture: ComponentFixture<LiveEventDashboardV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveEventDashboardV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveEventDashboardV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
