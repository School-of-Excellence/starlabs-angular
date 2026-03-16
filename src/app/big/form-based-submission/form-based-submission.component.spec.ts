import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormBasedSubmissionComponent } from './form-based-submission.component';

describe('FormBasedSubmissionComponent', () => {
  let component: FormBasedSubmissionComponent;
  let fixture: ComponentFixture<FormBasedSubmissionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormBasedSubmissionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormBasedSubmissionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
