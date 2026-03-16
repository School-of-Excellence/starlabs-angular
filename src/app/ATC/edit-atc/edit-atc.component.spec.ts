import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditAtcComponent } from './edit-atc.component';

describe('EditAtcComponent', () => {
  let component: EditAtcComponent;
  let fixture: ComponentFixture<EditAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
