import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmailValidationFromAnalyticsComponent } from './email-validation-from-analytics.component';

describe('EmailValidationFromAnalyticsComponent', () => {
  let component: EmailValidationFromAnalyticsComponent;
  let fixture: ComponentFixture<EmailValidationFromAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EmailValidationFromAnalyticsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EmailValidationFromAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
