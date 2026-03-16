import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoryassignComponent } from './categoryassign.component';

describe('CategoryassignComponent', () => {
  let component: CategoryassignComponent;
  let fixture: ComponentFixture<CategoryassignComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryassignComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CategoryassignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
