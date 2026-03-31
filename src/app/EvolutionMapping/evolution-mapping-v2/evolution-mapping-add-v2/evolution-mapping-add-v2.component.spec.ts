import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionMappingAddV2Component } from './evolution-mapping-add-v2.component';

describe('EvolutionMappingAddV2Component', () => {
  let component: EvolutionMappingAddV2Component;
  let fixture: ComponentFixture<EvolutionMappingAddV2Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionMappingAddV2Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionMappingAddV2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
