import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantsChecklistsComponent } from './participants-checklists.component';

describe('ParticipantsChecklistsComponent', () => {
  let component: ParticipantsChecklistsComponent;
  let fixture: ComponentFixture<ParticipantsChecklistsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantsChecklistsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantsChecklistsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
