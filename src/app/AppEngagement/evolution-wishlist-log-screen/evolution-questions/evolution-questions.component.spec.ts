import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolutionQuestionsComponent } from './evolution-questions.component';

describe('EvolutionQuestionsComponent', () => {
  let component: EvolutionQuestionsComponent;
  let fixture: ComponentFixture<EvolutionQuestionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolutionQuestionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolutionQuestionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
