import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkshopDashboardComponent } from './workshop-dashboard.component';

describe('WorkshopDashboardComponent', () => {
  let component: WorkshopDashboardComponent;
  let fixture: ComponentFixture<WorkshopDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkshopDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkshopDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
