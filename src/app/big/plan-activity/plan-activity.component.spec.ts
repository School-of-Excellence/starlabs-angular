import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlanActivityComponent } from './plan-activity.component';

describe('PlanActivityComponent', () => {
  let component: PlanActivityComponent;
  let fixture: ComponentFixture<PlanActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanActivityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlanActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
