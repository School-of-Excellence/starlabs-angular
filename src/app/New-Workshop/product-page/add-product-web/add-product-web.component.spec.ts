import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddProductWebComponent } from './add-product-web.component';

describe('AddProductWebComponent', () => {
  let component: AddProductWebComponent;
  let fixture: ComponentFixture<AddProductWebComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddProductWebComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddProductWebComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
