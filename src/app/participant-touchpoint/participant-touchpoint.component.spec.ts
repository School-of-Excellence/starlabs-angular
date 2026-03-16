import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantTouchpointComponent } from './participant-touchpoint.component';

describe('ParticipantTouchpointComponent', () => {
  let component: ParticipantTouchpointComponent;
  let fixture: ComponentFixture<ParticipantTouchpointComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantTouchpointComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantTouchpointComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
