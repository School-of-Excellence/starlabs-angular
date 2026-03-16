import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmailRecordComponent } from './email-record.component';

describe('EmailRecordComponent', () => {
  let component: EmailRecordComponent;
  let fixture: ComponentFixture<EmailRecordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmailRecordComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmailRecordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
