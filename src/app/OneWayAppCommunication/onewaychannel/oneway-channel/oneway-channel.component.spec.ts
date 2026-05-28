import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OnewayChannelComponent } from './oneway-channel.component';

describe('OnewayChannelComponent', () => {
  let component: OnewayChannelComponent;
  let fixture: ComponentFixture<OnewayChannelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnewayChannelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OnewayChannelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
