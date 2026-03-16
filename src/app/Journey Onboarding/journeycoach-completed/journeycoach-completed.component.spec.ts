import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneycoachCompletedComponent } from './journeycoach-completed.component';

describe('JourneycoachCompletedComponent', () => {
  let component: JourneycoachCompletedComponent;
  let fixture: ComponentFixture<JourneycoachCompletedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneycoachCompletedComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneycoachCompletedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
