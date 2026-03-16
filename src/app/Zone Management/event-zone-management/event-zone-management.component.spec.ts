import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventZoneManagementComponent } from './event-zone-management.component';

describe('EventZoneManagementComponent', () => {
  let component: EventZoneManagementComponent;
  let fixture: ComponentFixture<EventZoneManagementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventZoneManagementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventZoneManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
