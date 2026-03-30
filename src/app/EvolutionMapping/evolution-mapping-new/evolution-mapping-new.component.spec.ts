import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionMappingNewComponent } from './evolution-mapping-new.component';

describe('EvolutionMappingNewComponent', () => {
  let component: EvolutionMappingNewComponent;
  let fixture: ComponentFixture<EvolutionMappingNewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionMappingNewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionMappingNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
