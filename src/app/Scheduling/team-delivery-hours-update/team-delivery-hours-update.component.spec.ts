import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeamDeliveryHoursUpdateComponent } from './team-delivery-hours-update.component';

describe('TeamDeliveryHoursUpdateComponent', () => {
  let component: TeamDeliveryHoursUpdateComponent;
  let fixture: ComponentFixture<TeamDeliveryHoursUpdateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamDeliveryHoursUpdateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeamDeliveryHoursUpdateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
