import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantsAnalyticsComponent } from './participants-analytics.component';

describe('ParticipantsAnalyticsComponent', () => {
  let component: ParticipantsAnalyticsComponent;
  let fixture: ComponentFixture<ParticipantsAnalyticsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantsAnalyticsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantsAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
