import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EitEducationAtcComponent } from './eit-education-atc.component';

describe('EitEducationAtcComponent', () => {
  let component: EitEducationAtcComponent;
  let fixture: ComponentFixture<EitEducationAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EitEducationAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EitEducationAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
