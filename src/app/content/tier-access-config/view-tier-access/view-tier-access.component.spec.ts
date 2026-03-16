import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewTierAccessComponent } from './view-tier-access.component';

describe('ViewTierAccessComponent', () => {
  let component: ViewTierAccessComponent;
  let fixture: ComponentFixture<ViewTierAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewTierAccessComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewTierAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
