import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CallsRecordComponent } from './calls-record.component';

describe('CallsRecordComponent', () => {
  let component: CallsRecordComponent;
  let fixture: ComponentFixture<CallsRecordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallsRecordComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CallsRecordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
