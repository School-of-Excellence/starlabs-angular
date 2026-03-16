import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormTemplatePreviewComponent } from './form-template-preview.component';

describe('FormTemplatePreviewComponent', () => {
  let component: FormTemplatePreviewComponent;
  let fixture: ComponentFixture<FormTemplatePreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormTemplatePreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormTemplatePreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
