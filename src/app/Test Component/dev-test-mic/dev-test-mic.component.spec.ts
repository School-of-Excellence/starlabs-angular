import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DevTestMicComponent } from './dev-test-mic.component';

describe('DevTestMicComponent', () => {
  let component: DevTestMicComponent;
  let fixture: ComponentFixture<DevTestMicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevTestMicComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DevTestMicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
