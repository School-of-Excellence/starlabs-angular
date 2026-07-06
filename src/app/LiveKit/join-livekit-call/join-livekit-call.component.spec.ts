import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinLivekitCallComponent } from './join-livekit-call.component';

describe('JoinLivekitCallComponent', () => {
  let component: JoinLivekitCallComponent;
  let fixture: ComponentFixture<JoinLivekitCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinLivekitCallComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinLivekitCallComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
