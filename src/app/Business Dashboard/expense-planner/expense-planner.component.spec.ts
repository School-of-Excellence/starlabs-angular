import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpensePlannerComponent } from './expense-planner.component';

describe('ExpensePlannerComponent', () => {
  let component: ExpensePlannerComponent;
  let fixture: ComponentFixture<ExpensePlannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpensePlannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpensePlannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
