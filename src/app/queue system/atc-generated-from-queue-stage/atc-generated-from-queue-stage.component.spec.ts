import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtcGeneratedFromQueueStageComponent } from './atc-generated-from-queue-stage.component';

describe('AtcGeneratedFromQueueStageComponent', () => {
  let component: AtcGeneratedFromQueueStageComponent;
  let fixture: ComponentFixture<AtcGeneratedFromQueueStageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AtcGeneratedFromQueueStageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AtcGeneratedFromQueueStageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
