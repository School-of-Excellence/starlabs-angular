import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SlackwebhookurlsComponent } from './slackwebhookurls.component';

describe('SlackwebhookurlsComponent', () => {
  let component: SlackwebhookurlsComponent;
  let fixture: ComponentFixture<SlackwebhookurlsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SlackwebhookurlsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SlackwebhookurlsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
