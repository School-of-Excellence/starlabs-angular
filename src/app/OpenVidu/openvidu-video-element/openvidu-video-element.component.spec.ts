import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenviduVideoElementComponent } from './openvidu-video-element.component';

describe('OpenviduVideoElementComponent', () => {
  let component: OpenviduVideoElementComponent;
  let fixture: ComponentFixture<OpenviduVideoElementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenviduVideoElementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenviduVideoElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
