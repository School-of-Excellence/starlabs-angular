import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeliverySequenceComponent } from './delivery-sequence.component';

describe('DeliverySequenceComponent', () => {
  let component: DeliverySequenceComponent;
  let fixture: ComponentFixture<DeliverySequenceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliverySequenceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeliverySequenceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
