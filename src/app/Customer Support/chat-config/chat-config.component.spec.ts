import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatConfigComponent } from './chat-config.component';

describe('ChatConfigComponent', () => {
  let component: ChatConfigComponent;
  let fixture: ComponentFixture<ChatConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
