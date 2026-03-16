import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InterimReportLogComponent } from './interim-report-log.component';

describe('InterimReportLogComponent', () => {
  let component: InterimReportLogComponent;
  let fixture: ComponentFixture<InterimReportLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InterimReportLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InterimReportLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
