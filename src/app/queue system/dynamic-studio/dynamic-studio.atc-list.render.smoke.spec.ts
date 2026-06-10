/**
 * dynamic-studio.atc-list.render.smoke.spec.ts
 *
 * RENDER-CONTRACT SMOKE for the studio "Prescribed ATC" list widget.
 *
 * WHY THIS EXISTS (see specs/validated/04-dynamic-studio.md §11 + the gap journal
 * specs/journals/2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md):
 *   The prescribed-ATC list (alphaATCList / unvalidatedATCList) is rendered by dynamic-studio
 *   from a read against the SEPARATE NAMED Firestore DB `firestore-atc`
 *   (getFirestore("firestore-atc"), dynamic-studio.component.ts:1672). That DB is OFF-LIMITS and
 *   is NOT provisioned in the e2e test project, and the harness has an active ATC deny-list — so
 *   the data path cannot (and must not) be driven by seeding ATC. The render PATH, however, is a
 *   pure function of the JS array shape. This TestBed smoke renders the SAME markup as
 *   dynamic-studio.component.html:351-406 against a SYNTHETIC array, proving the template
 *   (ngFor ATC -> adjustments -> procedures, the date pipe, the mapProcedure/mapQueue lookups,
 *   the notes block, the empty-state) does not break — with NO Firestore, NO ATC collections, and
 *   NO import of the off-limits src/app/ATC/** component.
 *
 * SCOPE / HONESTY:
 *   - This is a render-CONTRACT smoke, NOT a data-fetch test and NOT a content-fidelity test.
 *   - The host template below is a FAITHFUL MIRROR of dynamic-studio.component.html:351-406.
 *     If that markup changes, update this mirror (it is intentionally a copy so the test needs
 *     neither the 2.6k-line component's async constructor nor its ATC/** sub-import).
 *   - Content fidelity vs the real atcdata/transcription/bigactivity schema is owned by the ATC
 *     concept group (§11), not this smoke.
 */
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

