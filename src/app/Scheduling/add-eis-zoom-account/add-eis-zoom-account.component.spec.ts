import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddEISZoomAccountComponent } from './add-eis-zoom-account.component';

describe('AddEISZoomAccountComponent', () => {
  let component: AddEISZoomAccountComponent;
  let fixture: ComponentFixture<AddEISZoomAccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddEISZoomAccountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddEISZoomAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
