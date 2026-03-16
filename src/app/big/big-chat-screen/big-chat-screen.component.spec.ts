import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BigChatScreenComponent } from './big-chat-screen.component';

describe('BigChatScreenComponent', () => {
  let component: BigChatScreenComponent;
  let fixture: ComponentFixture<BigChatScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BigChatScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BigChatScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
