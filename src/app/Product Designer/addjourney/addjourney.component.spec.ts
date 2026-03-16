import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddjourneyComponent } from './addjourney.component';

describe('AddjourneyComponent', () => {
  let component: AddjourneyComponent;
  let fixture: ComponentFixture<AddjourneyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddjourneyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddjourneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
