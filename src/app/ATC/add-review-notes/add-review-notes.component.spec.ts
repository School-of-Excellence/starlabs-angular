import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddReviewNotesComponent } from './add-review-notes.component';

describe('AddReviewNotesComponent', () => {
  let component: AddReviewNotesComponent;
  let fixture: ComponentFixture<AddReviewNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddReviewNotesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddReviewNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
