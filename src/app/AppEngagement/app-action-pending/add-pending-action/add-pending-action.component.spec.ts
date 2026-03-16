import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPendingActionComponent } from './add-pending-action.component';

describe('AppPendingActionComponent', () => {
  let component: AddPendingActionComponent;
  let fixture: ComponentFixture<AddPendingActionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPendingActionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddPendingActionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
