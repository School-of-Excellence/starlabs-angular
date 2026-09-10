import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormOverlayViewComponent } from './form-overlay-view.component';

describe('FormOverlayViewComponent', () => {
  let component: FormOverlayViewComponent;
  let fixture: ComponentFixture<FormOverlayViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormOverlayViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormOverlayViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});