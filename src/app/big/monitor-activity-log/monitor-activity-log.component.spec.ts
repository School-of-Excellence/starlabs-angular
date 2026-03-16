import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonitorActivityLogComponent } from './monitor-activity-log.component';

describe('MonitorActivityLogComponent', () => {
  let component: MonitorActivityLogComponent;
  let fixture: ComponentFixture<MonitorActivityLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonitorActivityLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MonitorActivityLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
