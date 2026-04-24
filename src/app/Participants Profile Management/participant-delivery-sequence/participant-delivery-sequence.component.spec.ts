import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantDeliverySequenceComponent } from './participant-delivery-sequence.component';

describe('ParticipantDeliverySequenceComponent', () => {
  let component: ParticipantDeliverySequenceComponent;
  let fixture: ComponentFixture<ParticipantDeliverySequenceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantDeliverySequenceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantDeliverySequenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});