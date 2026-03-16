import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddAudioComponent } from './add-audio.component';

describe('AddAudioComponent', () => {
  let component: AddAudioComponent;
  let fixture: ComponentFixture<AddAudioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddAudioComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddAudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
