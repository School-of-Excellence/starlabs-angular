import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddLayersComponent } from './add-layers.component';

describe('AddLayersComponent', () => {
  let component: AddLayersComponent;
  let fixture: ComponentFixture<AddLayersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddLayersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddLayersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
