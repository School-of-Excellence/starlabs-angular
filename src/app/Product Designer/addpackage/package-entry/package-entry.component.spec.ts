import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackageEntryComponent } from './package-entry.component';

describe('PackageEntryComponent', () => {
  let component: PackageEntryComponent;
  let fixture: ComponentFixture<PackageEntryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackageEntryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PackageEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
