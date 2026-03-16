import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeleteParticipantEnrollmentComponent } from './delete-participant-enrollment.component';

describe('DeleteParticipantEnrollmentComponent', () => {
  let component: DeleteParticipantEnrollmentComponent;
  let fixture: ComponentFixture<DeleteParticipantEnrollmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeleteParticipantEnrollmentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeleteParticipantEnrollmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
