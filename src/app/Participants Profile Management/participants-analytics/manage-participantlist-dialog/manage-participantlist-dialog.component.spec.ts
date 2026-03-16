import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageParticipantlistDialogComponent } from './manage-participantlist-dialog.component';

describe('ManageParticipantlistDialogComponent', () => {
  let component: ManageParticipantlistDialogComponent;
  let fixture: ComponentFixture<ManageParticipantlistDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageParticipantlistDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageParticipantlistDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
