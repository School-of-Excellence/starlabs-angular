import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JourneyPipelineComponent } from './journey-pipeline.component';

describe('JourneyPipelineComponent', () => {
  let component: JourneyPipelineComponent;
  let fixture: ComponentFixture<JourneyPipelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JourneyPipelineComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JourneyPipelineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
