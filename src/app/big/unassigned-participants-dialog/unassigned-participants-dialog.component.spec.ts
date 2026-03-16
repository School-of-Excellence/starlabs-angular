import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnassignedParticipantsDialogComponent } from './unassigned-participants-dialog.component';

describe('UnassignedParticipantsDialogComponent', () => {
  let component: UnassignedParticipantsDialogComponent;
  let fixture: ComponentFixture<UnassignedParticipantsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnassignedParticipantsDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UnassignedParticipantsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
