import { CommunicationDialogComponent, CommRow } from './communication-dialog.component';

/**
 * Communication dialog — merging the two people collections, the filters, the
 * selection rules, and what the three send buttons hand back to the dashboard.
 *
 * Nothing here boots Angular or touches Firestore: `buildRows` is pure, and the
 * table's data source is a plain class, so the component is constructed directly
 * with a stub dialog ref and fed fixture documents.
 */
describe('CommunicationDialogComponent', () => {

  const sent: { email: any[]; whatsapp: any[]; notification: any[] } = { email: [], whatsapp: [], notification: [] };

  function make(): CommunicationDialogComponent {
    sent.email = []; sent.whatsapp = []; sent.notification = [];
    const c = new CommunicationDialogComponent({ close: () => {} } as any, {
      workshopId: 'w1', workshopTitle: 'Test Workshop', workshopRef: {} as any,
      send: {
        email: r => { sent.email = r; },
        whatsapp: r => { sent.whatsapp = r; },
        notification: r => { sent.notification = r; },
      },
    });
    c.journeyNames = { jA: 'Foundations', jB: 'Momentum' };
    return c;
  }

  /** `participant metadata` — lowercase `countrycode`. */
  const meta = [
    { id: 'doc-e1', data: { profileid: 'e1', name: 'Exist One', email: 'e1@x.io', phonenumber: '9000000001', countrycode: '91', activejourney: 'jA', customerstatus: 'active' } },
    { id: 'e2',     data: { name: 'Exist Two', email: 'e2@x.io', phonenumber: '', countrycode: '+1', activejourney: 'jB', customerstatus: 'expired' } },   // no profileid field → doc id
    { id: 'm1',     data: { profileid: 'm1', name: 'Moved One', email: 'm1@x.io', phonenumber: '9000000003', countrycode: '44', activejourney: 'jA', customerstatus: 'expired' } },
    { id: 'e3',     data: { profileid: 'e3', name: 'Exist Three', email: '', phonenumber: '9000000004', countryCode: '61', activejourney: 'jZ' } },      // camelCase fallback, unknown journey
  ];
  /** `new_user_data` — camelCase `countryCode`. */
  const fresh = [
    { id: 'n1', data: { name: 'New One', email: 'n1@x.io', phonenumber: '9000000005', countryCode: '91' } },
    { id: 'n2', data: { name: 'New Two', email: '', phonenumber: '', countryCode: '' } },
    { id: 'm1', data: { name: 'Moved One (stale)', email: 'old@x.io', phonenumber: '1', countryCode: '99', movedtoexist: true } },   // also in metadata
    { id: 'm2', data: { name: 'Moved Two', email: 'm2@x.io', phonenumber: '9000000007', countryCode: '1', movedtoexist: true } },    // NOT in metadata
  ];
  const enrolled = new Set(['e1', 'm1', 'n1', 'm2']);

  function loaded(): CommunicationDialogComponent {
    const c = make();
    c.useRows(c.buildRows(meta, fresh, enrolled).rows);
    return c;
  }
  const ids = (rows: CommRow[]) => rows.map(r => r.profileid).sort();
  const byId = (c: CommunicationDialogComponent, id: string) => (c as any).all.find((r: CommRow) => r.profileid === id) as CommRow;

  // ───────────────────────── building the rows ─────────────────────────
  describe('buildRows', () => {
    it('yields one row per person, never a duplicate for someone in both collections', () => {
      const { rows } = make().buildRows(meta, fresh, enrolled);
      expect(ids(rows)).toEqual(['e1', 'e2', 'e3', 'm1', 'm2', 'n1', 'n2']);
    });

    it('keys a metadata row by its profileid field, falling back to the document id', () => {
      const c = loaded();
      expect(byId(c, 'e1').name).toBe('Exist One');     // doc id was "doc-e1"
      expect(byId(c, 'e2').name).toBe('Exist Two');     // no profileid field
    });

    it('reads the lowercase country code from metadata and strips a leading plus', () => {
      const c = loaded();
      expect(byId(c, 'e1').countryCode).toBe('91');
      expect(byId(c, 'e2').countryCode).toBe('1');
    });

    it('falls back to the camelCase spelling when a metadata document only has that', () => {
      expect(byId(loaded(), 'e3').countryCode).toBe('61');
    });

    it('reads the camelCase country code from new_user_data', () => {
      expect(byId(loaded(), 'n1').countryCode).toBe('91');
    });

    it('marks a new_user_data person with no movedtoexist flag as NEW', () => {
      expect(byId(loaded(), 'n1').kind).toBe('new');
    });

    it('marks a moved person who has no metadata document as EXISTING', () => {
      const r = byId(loaded(), 'm2');
      expect(r.kind).toBe('exist');
      expect(r.name).toBe('Moved Two');
    });

    it('lets participant metadata win over a stale moved new_user_data document', () => {
      const r = byId(loaded(), 'm1');
      expect(r.kind).toBe('exist');
      expect(r.name).toBe('Moved One');
      expect(r.email).toBe('m1@x.io');
      expect(r.countryCode).toBe('44');
      expect(r.customerstatus).toBe('expired');
    });

    it('counts fresh and moved new-user documents separately', () => {
      const { fresh: f, moved } = make().buildRows(meta, fresh, enrolled);
      expect(f).toBe(2);
      expect(moved).toBe(2);
    });

    it('flags enrollment from the workshop-scoped enrolled set, for both kinds', () => {
      const c = loaded();
      expect(byId(c, 'e1').enrolled).toBe(true);
      expect(byId(c, 'e2').enrolled).toBe(false);
      expect(byId(c, 'n1').enrolled).toBe(true);
      expect(byId(c, 'n2').enrolled).toBe(false);
    });

    it('resolves the journey name through the journey collection, keeping the id when unknown', () => {
      const c = loaded();
      expect(byId(c, 'e1').journey).toBe('Foundations');
      expect(byId(c, 'e3').journey).toBe('jZ');
    });
  });

  // ───────────────────────── filter options ─────────────────────────
  describe('filter options come from the people loaded', () => {
    it('offers customer statuses from existing users only, sorted', () => {
      expect(loaded().statusOptions).toEqual(['active', 'expired']);
    });

    it('offers journeys by display name, sorted', () => {
      expect(loaded().journeyOptions).toEqual([
        { id: 'jA', name: 'Foundations' }, { id: 'jZ', name: 'jZ' }, { id: 'jB', name: 'Momentum' },
      ]);
    });

    it('offers country codes from both collections, numerically sorted, blanks dropped', () => {
      expect(loaded().countryOptions).toEqual(['1', '44', '61', '91']);
    });

    it('hides the existing-only filters when the audience is new users', () => {
      const c = loaded();
      expect(c.showExistFilters).toBe(true);
      c.setAudience('new');
      expect(c.showExistFilters).toBe(false);
    });
  });

  // ───────────────────────── the filters ─────────────────────────
  describe('filters', () => {
    it('shows everyone when nothing is filtered', () => {
      expect(loaded().shownCount).toBe(7);
    });

    it('narrows to existing users, moved ones included', () => {
      const c = loaded(); c.setAudience('exist');
      expect(ids(c.shown)).toEqual(['e1', 'e2', 'e3', 'm1', 'm2']);
    });

    it('narrows to new users, moved ones excluded', () => {
      const c = loaded(); c.setAudience('new');
      expect(ids(c.shown)).toEqual(['n1', 'n2']);
    });

    it('narrows to enrolled / not enrolled', () => {
      const c = loaded();
      c.setEnrollment('enrolled');  expect(ids(c.shown)).toEqual(['e1', 'm1', 'm2', 'n1']);
      c.setEnrollment('not');       expect(ids(c.shown)).toEqual(['e2', 'e3', 'n2']);
    });

    it('combines customer status and journey as AND', () => {
      const c = loaded();
      c.toggleMulti(c.statusFilters, 'expired');
      expect(ids(c.shown)).toEqual(['e2', 'm1']);
      c.toggleMulti(c.journeyFilters, 'jA');
      expect(ids(c.shown)).toEqual(['m1']);
    });

    it('filters by country code across both collections', () => {
      const c = loaded(); c.toggleMulti(c.countryFilters, '91');
      expect(ids(c.shown)).toEqual(['e1', 'n1']);
    });

    it('can require a phone or an email', () => {
      const c = loaded();
      c.needPhone = true; c.applyFilters();
      expect(ids(c.shown)).toEqual(['e1', 'e3', 'm1', 'm2', 'n1']);
      c.needEmail = true; c.applyFilters();
      expect(ids(c.shown)).toEqual(['e1', 'm1', 'm2', 'n1']);
    });

    it('searches name, email and the full phone number', () => {
      const c = loaded();
      c.search = 'moved'; c.applyFilters();       expect(ids(c.shown)).toEqual(['m1', 'm2']);
      c.search = 'E2@X.IO'; c.applyFilters();     expect(ids(c.shown)).toEqual(['e2']);
      c.search = '919000000001'; c.applyFilters(); expect(ids(c.shown)).toEqual(['e1']);
    });

    it('indexes each row once, so search never lower-cases per keystroke', () => {
      const r = byId(loaded(), 'e1');
      expect(r.hay).toContain('exist one');
      expect(r.hay).toContain('919000000001');
      expect(r.keys.name).toBe('exist one');
    });

    it('typing is debounced — the table re-filters after a pause, not per keystroke', (done) => {
      const c = loaded();
      c.search = 'e'; c.onSearchInput();
      c.search = 'ex'; c.onSearchInput();
      c.search = 'exist t'; c.onSearchInput();
      expect(c.shownCount).toBe(7);                        // nothing yet
      setTimeout(() => { expect(ids(c.shown)).toEqual(['e2', 'e3']); c.ngOnDestroy(); done(); }, 260);
    });

    it('switching the audience to new users drops the existing-only filters', () => {
      const c = loaded();
      c.toggleMulti(c.statusFilters, 'active');
      c.toggleMulti(c.journeyFilters, 'jA');
      c.setAudience('new');
      expect(c.statusFilters).toEqual([]);
      expect(c.journeyFilters).toEqual([]);
      expect(c.shownCount).toBe(2);
    });

    it('counts active filters and clears them all', () => {
      const c = loaded();
      c.setAudience('exist'); c.setEnrollment('enrolled');
      c.toggleMulti(c.countryFilters, '91'); c.needEmail = true; c.search = 'one'; c.applyFilters();
      expect(c.activeFilterCount).toBe(5);
      c.clearFilters();
      expect(c.activeFilterCount).toBe(0);
      expect(c.shownCount).toBe(7);
    });
  });

  // ───────────────────────── selection & recipients ─────────────────────────
  describe('selection and who gets the send', () => {
    it('sends to everyone shown when nobody is ticked', () => {
      const c = loaded(); c.setAudience('new');
      expect(c.recipientCount).toBe(2);
    });

    it('sends only to the ticked people once someone is ticked', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'e1')); c.toggleRow(byId(c, 'n2'));
      expect(ids(c.recipients)).toEqual(['e1', 'n2']);
      expect(c.someShownSelected).toBe(true);
      expect(c.allShownSelected).toBe(false);
    });

    it('select-all ticks everyone shown, and again unticks them', () => {
      const c = loaded(); c.setAudience('new');
      c.toggleAllShown();  expect(c.allShownSelected).toBe(true);  expect(c.selected.size).toBe(2);
      c.toggleAllShown();  expect(c.selected.size).toBe(0);
    });

    it('keeps a tick when a later search hides that person — the bug the operator hit', () => {
      const c = loaded();
      c.search = 'exist one'; c.applyFilters(); c.toggleRow(byId(c, 'e1'));
      c.search = 'new one';   c.applyFilters(); c.toggleRow(byId(c, 'n1'));
      expect(Array.from(c.selected).sort()).toEqual(['e1', 'n1']);
      expect(ids(c.recipients)).toEqual(['e1', 'n1']);   // both go out, though only n1 is shown
      expect(c.recipientCount).toBe(2);
    });

    it('a tick made under one filter survives switching to another', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'n1')); c.toggleRow(byId(c, 'e1'));
      c.setAudience('exist');
      expect(Array.from(c.selected).sort()).toEqual(['e1', 'n1']);
      expect(c.selectedShownCount).toBe(1);               // only e1 is on screen now
      expect(c.someShownSelected).toBe(true);
    });

    it('select-all under a filter adds to, and never replaces, earlier ticks', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'e1'));
      c.setAudience('new'); c.toggleAllShown();
      expect(Array.from(c.selected).sort()).toEqual(['e1', 'n1', 'n2']);
      c.toggleAllShown();                                  // unticks only the shown new users
      expect(Array.from(c.selected)).toEqual(['e1']);
    });

    it('"show selected" narrows the table to the ticked people, across every filter', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'e2')); c.toggleRow(byId(c, 'n2'));
      c.toggleOnlySelected();
      expect(ids(c.shown)).toEqual(['e2', 'n2']);
      c.toggleRow(byId(c, 'n2'));                          // unticking while in that view drops the row
      expect(ids(c.shown)).toEqual(['e2']);
      c.toggleOnlySelected();
      expect(c.shownCount).toBe(7);
    });

    it('clearing the selection restores "everyone shown" as the recipients', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'e1')); c.toggleOnlySelected();
      c.clearSelection();
      expect(c.selected.size).toBe(0);
      expect(c.onlySelected).toBe(false);
      expect(c.recipientCount).toBe(7);
    });

    it('clearing the filters leaves the selection alone', () => {
      const c = loaded();
      c.toggleRow(byId(c, 'e1')); c.setAudience('new');
      c.clearFilters();
      expect(Array.from(c.selected)).toEqual(['e1']);
    });

    it('counts who can actually receive WhatsApp and email', () => {
      const c = loaded();
      expect(c.withPhone).toBe(5);   // e1 e3 m1 m2 n1
      expect(c.withEmail).toBe(5);   // e1 e2 m1 m2 n1
    });
  });

  // ───────────────────────── the three buttons ─────────────────────────
  describe('the send buttons hand the dashboard its usual participant shape', () => {
    it('email: { profileid, name, metadata } with the country code under both spellings', () => {
      const c = loaded(); c.toggleRow(byId(c, 'n1'));
      c.sendEmail();
      expect(sent.email.length).toBe(1);
      const p = sent.email[0];
      expect(p.profileid).toBe('n1');
      expect(p.name).toBe('New One');
      expect(p.metadata.email).toBe('n1@x.io');
      expect(p.metadata.phonenumber).toBe('9000000005');
      expect(p.metadata.countryCode).toBe('91');
      expect(p.metadata.countrycode).toBe('91');
    });

    it('whatsapp and notification go to the same recipients as email', () => {
      const c = loaded(); c.setEnrollment('not');
      c.sendWhatsapp(); c.sendNotification(); c.sendEmail();
      expect(sent.whatsapp.map(p => p.profileid).sort()).toEqual(['e2', 'e3', 'n2']);
      expect(sent.notification.map(p => p.profileid).sort()).toEqual(['e2', 'e3', 'n2']);
      expect(sent.email.map(p => p.profileid).sort()).toEqual(['e2', 'e3', 'n2']);
    });

    it('a moved user is sent with their live metadata, not the stale new-user document', () => {
      const c = loaded(); c.toggleRow(byId(c, 'm1'));
      c.sendWhatsapp();
      expect(sent.whatsapp[0].metadata.phonenumber).toBe('9000000003');
      expect(sent.whatsapp[0].metadata.countrycode).toBe('44');
    });
  });

  it('formats the phone with its dial code', () => {
    const c = loaded();
    expect(c.fullPhone(byId(c, 'e1'))).toBe('+91 9000000001');
    expect(c.fullPhone(byId(c, 'e2'))).toBe('');
  });
});
