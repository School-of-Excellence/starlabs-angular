import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateParticipantlistDialogComponent } from './create-participantlist-dialog.component';

describe('CreateParticipantlistDialogComponent', () => {
  let component: CreateParticipantlistDialogComponent;
  let fixture: ComponentFixture<CreateParticipantlistDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateParticipantlistDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateParticipantlistDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
