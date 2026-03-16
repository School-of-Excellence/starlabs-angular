import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignSeriesComponent } from './assign-series.component';

describe('AssignSeriesComponent', () => {
  let component: AssignSeriesComponent;
  let fixture: ComponentFixture<AssignSeriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignSeriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignSeriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
