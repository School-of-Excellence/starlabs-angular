import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChannelCommunicationComponent } from './channel-communication.component';

describe('ChannelCommunicationComponent', () => {
  let component: ChannelCommunicationComponent;
  let fixture: ComponentFixture<ChannelCommunicationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChannelCommunicationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChannelCommunicationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
