import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TagParticipantsComponent } from './tag-participants.component';

describe('TagParticipantsComponent', () => {
  let component: TagParticipantsComponent;
  let fixture: ComponentFixture<TagParticipantsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagParticipantsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TagParticipantsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
