import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveEventDashboardComponent } from './live-event-dashboard.component';

describe('LiveEventDashboardComponent', () => {
  let component: LiveEventDashboardComponent;
  let fixture: ComponentFixture<LiveEventDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveEventDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveEventDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
