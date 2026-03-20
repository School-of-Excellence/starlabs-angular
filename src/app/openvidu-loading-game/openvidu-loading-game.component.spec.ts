import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenviduLoadingGameComponent } from './openvidu-loading-game.component';

describe('OpenviduLoadingGameComponent', () => {
  let component: OpenviduLoadingGameComponent;
  let fixture: ComponentFixture<OpenviduLoadingGameComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenviduLoadingGameComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenviduLoadingGameComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
