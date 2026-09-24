import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { CohortParticipantsDialogComponent } from './cohort-participants-dialog.component';

describe('CohortParticipantsDialogComponent', () => {
  let component: CohortParticipantsDialogComponent;
  let fixture: ComponentFixture<CohortParticipantsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CohortParticipantsDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: { cohortName: 'Test Cohort', participants: [] } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CohortParticipantsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
