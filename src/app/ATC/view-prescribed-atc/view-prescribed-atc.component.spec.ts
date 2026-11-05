import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';

import { ViewPrescribedATCComponent } from './view-prescribed-atc.component';

describe('ViewPrescribedATCComponent', () => {
  let component: ViewPrescribedATCComponent;
  let fixture: ComponentFixture<ViewPrescribedATCComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewPrescribedATCComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewPrescribedATCComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

// ATC forms (plan 2026-10-28, answers from the one forms query since 2026-11-02): the card count and the form rows are
// worked out once into maps; these run the builders on a plain object (no Firestore needed)
describe('ViewPrescribedATCComponent ATC forms', () => {
  const proto = ViewPrescribedATCComponent.prototype as any;
  const fakeAtc = (id: string, data: any, collection = 'atc_alpha') =>
    ({ id, ref: { parent: { id: collection }, path: `${collection}/${id}` }, data: () => data });
  let page: any;
  // answer rows the forms query gives for one ATC: { formid: answerid }, filled by `profileid` (default: the specialist)
  const answers = (byForm: any, profileid = 'p-spec') => Object.entries(byForm).map(([formid, answerid]) => ({ formid, answerid, profileid }));

  beforeEach(() => {
    page = {
      atcModelList: [
        { atcmodel: 'WiSH', forms: [
          { formid: 'f-life', filledby: 'participant' },
          { formid: 'f-clarity', filledby: 'specialist' },
          { formid: 'f-review', filledby: 'specialist' },
          { formid: 'f-sleep', filledby: 'participant' },
          { formid: 'f-diet', filledby: 'participant' },
        ] },
        { atcmodel: 'Plain' },
        { atcmodel: 'Family', forms: [
          { formid: 'f-life', filledby: 'participant' },
          { formid: 'f-support', filledby: 'sponsor' },
          { formid: 'f-feedback', filledby: 'sponsor' },
        ] },
      ],
      mapFormsCount: {}, mapFormRows: {}, mapFormView: {}, mapFormRequests: { a: [] }, mapAtcAnswers: { a: [], b: [], u: [], p: [], v2: [], s: [] }, mapAtcVersionDoc: {}, datepipe: new DatePipe('en-US'),
      profileMap: { 'p-spec': { name: 'Dr Anand' }, 'p-sponsor': { name: 'Ravi Kumar' } },
      mapForm: {
        'f-life': { name: 'Life Report', deleted: false }, 'f-clarity': { name: 'Clarity Call', deleted: false },
        'f-review': { name: 'review notes', deleted: false }, 'f-sleep': { name: 'Sleep Diary', deleted: false },
        'f-diet': { name: 'Diet Log', deleted: false }, 'f-support': { name: 'Family Support', deleted: false },
        'f-feedback': { name: 'Sponsor Feedback', deleted: false },
      },
    };
    page.validatedModelForms = proto.validatedModelForms;
    page.isValidated = proto.isValidated;
    page.modelForms = proto.modelForms;
  });

  it('card count only for validated ATCs whose model has forms', () => {
    page.sourceReportATC = [
      fakeAtc('validated', { product: ' wish ', status: 'validated', formsubmitted: { 'f-clarity': 'a1', 'f-other': 'a2' } }),
      fakeAtc('visible', { product: 'WiSH' }),
      fakeAtc('unvalidated', { product: 'WiSH', status: 'atc given' }),
      fakeAtc('in-validation', { product: 'WiSH', status: 'atc given' }, 'atc_to_validate'),
      fakeAtc('no-forms', { product: 'Plain', status: 'validated' }),
    ];
    proto.buildFormsCount.call(page);
    expect(page.mapFormsCount).toEqual({ validated: { done: 1, total: 5 }, visible: { done: 0, total: 5 } });
  });

  it('rows in name order with status from the ATC\'s answers and the requests of this ATC or its earlier versions', () => {
    const atc = fakeAtc('v2', { product: 'WiSH', status: 'validated' });
    page.mapAtcAnswers['v2'] = [...answers({ 'f-clarity': 'a-c' }), ...answers({ 'f-life': 'a-l', 'f-sleep': 'a-s' }, 'p-tfa')];
    // the listener's query already keeps only this ATC's ids (v2 + earlier version v1)
    page.mapFormRequests['v2'] = [
      { atcid: 'v1', formid: 'f-life', answerid: 'a-l', formstatus: 'sent' }, // earlier version, resent
      { atcid: 'v2', formid: 'f-diet', formstatus: 'sent' },                  // sent
    ];
    proto.buildFormRows.call(page, atc);
    expect(page.mapFormRows['v2'].map((r: any) => [r.name, r.status, r.answerid])).toEqual([
      ['Clarity Call', 'Submitted', 'a-c'],
      ['Diet Log', 'Waiting for participant', null],
      ['Life Report', 'Waiting for update', 'a-l'],
      ['review notes', 'To fill', null],
      ['Sleep Diary', 'Submitted', 'a-s'],
    ]);
  });

  it('no rows until the requests and the answers have loaded (so Send never shows before an existing request is known)', () => {
    proto.buildFormRows.call(page, fakeAtc('b', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['b']).toBeUndefined();
    page.mapFormRequests['b'] = [];
    page.mapAtcAnswers['b'] = undefined;
    proto.buildFormRows.call(page, fakeAtc('b', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['b']).toBeUndefined();
    page.mapAtcAnswers['b'] = [];
    proto.buildFormRows.call(page, fakeAtc('b', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['b'].length).toBe(5);
  });

  it('a soft-deleted form already sent and pending is not "deleted" (Revoke stays on); once not pending it is', () => {
    page.mapForm['f-diet'].deleted = true;
    page.mapFormRequests['a'] = [{ atcid: 'a', formid: 'f-diet', formstatus: 'sent', path: 'atc_form_requests/a_f-diet' }];
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    const diet = () => page.mapFormRows['a'].find((r: any) => r.formid === 'f-diet');
    expect([diet().status, diet().pending, diet().deleted, diet().canWithdraw]).toEqual(['Waiting for participant', true, false, true]);
    page.mapFormRequests['a'] = [];
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    expect([diet().status, diet().deleted, diet().canSend, diet().note]).toEqual(['Not required', true, false, 'This form was deleted']);
  });

  it('participant form with no answer and no request is Not sent', () => {
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['a'].find((r: any) => r.formid === 'f-life').status).toBe('Not sent');
  });

  it('a request the participant app submitted is kept, but the row is no longer pending', () => {
    const atc = fakeAtc('v2', { product: 'WiSH', status: 'validated' });
    page.mapAtcAnswers['v2'] = answers({ 'f-life': 'a-l' }, 'p-tfa');
    page.mapFormRequests['v2'] = [{ atcid: 'v2', formid: 'f-life', answerid: 'a-l', formstatus: 'submitted' }];
    proto.buildFormRows.call(page, atc);
    const life = page.mapFormRows['v2'].find((r: any) => r.formid === 'f-life');
    expect(life.status).toBe('Submitted'); // not 'Waiting for update' — the request is history now
    expect(life.pending).toBe(false);
    expect([life.canResend, life.canWithdraw]).toEqual([true, false]); // Ask to update shows, Withdraw does not
  });

  it('no rows while forms are loading, and a delivery form doc that is gone is not listed', () => {
    delete page.mapForm['f-diet'];
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['a']).toBeUndefined();
    page.mapForm['f-diet'] = null;
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['a'].map((r: any) => r.formid)).not.toContain('f-diet');
  });

  it('a soft-deleted delivery form is marked deleted only while it has no answer', () => {
    page.mapForm['f-clarity'].deleted = true;
    page.mapForm['f-review'].deleted = true;
    page.mapAtcAnswers['a'] = answers({ 'f-clarity': 'a-c' });
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    const row = (id: string) => page.mapFormRows['a'].find((r: any) => r.formid === id);
    expect(row('f-clarity').deleted).toBe(false);
    expect(row('f-review').deleted).toBe(true);
  });

  it('each status has its explanation line and only its own buttons; groups and summary line', () => {
    const sentat = { toDate: () => new Date(2026, 9, 27) };
    page.mapFormRequests['a'] = [
      { atcid: 'a', formid: 'f-diet', formstatus: 'sent', sentat },
      { atcid: 'a', formid: 'f-life', formstatus: 'sent', answerid: 'a-l', sentat },
    ];
    page.mapAtcAnswers['a'] = [...answers({ 'f-clarity': 'a-c' }), ...answers({ 'f-life': 'a-l' }, 'p-tfa')];
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    const pick = (r: any) => [r.status, r.note, ['canView', 'canEdit', 'canFill', 'canSend', 'canResend', 'canWithdraw'].filter((k) => r[k])];
    const row = (id: string) => pick(page.mapFormRows['a'].find((r: any) => r.formid === id));
    expect(row('f-clarity')).toEqual(['Submitted', 'Filled by Dr Anand', ['canView', 'canEdit']]);
    expect(row('f-review')).toEqual(['To fill', "You haven't filled this yet", ['canFill']]);
    expect(row('f-sleep')).toEqual(['Not sent', "The participant can't see it yet", ['canSend']]);
    expect(row('f-diet')).toEqual(['Waiting for participant', 'Sent 27 Oct 2026', ['canWithdraw']]);
    expect(row('f-life')).toEqual(['Waiting for update', 'Sent back 27 Oct 2026 to update their answer', ['canView', 'canWithdraw']]);
    const view = page.mapFormView['a'];
    expect(view.specialist.map((r: any) => r.formid)).toEqual(['f-clarity', 'f-review']);
    expect(view.participant.map((r: any) => r.formid)).toEqual(['f-diet', 'f-life', 'f-sleep']);
    expect(view.summary).toBe('2 of 5 submitted · 2 waiting for participant · 1 for you to fill');
  });

  it('no rows for an unvalidated ATC or a model without forms', () => {
    proto.buildFormRows.call(page, fakeAtc('u', { product: 'WiSH', status: 'atc given' }));
    proto.buildFormRows.call(page, fakeAtc('p', { product: 'Plain', status: 'validated' }));
    expect(page.mapFormRows).toEqual({});
  });

  it('two answers of one form on the ATC give two rows (no de-duplication)', () => {
    page.mapAtcAnswers['a'] = [{ formid: 'f-clarity', answerid: 'c1', profileid: 'p-spec' }, { formid: 'f-clarity', answerid: 'c2', profileid: 'p-spec' }];
    proto.buildFormRows.call(page, fakeAtc('a', { product: 'WiSH', status: 'validated' }));
    expect(page.mapFormRows['a'].filter((r: any) => r.formid === 'f-clarity').map((r: any) => r.answerid)).toEqual(['c1', 'c2']);
    expect(page.mapFormRows['a'].length).toBe(6);
  });

  // sponsor forms (plan 2026-11-02)
  it('sponsor forms: own group, sponsor wording, Send to sponsor; the sponsor is free until a sponsor request exists', () => {
    const atc = (data: any = {}) => fakeAtc('s', { product: 'Family', status: 'validated', profileid: 'p-tfa', ...data });
    page.mapFormRequests['s'] = [];
    proto.buildFormRows.call(page, atc());
    let view = page.mapFormView['s'];
    expect(view.participant.map((r: any) => r.formid)).toEqual(['f-life']);
    expect(view.sponsor.map((r: any) => r.formid)).toEqual(['f-support', 'f-feedback']);
    expect([view.sponsor[0].status, view.sponsor[0].note, view.sponsor[0].sendLabel]).toEqual(['Not sent', "The sponsor can't see it yet", 'Send to sponsor']);
    expect([view.sponsorid, view.sponsorName, view.sponsorLocked]).toEqual([null, null, false]);

    page.mapFormRequests['s'] = [{ atcid: 's', formid: 'f-support', profileid: 'p-sponsor', filledby: 'sponsor', formstatus: 'sent' }];
    proto.buildFormRows.call(page, atc({ sponsorid: 'p-sponsor' }));
    view = page.mapFormView['s'];
    expect(view.sponsor.find((r: any) => r.formid === 'f-support').status).toBe('Waiting for sponsor');
    expect([view.sponsorName, view.sponsorLocked]).toEqual(['Ravi Kumar', true]);
    expect(view.summary).toBe('0 of 3 submitted · 1 waiting for sponsor');
  });

  it('sponsor locked by a sponsor answer alone; a participant request does not lock it', () => {
    const atc = fakeAtc('s', { product: 'Family', status: 'validated', profileid: 'p-tfa', sponsorid: 'p-sponsor' });
    page.mapFormRequests['s'] = [{ atcid: 's', formid: 'f-life', profileid: 'p-tfa', filledby: 'participant', formstatus: 'sent' }];
    proto.buildFormRows.call(page, atc);
    expect(page.mapFormView['s'].sponsorLocked).toBe(false);
    page.mapAtcAnswers['s'] = answers({ 'f-support': 'a-sp' }, 'p-sponsor');
    proto.buildFormRows.call(page, atc);
    expect(page.mapFormView['s'].sponsorLocked).toBe(true);
    expect(page.mapFormRows['s'].find((r: any) => r.formid === 'f-support').note).toBe('Filled by the sponsor');
  });
});
