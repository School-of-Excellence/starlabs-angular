import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeamDeliveryHoursComponent } from './team-delivery-hours.component';

describe('TeamDeliveryHoursComponent', () => {
  let component: TeamDeliveryHoursComponent;
  let fixture: ComponentFixture<TeamDeliveryHoursComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamDeliveryHoursComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeamDeliveryHoursComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
