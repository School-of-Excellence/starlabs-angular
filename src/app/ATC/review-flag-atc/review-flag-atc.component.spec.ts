import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewFlagATCComponent } from './review-flag-atc.component';

describe('ReviewFlagATCComponent', () => {
  let component: ReviewFlagATCComponent;
  let fixture: ComponentFixture<ReviewFlagATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewFlagATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewFlagATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
