import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigPlannerComponent } from './big-planner.component';

describe('BigPlannerComponent', () => {
  let component: BigPlannerComponent;
  let fixture: ComponentFixture<BigPlannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigPlannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigPlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
