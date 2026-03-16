import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FirstTimersDashboardComponent } from './first-timers-dashboard.component';

describe('FirstTimersDashboardComponent', () => {
  let component: FirstTimersDashboardComponent;
  let fixture: ComponentFixture<FirstTimersDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirstTimersDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FirstTimersDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
