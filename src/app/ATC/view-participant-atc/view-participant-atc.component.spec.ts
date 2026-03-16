import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewParticipantAtcComponent } from './view-participant-atc.component';

describe('ViewParticipantAtcComponent', () => {
  let component: ViewParticipantAtcComponent;
  let fixture: ComponentFixture<ViewParticipantAtcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewParticipantAtcComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewParticipantAtcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
