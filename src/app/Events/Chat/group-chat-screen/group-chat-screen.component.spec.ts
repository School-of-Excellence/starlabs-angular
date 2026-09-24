import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupChatScreenComponent } from './group-chat-screen.component';

describe('GroupChatScreenComponent', () => {
  let component: GroupChatScreenComponent;
  let fixture: ComponentFixture<GroupChatScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupChatScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GroupChatScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
