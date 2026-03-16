import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackageDesignComponent } from './package-design.component';

describe('PackageDesignComponent', () => {
  let component: PackageDesignComponent;
  let fixture: ComponentFixture<PackageDesignComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackageDesignComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PackageDesignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
