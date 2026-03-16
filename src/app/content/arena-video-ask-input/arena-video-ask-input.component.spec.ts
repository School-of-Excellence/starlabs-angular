import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArenaVideoAskInputComponent } from './arena-video-ask-input.component';

describe('ArenaVideoAskInputComponent', () => {
  let component: ArenaVideoAskInputComponent;
  let fixture: ComponentFixture<ArenaVideoAskInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaVideoAskInputComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArenaVideoAskInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
