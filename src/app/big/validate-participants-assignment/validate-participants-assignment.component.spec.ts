import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateParticipantsAssignmentComponent } from './validate-participants-assignment.component';

describe('ValidateParticipantsAssignmentComponent', () => {
  let component: ValidateParticipantsAssignmentComponent;
  let fixture: ComponentFixture<ValidateParticipantsAssignmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateParticipantsAssignmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateParticipantsAssignmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
