import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateTemplateComponent } from './validate-template.component';

describe('ValidateTemplateComponent', () => {
  let component: ValidateTemplateComponent;
  let fixture: ComponentFixture<ValidateTemplateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ValidateTemplateComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ValidateTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
