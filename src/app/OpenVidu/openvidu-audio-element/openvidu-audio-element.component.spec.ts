import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenviduAudioElementComponent } from './openvidu-audio-element.component';

describe('OpenviduAudioElementComponent', () => {
  let component: OpenviduAudioElementComponent;
  let fixture: ComponentFixture<OpenviduAudioElementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenviduAudioElementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenviduAudioElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
