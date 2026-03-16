import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MatChipComponent } from './mat-chip.component';

describe('MatChipComponent', () => {
  let component: MatChipComponent;
  let fixture: ComponentFixture<MatChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatChipComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MatChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
