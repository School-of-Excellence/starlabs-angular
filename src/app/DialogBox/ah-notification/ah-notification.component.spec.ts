import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AhNotificationComponent } from './ah-notification.component';

describe('AhNotificationComponent', () => {
  let component: AhNotificationComponent;
  let fixture: ComponentFixture<AhNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AhNotificationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AhNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
