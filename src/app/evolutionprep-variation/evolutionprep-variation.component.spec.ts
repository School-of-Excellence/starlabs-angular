import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionprepVariationComponent } from './evolutionprep-variation.component';

describe('EvolutionprepVariationComponent', () => {
  let component: EvolutionprepVariationComponent;
  let fixture: ComponentFixture<EvolutionprepVariationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionprepVariationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionprepVariationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
