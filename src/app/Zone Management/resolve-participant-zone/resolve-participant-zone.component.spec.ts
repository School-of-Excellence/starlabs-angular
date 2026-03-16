import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResolveParticipantZoneComponent } from './resolve-participant-zone.component';

describe('ResolveParticipantZoneComponent', () => {
  let component: ResolveParticipantZoneComponent;
  let fixture: ComponentFixture<ResolveParticipantZoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResolveParticipantZoneComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResolveParticipantZoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
