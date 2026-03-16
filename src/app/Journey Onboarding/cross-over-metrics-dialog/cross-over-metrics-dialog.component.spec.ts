import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CrossOverMetricsDialogComponent } from './cross-over-metrics-dialog.component';

describe('CrossOverMetricsDialogComponent', () => {
  let component: CrossOverMetricsDialogComponent;
  let fixture: ComponentFixture<CrossOverMetricsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrossOverMetricsDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CrossOverMetricsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
