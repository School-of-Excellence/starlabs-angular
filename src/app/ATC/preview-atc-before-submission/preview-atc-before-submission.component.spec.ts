import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreviewAtcBeforeSubmissionComponent } from './preview-atc-before-submission.component';

describe('PreviewAtcBeforeSubmissionComponent', () => {
  let component: PreviewAtcBeforeSubmissionComponent;
  let fixture: ComponentFixture<PreviewAtcBeforeSubmissionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreviewAtcBeforeSubmissionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PreviewAtcBeforeSubmissionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
