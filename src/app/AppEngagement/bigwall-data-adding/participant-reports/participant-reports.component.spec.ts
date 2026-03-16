import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParticipantReportsComponent } from './participant-reports.component';

describe('ParticipantReportsComponent', () => {
  let component: ParticipantReportsComponent;
  let fixture: ComponentFixture<ParticipantReportsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParticipantReportsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParticipantReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
