import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnrollmentConfigCreateComponent } from './enrollment-config-create.component';

describe('EnrollmentConfigCreateComponent', () => {
  let component: EnrollmentConfigCreateComponent;
  let fixture: ComponentFixture<EnrollmentConfigCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnrollmentConfigCreateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnrollmentConfigCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
