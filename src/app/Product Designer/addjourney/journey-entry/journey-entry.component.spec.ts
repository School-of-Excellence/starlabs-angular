import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyEntryComponent } from './journey-entry.component';

describe('JourneyEntryComponent', () => {
  let component: JourneyEntryComponent;
  let fixture: ComponentFixture<JourneyEntryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyEntryComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
