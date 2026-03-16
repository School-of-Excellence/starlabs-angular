import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CapacityDashboardComponent } from './capacity-dashboard.component';

describe('CapacityDashboardComponent', () => {
  let component: CapacityDashboardComponent;
  let fixture: ComponentFixture<CapacityDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CapacityDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CapacityDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
