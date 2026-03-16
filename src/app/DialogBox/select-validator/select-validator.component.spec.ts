import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectValidatorComponent } from './select-validator.component';

describe('SelectValidatorComponent', () => {
  let component: SelectValidatorComponent;
  let fixture: ComponentFixture<SelectValidatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectValidatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SelectValidatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
