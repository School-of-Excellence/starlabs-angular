import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionPrepFormsComponent } from './evolution-prep-forms.component';

describe('EvolutionPrepFormsComponent', () => {
  let component: EvolutionPrepFormsComponent;
  let fixture: ComponentFixture<EvolutionPrepFormsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionPrepFormsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionPrepFormsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
