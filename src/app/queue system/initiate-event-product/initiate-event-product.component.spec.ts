import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InitiateEventProductComponent } from './initiate-event-product.component';

describe('InitiateEventProductComponent', () => {
  let component: InitiateEventProductComponent;
  let fixture: ComponentFixture<InitiateEventProductComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InitiateEventProductComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InitiateEventProductComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
