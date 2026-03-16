import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QueueVenueComponent } from './queue-venue.component';

describe('QueueVenueComponent', () => {
  let component: QueueVenueComponent;
  let fixture: ComponentFixture<QueueVenueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueueVenueComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueueVenueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
