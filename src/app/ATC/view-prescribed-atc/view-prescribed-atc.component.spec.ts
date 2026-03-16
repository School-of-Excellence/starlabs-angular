import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewPrescribedATCComponent } from './view-prescribed-atc.component';

describe('ViewPrescribedATCComponent', () => {
  let component: ViewPrescribedATCComponent;
  let fixture: ComponentFixture<ViewPrescribedATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewPrescribedATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewPrescribedATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
