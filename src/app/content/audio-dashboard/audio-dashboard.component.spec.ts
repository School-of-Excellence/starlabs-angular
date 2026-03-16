import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AudioDashboardComponent } from './audio-dashboard.component';

describe('AudioDashboardComponent', () => {
  let component: AudioDashboardComponent;
  let fixture: ComponentFixture<AudioDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AudioDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AudioDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
