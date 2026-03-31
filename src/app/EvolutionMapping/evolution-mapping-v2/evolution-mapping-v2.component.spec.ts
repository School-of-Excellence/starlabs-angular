import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionMappingV2Component } from './evolution-mapping-v2.component';

describe('EvolutionMappingV2Component', () => {
  let component: EvolutionMappingV2Component;
  let fixture: ComponentFixture<EvolutionMappingV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionMappingV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionMappingV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
