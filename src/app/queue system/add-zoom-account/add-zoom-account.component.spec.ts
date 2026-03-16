import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddZoomAccountComponent } from './add-zoom-account.component';

describe('AddZoomAccountComponent', () => {
  let component: AddZoomAccountComponent;
  let fixture: ComponentFixture<AddZoomAccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddZoomAccountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddZoomAccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
