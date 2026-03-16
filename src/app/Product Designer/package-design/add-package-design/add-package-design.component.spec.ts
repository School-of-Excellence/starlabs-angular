import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPackageDesignComponent } from './add-package-design.component';

describe('AddPackageDesignComponent', () => {
  let component: AddPackageDesignComponent;
  let fixture: ComponentFixture<AddPackageDesignComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPackageDesignComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddPackageDesignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
