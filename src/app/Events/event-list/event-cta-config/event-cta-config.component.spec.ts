import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventCtaConfigComponent } from './event-cta-config.component';

describe('EventCtaConfigComponent', () => {
  let component: EventCtaConfigComponent;
  let fixture: ComponentFixture<EventCtaConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventCtaConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventCtaConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
