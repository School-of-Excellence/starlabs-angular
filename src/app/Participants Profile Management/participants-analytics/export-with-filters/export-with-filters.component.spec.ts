import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExportWithFiltersComponent } from './export-with-filters.component';

describe('ExportWithFiltersComponent', () => {
  let component: ExportWithFiltersComponent;
  let fixture: ComponentFixture<ExportWithFiltersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportWithFiltersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExportWithFiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
