import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneycoachDuplicateComponent } from './journeycoach-duplicate.component';

describe('JourneycoachDuplicateComponent', () => {
  let component: JourneycoachDuplicateComponent;
  let fixture: ComponentFixture<JourneycoachDuplicateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneycoachDuplicateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneycoachDuplicateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
