import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuestionandanswerComponent } from './questionandanswer.component';

describe('QuestionandanswerComponent', () => {
  let component: QuestionandanswerComponent;
  let fixture: ComponentFixture<QuestionandanswerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuestionandanswerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuestionandanswerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