/** Minimal faithful mirror of the prescribedvalidatedatc widget (dynamic-studio.component.html:351-406). */
@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="widgetbox" *ngIf="studiowidgets.includes('prescribedvalidatedatc')">
      <span class="actiontitle">ATC Prescribed to the Participant</span>
      <button class="refreshbtn" (click)="previewATC('alpha')">refresh</button>
      <div class="noatc" *ngIf="alphaATCList.length == 0">No ATC Found!</div>
      <div class="atccard" *ngFor="let atc of alphaATCList; let i = index">
        <div class="steplabel">
          ATC {{ i + 1 }}: {{ atc['atcdata']['prescription_date'].toDate() | date }} - ({{ mapQueue[atc['atcdata']['queueid']] }})
          <button class="editbtn" (click)="updateATC(atc.atcid, 'alpha', '')">Edit ATC</button>
        </div>
        <div class="activity" *ngFor="let activity of atc['atcdata']['bigactivity'] | keyvalue; trackBy: trackById">
          <label>
            <strong>{{ mapActivity[$any(activity.key)] }}: </strong>
            <span *ngFor="let specialist of $any(activity.value); let isLast = last">{{ mapProfile[specialist] }}{{ isLast ? '' : ', ' }}</span>
          </label>
        </div>
        <div class="directive">
          <label><span class="fw-bold">ATC Directive: </span>{{ atc['atcdata']['directive'] }}</label>
        </div>
        <div *ngFor="let adjustment of atc['transcription']; let i = index">
          <div *ngIf="adjustment?.procedure.length != 0">
            <div class="adjustmentlabel"><label><u>Adjustment {{ i + 1 }}</u>. {{ adjustment?.adjustment }}</label></div>
            <div class="procedurelabel" *ngFor="let procedure of adjustment?.procedure; let j = index">
              * {{ mapProcedure[procedure?.procedureid] }}
            </div>
          </div>
        </div>
        <div class="notes" *ngIf="mapATCnotes[atc.atcdata['notesid']] || mapATCnotes[atc.atcdata['mentoringid']]">
          <div *ngIf="!['', null, undefined].includes(mapATCnotes[atc.atcdata['notesid']]?.['consultationsummary'])">
            <span class="actiontitle">ATC Summary:</span>
            <label>{{ mapATCnotes[atc.atcdata['notesid']]?.['consultationsummary'] }}</label>
          </div>
        </div>
      </div>
    </div>
  `,
  schemas: [NO_ERRORS_SCHEMA],
})
class AtcListSmokeHostComponent {
  studiowidgets: string[] = ['prescribedvalidatedatc'];
  alphaATCList: any[] = [];
  mapQueue: Record<string, string> = {};
  mapProcedure: Record<string, string> = {};
  mapActivity: Record<string, string> = {};
  mapProfile: Record<string, string> = {};
  mapATCnotes: Record<string, any> = {};
  // no-op bindings (the real component fetches/edits; the render smoke never invokes them)
  previewATC(_: string) {}
  updateATC(_a: string, _b: string, _c: string) {}
  trackById(_i: number, item: any) {
    return item?.key;
  }
}

/** One synthetic, structurally-complete (but MEANINGLESS) ATC row — exercises every branch of the markup. */
function syntheticAtc() {
  return {
    atcid: 'atc-synthetic-1',
    atcdata: {
      prescription_date: { toDate: () => new Date('2026-05-01T00:00:00Z') },
      queueid: 'q1',
      bigactivity: { act1: ['spec1', 'spec2'] },
      directive: 'SYNTHETIC directive — render smoke only',
      notesid: 'n1',
      mentoringid: null,
    },
    transcription: [
      { adjustment: 'Adjustment with a procedure', procedure: [{ procedureid: 'proc1', status: 'pending' }] },
      { adjustment: 'Adjustment with no procedures', procedure: [] },
    ],
  };
}

describe('dynamic-studio prescribed-ATC list — render-contract smoke (no Firestore, no ATC data)', () => {
  let fixture: ComponentFixture<AtcListSmokeHostComponent>;
  let host: AtcListSmokeHostComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AtcListSmokeHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(AtcListSmokeHostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
  });

  it('renders the empty-state when the ATC list is empty', () => {
    host.alphaATCList = [];
    fixture.detectChanges();
    expect(el.querySelector('.noatc')?.textContent).toContain('No ATC Found!');
    expect(el.querySelectorAll('.atccard').length).toBe(0);
  });

  it('is gated off when the stage does not request the widget', () => {
    host.studiowidgets = []; // no 'prescribedvalidatedatc'
    host.alphaATCList = [syntheticAtc()];
    fixture.detectChanges();
    expect(el.querySelector('.widgetbox')).toBeNull();
  });

  it('renders an ATC card with directive, adjustment and procedure rows from a synthetic array', () => {
    host.alphaATCList = [syntheticAtc()];
    host.mapQueue = { q1: 'Queue One' };
    host.mapProcedure = { proc1: 'Procedure One' };
    host.mapActivity = { act1: 'Diagnostics' };
    host.mapProfile = { spec1: 'Alice', spec2: 'Bob' };
    host.mapATCnotes = { n1: { consultationsummary: 'Synthetic summary' } };
    fixture.detectChanges();

    // exactly one card, no empty-state
    expect(el.querySelector('.noatc')).toBeNull();
    const cards = el.querySelectorAll('.atccard');
    expect(cards.length).toBe(1);

    const card = cards[0] as HTMLElement;
    expect(card.querySelector('.steplabel')?.textContent).toContain('ATC 1:');
    expect(card.querySelector('.steplabel')?.textContent).toContain('Queue One'); // mapQueue lookup
    expect(card.querySelector('.editbtn')).not.toBeNull();
    expect(card.querySelector('.directive')?.textContent).toContain('SYNTHETIC directive');

    // bigactivity keyvalue -> activity label + specialist names
    expect(card.querySelector('.activity')?.textContent).toContain('Diagnostics');
    expect(card.querySelector('.activity')?.textContent).toContain('Alice');

    // only the adjustment WITH a procedure renders a label (the empty one is suppressed by *ngIf)
    const adjustments = card.querySelectorAll('.adjustmentlabel');
    expect(adjustments.length).toBe(1);
    expect(adjustments[0].textContent).toContain('Adjustment 1');
    expect(card.querySelector('.procedurelabel')?.textContent).toContain('Procedure One'); // mapProcedure lookup

    // notes block resolves the consultationsummary
    expect(card.querySelector('.notes')?.textContent).toContain('Synthetic summary');
  });

  it('renders multiple ATC cards (list iteration)', () => {
    host.alphaATCList = [syntheticAtc(), { ...syntheticAtc(), atcid: 'atc-synthetic-2' }];
    fixture.detectChanges();
    expect(el.querySelectorAll('.atccard').length).toBe(2);
  });
});
