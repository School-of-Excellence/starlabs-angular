import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveEvolutionMappingComponent } from './live-evolution-mapping.component';

describe('LiveEvolutionMappingComponent', () => {
  let component: LiveEvolutionMappingComponent;
  let fixture: ComponentFixture<LiveEvolutionMappingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveEvolutionMappingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveEvolutionMappingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
