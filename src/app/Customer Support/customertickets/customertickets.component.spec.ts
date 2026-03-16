import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerticketsComponent } from './customertickets.component';

describe('CustomerticketsComponent', () => {
  let component: CustomerticketsComponent;
  let fixture: ComponentFixture<CustomerticketsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerticketsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerticketsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
