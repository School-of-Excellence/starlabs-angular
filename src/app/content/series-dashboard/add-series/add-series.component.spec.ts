import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSeriesComponent } from './add-series.component';

describe('AddSeriesComponent', () => {
  let component: AddSeriesComponent;
  let fixture: ComponentFixture<AddSeriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddSeriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddSeriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
