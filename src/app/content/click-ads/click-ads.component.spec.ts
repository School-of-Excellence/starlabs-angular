import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClickAdsComponent } from './click-ads.component';

describe('ClickAdsComponent', () => {
  let component: ClickAdsComponent;
  let fixture: ComponentFixture<ClickAdsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClickAdsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClickAdsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
