import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManualAssignmentsComponent } from './manual-assignments.component';

describe('ManualAssignmentsComponent', () => {
  let component: ManualAssignmentsComponent;
  let fixture: ComponentFixture<ManualAssignmentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManualAssignmentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManualAssignmentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
