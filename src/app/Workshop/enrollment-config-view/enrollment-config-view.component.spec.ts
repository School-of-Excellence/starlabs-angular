import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnrollmentConfigViewComponent } from './enrollment-config-view.component';

describe('EnrollmentConfigViewComponent', () => {
  let component: EnrollmentConfigViewComponent;
  let fixture: ComponentFixture<EnrollmentConfigViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EnrollmentConfigViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnrollmentConfigViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
