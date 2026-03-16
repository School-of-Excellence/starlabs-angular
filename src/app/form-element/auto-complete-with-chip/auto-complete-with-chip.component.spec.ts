import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoCompleteWithChipComponent } from './auto-complete-with-chip.component';

describe('AutoCompleteWithChipComponent', () => {
  let component: AutoCompleteWithChipComponent;
  let fixture: ComponentFixture<AutoCompleteWithChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoCompleteWithChipComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AutoCompleteWithChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
