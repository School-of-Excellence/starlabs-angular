import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { NewUserDetailsDialogComponent, NewUserDetailsData } from './new-user-details-dialog.component';
import {
  NIL,
  accountLabel,
  buildHoldWrite,
  convertedLabel,
  createdLabel,
  dateLabel,
  detailsView,
  emailLabel,
  formatWhen,
  holdByOf,
  holdCaption,
  initialsOf,
  isOnHold,
  lastLoginLabel,
  movedOnLabel,
  nameLabel,
  phoneLabel,
  statusLabel,
  tagNamesOf,
  toMs,
} from './new-user-details';

/** New Users · person details dialog (plan 2026-11-18): every label rule and the one write. */
describe('new user details — pure helpers', () => {
  const pipe = new DatePipe('en-US');
  const at = new Date(2026, 10, 12, 9, 40);   // 12 Nov 2026, 9:40 AM local
  const label = (d: Date) => pipe.transform(d, 'd MMM y, h:mm a');

  describe('dates', () => {
    it('reads a Timestamp, a Date, an ISO string and epoch ms the same way', () => {
      const ms = at.getTime();
      expect(toMs(Timestamp.fromDate(at))).toBe(ms);
      expect(toMs(at)).toBe(ms);
      expect(toMs(at.toISOString())).toBe(ms);
      expect(toMs(ms)).toBe(ms);
      expect(toMs({ toDate: () => at })).toBe(ms);
    });

    it('is null for missing, empty, zero and unparseable values', () => {
      [undefined, null, '', 0, 'not a date', {}, [], NaN].forEach(v => expect(toMs(v)).withContext(String(v)).toBeNull());
      expect(toMs({ toMillis: () => { throw new Error('bad'); } })).toBeNull();
    });

    it("formats as 'd MMM y, h:mm a' in local time", () => {
      expect(formatWhen(at.getTime())).toBe('12 Nov 2026, 9:40 AM');
      expect(formatWhen(new Date(2026, 0, 3, 21, 5).getTime())).toBe('3 Jan 2026, 9:05 PM');
      expect(formatWhen(null)).toBe('');
      expect(dateLabel(at)).toBe('12 Nov 2026, 9:40 AM');
      expect(dateLabel(undefined)).toBe(NIL);
      expect(dateLabel('garbage', 'Never')).toBe('Never');
    });

    it('Created and Moved on show "—" when missing; Last login shows "Never"', () => {
      expect(createdLabel({ created: Timestamp.fromDate(at) })).toBe(label(at)!);
      expect(createdLabel({})).toBe('—');
      expect(movedOnLabel({ movedon: at })).toBe(label(at)!);
      expect(movedOnLabel({ movedon: null })).toBe('—');
      expect(lastLoginLabel({ last_login: Timestamp.fromDate(at) })).toBe(label(at)!);
      expect(lastLoginLabel({})).toBe('Never');
      expect(lastLoginLabel({ last_login: 'nope' })).toBe('Never');
      expect(lastLoginLabel(null)).toBe('Never');
    });
  });

  describe('name, email, initials', () => {
    it('trims, and shows "—" when missing or blank', () => {
      expect(nameLabel({ name: '  Asha Rao ' })).toBe('Asha Rao');
      expect(nameLabel({ name: '   ' })).toBe('—');
      expect(nameLabel({})).toBe('—');
      expect(nameLabel(undefined)).toBe('—');
      expect(nameLabel({ name: { first: 'x' } })).toBe('—');
      expect(emailLabel({ email: ' asha@example.com ' })).toBe('asha@example.com');
      expect(emailLabel({ email: '' })).toBe('—');
      expect(emailLabel({})).toBe('—');
    });

    it('initials follow the table: first and last word, one word, the email letter, or "?"', () => {
      expect(initialsOf('Asha Devi Rao', 'a@x.com')).toBe('AR');
      expect(initialsOf('asha', '')).toBe('A');
      expect(initialsOf('', 'zed@x.com')).toBe('Z');
      expect(initialsOf('', '')).toBe('?');
    });
  });

  describe('phone', () => {
    it('joins the code and the number with one space, both trimmed', () => {
      expect(phoneLabel({ countryCode: '+91', phonenumber: '9876543210' })).toBe('+91 9876543210');
      expect(phoneLabel({ countryCode: ' +91 ', phonenumber: ' 98765 43210 ' })).toBe('+91 98765 43210');
    });

    it('shows just the number without a code, and "—" without a number', () => {
      expect(phoneLabel({ phonenumber: '9876543210' })).toBe('9876543210');
      expect(phoneLabel({ countryCode: '', phonenumber: '9876543210' })).toBe('9876543210');
      expect(phoneLabel({ countryCode: '+91' })).toBe('—');
      expect(phoneLabel({ countryCode: '+91', phonenumber: '   ' })).toBe('—');
      expect(phoneLabel({})).toBe('—');
      expect(phoneLabel(null)).toBe('—');
    });

    it('reads a number stored as a number', () => {
      expect(phoneLabel({ countryCode: '+1', phonenumber: 5550100 })).toBe('+1 5550100');
    });
  });

  describe('status', () => {
    it('capitalises the first letter only and keeps the rest as stored', () => {
      expect(statusLabel({ status: 'active' })).toBe('Active');
      expect(statusLabel({ status: 'on hold' })).toBe('On hold');
      expect(statusLabel({ status: 'pENDING' })).toBe('PENDING');
      expect(statusLabel({ status: '  inactive ' })).toBe('Inactive');
      expect(statusLabel({ status: 'Active' })).toBe('Active');
    });

    it('shows "—" when missing, blank or not text', () => {
      expect(statusLabel({})).toBe('—');
      expect(statusLabel({ status: '' })).toBe('—');
      expect(statusLabel({ status: '   ' })).toBe('—');
      expect(statusLabel({ status: 1 })).toBe('—');
      expect(statusLabel({ status: true })).toBe('—');
      expect(statusLabel({ status: null })).toBe('—');
      expect(statusLabel(undefined)).toBe('—');
    });
  });

  describe('account and converted', () => {
    it('Account uses the table rule: any truthy value is Enabled', () => {
      expect(accountLabel({ enable: true })).toBe('Enabled');
      expect(accountLabel({ enable: 'yes' })).toBe('Enabled');
      expect(accountLabel({ enable: 1 })).toBe('Enabled');
      expect(accountLabel({ enable: false })).toBe('Disabled');
      expect(accountLabel({ enable: 0 })).toBe('Disabled');
      expect(accountLabel({})).toBe('Disabled');
      expect(accountLabel(null)).toBe('Disabled');
    });

    it('Converted is Yes only for a stored true', () => {
      expect(convertedLabel({ movedtoexist: true })).toBe('Yes');
      expect(convertedLabel({ movedtoexist: 'true' })).toBe('No');
      expect(convertedLabel({ movedtoexist: false })).toBe('No');
      expect(convertedLabel({})).toBe('No');
    });
  });

  describe('tags', () => {
    const map = { t1: 'Gold Members', t2: 'Corporate', t3: '' };

    it('resolves ids through the map in the person\'s own order', () => {
      expect(tagNamesOf({ tags: ['t2', 't1'] }, map)).toEqual(['Corporate', 'Gold Members']);
    });

    it('drops unknown, unnamed and non-text ids, like the table', () => {
      expect(tagNamesOf({ tags: ['t1', 'gone', 't3', 7, null, 'toString'] }, map)).toEqual(['Gold Members']);
    });

    it('keeps a repeated id twice, like the table', () => {
      expect(tagNamesOf({ tags: ['t1', 't1'] }, map)).toEqual(['Gold Members', 'Gold Members']);
    });

    it('is empty without tags or without a map', () => {
      expect(tagNamesOf({}, map)).toEqual([]);
      expect(tagNamesOf({ tags: 't1' }, map)).toEqual([]);
      expect(tagNamesOf({ tags: ['t1'] }, null)).toEqual([]);
    });
  });

  describe('delivery on hold', () => {
    it('is on only for a stored true; missing means off', () => {
      expect(isOnHold({ deliveryonhold: true })).toBeTrue();
      expect(isOnHold({ deliveryonhold: false })).toBeFalse();
      expect(isOnHold({ deliveryonhold: 'true' })).toBeFalse();
      expect(isOnHold({})).toBeFalse();
      expect(isOnHold(null)).toBeFalse();
    });

    it('reads who and when from the stored map', () => {
      expect(holdByOf({ deliveryonholdby: { user: 'p1', time: Timestamp.fromDate(at) } })).toEqual({ user: 'p1', ms: at.getTime() });
      expect(holdByOf({ deliveryonholdby: { user: ' p1 ', time: null } })).toEqual({ user: 'p1', ms: null });
      expect(holdByOf({ deliveryonholdby: { user: { id: 'p2' }, time: at } })).toEqual({ user: 'p2', ms: at.getTime() });
      expect(holdByOf({ deliveryonholdby: { time: at } })).toEqual({ user: '', ms: at.getTime() });
    });

    it('has nothing recorded when the map is missing or not a map', () => {
      expect(holdByOf({})).toBeNull();
      expect(holdByOf({ deliveryonholdby: null })).toBeNull();
      expect(holdByOf({ deliveryonholdby: 'p1' })).toBeNull();
      expect(holdByOf({ deliveryonholdby: ['p1'] })).toBeNull();
      expect(holdByOf(undefined)).toBeNull();
    });

    it('captions "Turned on/off by <name> · <date>"', () => {
      const ms = new Date(2026, 10, 18, 14, 10).getTime();
      expect(holdCaption(true, 'Nanda', ms)).toBe('Turned on by Nanda · 18 Nov 2026, 2:10 PM');
      expect(holdCaption(false, 'Nanda', ms)).toBe('Turned off by Nanda · 18 Nov 2026, 2:10 PM');
    });

    it('leaves the name out when none is found, and the date when none is stored', () => {
      const ms = new Date(2026, 10, 18, 14, 10).getTime();
      expect(holdCaption(true, '', ms)).toBe('Turned on · 18 Nov 2026, 2:10 PM');
      expect(holdCaption(false, null, ms)).toBe('Turned off · 18 Nov 2026, 2:10 PM');
      expect(holdCaption(true, '  ', ms)).toBe('Turned on · 18 Nov 2026, 2:10 PM');
      expect(holdCaption(true, 'Nanda', null)).toBe('Turned on by Nanda');
      expect(holdCaption(false, '', null)).toBe('Turned off');
    });
  });

  describe('the write', () => {
    it('turning on writes the value plus who and when, nothing else', () => {
      const time = serverTimestamp();
      const w = buildHoldWrite(true, 'admin-1', time);
      expect(w).toEqual({ deliveryonhold: true, deliveryonholdby: { time, user: 'admin-1' } });
      expect(Object.keys(w!).sort()).toEqual(['deliveryonhold', 'deliveryonholdby']);
      expect(Object.keys(w!.deliveryonholdby).sort()).toEqual(['time', 'user']);
      expect(w!.deliveryonholdby.time).toBe(time);
    });

    it('turning off records who and when too (every change is recorded)', () => {
      const time = serverTimestamp();
      expect(buildHoldWrite(false, 'admin-1', time)).toEqual({ deliveryonhold: false, deliveryonholdby: { time, user: 'admin-1' } });
    });

    it('trims the profile id, and writes nothing without one', () => {
      const time = serverTimestamp();
      expect(buildHoldWrite(true, ' admin-1 ', time)?.deliveryonholdby.user).toBe('admin-1');
      expect(buildHoldWrite(true, null, time)).toBeNull();
      expect(buildHoldWrite(true, undefined, time)).toBeNull();
      expect(buildHoldWrite(false, '', time)).toBeNull();
      expect(buildHoldWrite(false, '   ', time)).toBeNull();
      expect(buildHoldWrite(true, 42 as any, time)).toBeNull();
    });
  });

  describe('the whole view', () => {
    it('builds every shown value from one document', () => {
      const v = detailsView({
        name: 'Asha Rao', email: 'asha@example.com', countryCode: '+91', phonenumber: '9876543210',
        status: 'active', enable: true, created: Timestamp.fromDate(at), movedtoexist: true, movedon: at,
        tags: ['t1', 'zz'], deliveryonhold: true,
      }, { t1: 'Gold Members' });
      expect(v).toEqual({
        name: 'Asha Rao', email: 'asha@example.com', initials: 'AR', phone: '+91 9876543210', status: 'Active',
        account: 'Enabled', enabled: true, created: '12 Nov 2026, 9:40 AM', lastLogin: 'Never', converted: 'Yes',
        movedOn: '12 Nov 2026, 9:40 AM', tags: ['Gold Members'],
      });
    });

    it('an empty document shows the empty forms', () => {
      expect(detailsView({}, {})).toEqual({
        name: '—', email: '—', initials: '?', phone: '—', status: '—', account: 'Disabled', enabled: false,
        created: '—', lastLogin: 'Never', converted: 'No', movedOn: '—', tags: [],
      });
    });
  });
});

