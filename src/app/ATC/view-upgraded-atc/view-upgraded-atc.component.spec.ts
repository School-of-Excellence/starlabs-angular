import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewUpgradedAtcComponent } from './view-upgraded-atc.component';

describe('ViewUpgradedAtcComponent', () => {
  let component: ViewUpgradedAtcComponent;
  let fixture: ComponentFixture<ViewUpgradedAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewUpgradedAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewUpgradedAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
