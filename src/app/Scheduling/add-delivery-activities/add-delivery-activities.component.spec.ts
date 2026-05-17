import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddDeliveryActivitiesComponent } from './add-delivery-activities.component';

describe('AddDeliveryActivitiesComponent', () => {
  let component: AddDeliveryActivitiesComponent;
  let fixture: ComponentFixture<AddDeliveryActivitiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddDeliveryActivitiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddDeliveryActivitiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
