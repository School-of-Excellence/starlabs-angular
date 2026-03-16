import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EiflixBannerComponent } from './eiflix-banner.component';

describe('EiflixBannerComponent', () => {
  let component: EiflixBannerComponent;
  let fixture: ComponentFixture<EiflixBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EiflixBannerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EiflixBannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
