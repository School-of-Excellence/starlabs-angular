import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SendInterimReportComponent } from './send-interim-report.component';

describe('SendInterimReportComponent', () => {
  let component: SendInterimReportComponent;
  let fixture: ComponentFixture<SendInterimReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SendInterimReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SendInterimReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
