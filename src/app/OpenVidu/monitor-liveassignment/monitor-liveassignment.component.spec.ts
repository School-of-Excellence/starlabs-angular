import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonitorLiveassignmentComponent } from './monitor-liveassignment.component';

describe('MonitorLiveassignmentComponent', () => {
  let component: MonitorLiveassignmentComponent;
  let fixture: ComponentFixture<MonitorLiveassignmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorLiveassignmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MonitorLiveassignmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
