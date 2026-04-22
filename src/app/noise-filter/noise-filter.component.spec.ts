import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NoiseFilterComponent } from './noise-filter.component';

describe('NoiseFilterComponent', () => {
  let component: NoiseFilterComponent;
  let fixture: ComponentFixture<NoiseFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoiseFilterComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NoiseFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
