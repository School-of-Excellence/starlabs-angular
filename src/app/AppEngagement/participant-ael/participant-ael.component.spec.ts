import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantAELComponent } from './participant-ael.component';

describe('ParticipantAELComponent', () => {
  let component: ParticipantAELComponent;
  let fixture: ComponentFixture<ParticipantAELComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantAELComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantAELComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
