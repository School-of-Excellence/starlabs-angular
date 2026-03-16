import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantAssignmentBoardComponent } from './participant-assignment-board.component';

describe('ParticipantAssignmentBoardComponent', () => {
  let component: ParticipantAssignmentBoardComponent;
  let fixture: ComponentFixture<ParticipantAssignmentBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantAssignmentBoardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantAssignmentBoardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
