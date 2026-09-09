import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WccalendarComponent } from './wccalendar.component';

describe('WccalendarComponent', () => {
  let component: WccalendarComponent;
  let fixture: ComponentFixture<WccalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WccalendarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WccalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
