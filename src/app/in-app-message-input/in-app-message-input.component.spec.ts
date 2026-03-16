import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InAppMessageInputComponent } from './in-app-message-input.component';

describe('InAppMessageInputComponent', () => {
  let component: InAppMessageInputComponent;
  let fixture: ComponentFixture<InAppMessageInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InAppMessageInputComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InAppMessageInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
