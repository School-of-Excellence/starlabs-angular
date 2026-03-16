import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewparticipantTierAccessComponent } from './viewparticipant-tier-access.component';

describe('ViewparticipantTierAccessComponent', () => {
  let component: ViewparticipantTierAccessComponent;
  let fixture: ComponentFixture<ViewparticipantTierAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewparticipantTierAccessComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewparticipantTierAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
