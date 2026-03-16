import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenviduRecordingComponent } from './openvidu-recording.component';

describe('OpenviduRecordingComponent', () => {
  let component: OpenviduRecordingComponent;
  let fixture: ComponentFixture<OpenviduRecordingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenviduRecordingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenviduRecordingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
