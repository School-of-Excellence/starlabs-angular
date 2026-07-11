import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { Subject } from 'rxjs';

import { ArenaBoardComponent } from './arena-board.component';
import { AuthguardService } from '../../authguard.service';

// Renders the REAL ArenaBoardComponent in a real (headless) browser and asserts
// the actual rendered DOM. Firestore is never hit: paramMap is a Subject that
// never emits, so bootstrap() doesn't run, and we drive the view by setting the
// component's data fields directly (exactly what the Firestore streams would).
describe('ArenaBoardComponent — stage-scoping + load states (live DOM)', () => {
  let fixture: ComponentFixture<ArenaBoardComponent>;
  let c: ArenaBoardComponent;

  // A queue running two stages at once. S1 serves Diagnostics (actA),
  // S2 serves Consultation (actB) — the exact multi-stage bleed scenario.
  const queueData = {
    queuename: 'Diagnostics Queue',
    stageproperty: {
      'Diagnostics':  { compulsoryactivity: { c0: ['actA'] } },
      'Consultation': { compulsoryactivity: { c0: ['actB'] } },
    },
  };
  const studios = [
    { docid: 'S1', participants: ['p1'], participantsactivity: { p1: 'actA' }, studioin: true, checkin: true },
    { docid: 'S2', participants: ['p2'], participantsactivity: { p2: 'actB' }, studioin: true, checkin: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArenaBoardComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: new Subject() } }, // never emits -> no bootstrap
        { provide: Router, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: Storage, useValue: {} },
        { provide: AuthguardService, useValue: {
          getRoles: () => Promise.resolve({}),
          getProfileMap: () => Promise.resolve({ map: {} }),
        } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArenaBoardComponent);
    c = fixture.componentInstance;
    c.queueData = queueData;
    c.studios = studios as any;
    c.liveAssignments = [];
    c.invitations = [];
    c.mapProfile = { p1: 'Alice Diag', p2: 'Bob Consult' };
    c.isLoading = false;
    c.loadError = null;
  });

  it('Diagnostics board shows ONLY its own stage studio (S1/Alice), not S2/Bob', () => {
    c.stage = 'Diagnostics';
    fixture.detectChanges();
    const idle = fixture.nativeElement.querySelectorAll('.kc--idle');
    expect(idle.length).toBe(1);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alice Diag');
    expect(text).not.toContain('Bob Consult');
  });

  it('Consultation board shows ONLY its own stage studio (S2/Bob), not S1/Alice', () => {
    c.stage = 'Consultation';
    fixture.detectChanges();
    const idle = fixture.nativeElement.querySelectorAll('.kc--idle');
    expect(idle.length).toBe(1);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bob Consult');
    expect(text).not.toContain('Alice Diag');
  });

  it('two different-stage boards render DIFFERENT studios (not identical)', () => {
    c.stage = 'Diagnostics';
    expect(c.stageStudios.map(s => s.docid)).toEqual(['S1']);
    c.stage = 'Consultation';
    expect(c.stageStudios.map(s => s.docid)).toEqual(['S2']);
  });

  it('a stage with no activity config is NOT over-filtered (fallback)', () => {
    c.stage = 'UnknownStage';
    expect(c.stageStudios.map(s => s.docid)).toEqual(['S1', 'S2']);
  });

  it('loader spinner renders while loading', () => {
    c.stage = 'Diagnostics';
    c.isLoading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.arena__loader')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.arena__spinner')).toBeTruthy();
  });

  it('load-error banner renders (instead of a silent blank) and hides the spinner', () => {
    c.stage = 'Diagnostics';
    c.isLoading = false;
    c.loadError = 'Some board data failed to load (connection or permissions). Tap Retry.';
    fixture.detectChanges();
    const banner = fixture.nativeElement.querySelector('.arena__load-error');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('failed to load');
    expect(fixture.nativeElement.querySelector('.arena__loader')).toBeFalsy();
  });
});
