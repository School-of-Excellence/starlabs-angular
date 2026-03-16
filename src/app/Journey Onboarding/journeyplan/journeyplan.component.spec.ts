import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyplanComponent } from './journeyplan.component';

describe('JourneyplanComponent', () => {
  let component: JourneyplanComponent;
  let fixture: ComponentFixture<JourneyplanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyplanComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyplanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
