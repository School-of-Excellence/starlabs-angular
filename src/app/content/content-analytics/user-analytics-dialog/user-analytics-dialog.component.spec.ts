import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserAnalyticsDialogComponent } from './user-analytics-dialog.component';

describe('UserAnalyticsDialogComponent', () => {
  let component: UserAnalyticsDialogComponent;
  let fixture: ComponentFixture<UserAnalyticsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserAnalyticsDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserAnalyticsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
