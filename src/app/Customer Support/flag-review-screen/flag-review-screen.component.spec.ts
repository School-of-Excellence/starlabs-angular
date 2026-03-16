import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlagReviewScreenComponent } from './flag-review-screen.component';

describe('FlagReviewScreenComponent', () => {
  let component: FlagReviewScreenComponent;
  let fixture: ComponentFixture<FlagReviewScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlagReviewScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlagReviewScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
