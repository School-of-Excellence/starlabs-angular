import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantsEvolutionSummaryComponent } from './participants-evolution-summary.component';

describe('ParticipantsEvolutionSummaryComponent', () => {
  let component: ParticipantsEvolutionSummaryComponent;
  let fixture: ComponentFixture<ParticipantsEvolutionSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantsEvolutionSummaryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantsEvolutionSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
