import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigAggregateEventLevelComponent } from './big-aggregate-event-level.component';

describe('BigAggregateEventLevelComponent', () => {
  let component: BigAggregateEventLevelComponent;
  let fixture: ComponentFixture<BigAggregateEventLevelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigAggregateEventLevelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigAggregateEventLevelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
