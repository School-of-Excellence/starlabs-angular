import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionMappingComponent } from './evolution-mapping.component';

describe('EvolutionMappingComponent', () => {
  let component: EvolutionMappingComponent;
  let fixture: ComponentFixture<EvolutionMappingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionMappingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionMappingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
