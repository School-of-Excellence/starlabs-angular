import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocationlogComponent } from './locationlog.component';

describe('LocationlogComponent', () => {
  let component: LocationlogComponent;
  let fixture: ComponentFixture<LocationlogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationlogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LocationlogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