/**
 * The dialog's one write, without a template or Firestore: writeHold is the seam that stands in for updateDoc.
 * The e2e suite cannot make a save fail (the emulator's rules are open), so the failure path is proven here.
 */
describe('new user details dialog — Delivery on hold', () => {
  function make(user: any, tagMap: NewUserDetailsData['tagMap'] = {}) {
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: {} },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: MAT_DIALOG_DATA, useValue: { id: 'nu-1', user, tagMap, profileId: 'admin-1' } as NewUserDetailsData },
      ],
    });
    // No ngOnInit: no live read and no profile lookup; the admin id is set the way loadAdmin() sets it.
    const cmp = TestBed.runInInjectionContext(() => new NewUserDetailsDialogComponent());
    cmp.adminId = 'admin-1';
    cmp.adminChecked = true;
    return cmp;
  }
  /** A slide-toggle change event: `source.checked` is what the switch itself shows. */
  const flip = (to: boolean) => {
    const source = { checked: to };
    return { event: { checked: to, source } as any, source };
  };
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it('a failed save puts the switch back to the stored value, shows the error, and tried exactly one write', async () => {
    const cmp = make({ name: 'Asha Rao' });
    const save = deferred();
    const write = spyOn(cmp as any, 'writeHold').and.returnValue(save.promise);
    const err = spyOn(console, 'error');
    const { event, source } = flip(true);

    const done = cmp.onHoldChange(event);
    expect(cmp.saving).withContext('saving while the write runs').toBeTrue();
    expect(cmp.pending).toBeTrue();
    expect(cmp.checked).withContext('the switch shows the value being saved').toBeTrue();
    expect(cmp.toggleDisabled).withContext('no second flip while saving').toBeTrue();

    save.reject(new Error('permission-denied'));
    await done;
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.calls.mostRecent().args[0]).toEqual({
      deliveryonhold: true, deliveryonholdby: { time: jasmine.anything(), user: 'admin-1' },
    });
    expect(cmp.saving).toBeFalse();
    expect(cmp.pending).toBeNull();
    expect(cmp.saveFailed).withContext('the inline error shows').toBeTrue();
    expect(cmp.stored).withContext('nothing was stored').toBeFalse();
    expect(cmp.checked).toBeFalse();
    expect(source.checked).withContext('the switch itself is put back').toBeFalse();
    expect(cmp.toggleDisabled).withContext('it can be tried again').toBeFalse();
    expect(err).toHaveBeenCalled();
  });

  it('a failed turn-off leaves a stored hold on', async () => {
    const cmp = make({ name: 'Asha Rao', deliveryonhold: true });
    spyOn(cmp as any, 'writeHold').and.returnValue(Promise.reject(new Error('offline')));
    spyOn(console, 'error');
    const { event, source } = flip(false);
    await cmp.onHoldChange(event);
    expect(cmp.saveFailed).toBeTrue();
    expect(cmp.stored).toBeTrue();
    expect(source.checked).toBeTrue();
  });

  it('a successful save keeps the new value, clears an earlier error, and writes once', async () => {
    const cmp = make({ name: 'Asha Rao' });
    cmp.saveFailed = true;
    const write = spyOn(cmp as any, 'writeHold').and.returnValue(Promise.resolve());
    const { event, source } = flip(true);
    await cmp.onHoldChange(event);
    expect(write).toHaveBeenCalledTimes(1);
    expect(cmp.saveFailed).toBeFalse();
    expect(cmp.saving).toBeFalse();
    expect(cmp.stored).toBeTrue();
    expect(source.checked).toBeTrue();
  });

  it('writes nothing while the admin is unknown, and puts the switch back', async () => {
    const cmp = make({ name: 'Asha Rao' });
    cmp.adminId = null;
    const write = spyOn(cmp as any, 'writeHold');
    const { event, source } = flip(true);
    await cmp.onHoldChange(event);
    expect(write).not.toHaveBeenCalled();
    expect(source.checked).toBeFalse();
    expect(cmp.saveFailed).toBeFalse();
  });

  it("follows the screen's tag names when they arrive after the dialog opened", () => {
    let map: Record<string, string> = {};
    const cmp = make({ name: 'Asha Rao', tags: ['t2', 't1'] }, () => map);
    expect(cmp.view.tags).withContext('no tag names read yet').toEqual([]);
    map = { t1: 'Gold', t2: 'Silver' };
    expect(cmp.view.tags).toEqual(['Silver', 'Gold']);
    map = { t1: 'Gold (renamed)' };
    expect(cmp.view.tags).toEqual(['Gold (renamed)']);
  });
});
