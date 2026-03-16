import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeleteSeriesComponent } from './delete-series.component';

describe('DeleteSeriesComponent', () => {
  let component: DeleteSeriesComponent;
  let fixture: ComponentFixture<DeleteSeriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeleteSeriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeleteSeriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
