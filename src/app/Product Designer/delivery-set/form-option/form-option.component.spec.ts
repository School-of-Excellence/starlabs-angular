import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormOptionComponent } from './form-option.component';

describe('FormOptionComponent', () => {
  let component: FormOptionComponent;
  let fixture: ComponentFixture<FormOptionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormOptionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormOptionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
