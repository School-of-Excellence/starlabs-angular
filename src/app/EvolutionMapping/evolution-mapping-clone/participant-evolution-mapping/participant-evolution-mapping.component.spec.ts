import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantEvolutionMappingComponent } from './participant-evolution-mapping.component';

describe('ParticipantEvolutionMappingComponent', () => {
  let component: ParticipantEvolutionMappingComponent;
  let fixture: ComponentFixture<ParticipantEvolutionMappingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantEvolutionMappingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantEvolutionMappingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
