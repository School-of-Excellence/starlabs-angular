import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizScreenComponent } from './quizscreen.component';

describe('QuizComponent', () => {
  let component: QuizScreenComponent;
  let fixture: ComponentFixture<QuizScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuizScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
