import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigDashboardComponent } from './big-dashboard.component';

describe('BigDashboardComponent', () => {
  let component: BigDashboardComponent;
  let fixture: ComponentFixture<BigDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
