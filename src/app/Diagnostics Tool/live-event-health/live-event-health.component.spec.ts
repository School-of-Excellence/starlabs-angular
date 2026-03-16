import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveEventHealthComponent } from './live-event-health.component';

describe('LiveEventHealthComponent', () => {
  let component: LiveEventHealthComponent;
  let fixture: ComponentFixture<LiveEventHealthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveEventHealthComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveEventHealthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
