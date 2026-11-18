import {
  buildEmailData,
  emptyStaticCount,
  mailFingerprint,
  readEmailData,
  reservedVariables,
  storedMailFingerprint,
  templateFromDoc,
  templateVariables,
  unsetCount,
} from './mail-template-map';
import { WorkshopSettingsv2Component } from './workshop-settingsv2.component';

describe('mail-template-map', () => {
  it('lists each variable once, in template order, without mustache control tags', () => {
    expect(templateVariables(['name', ' workshop ', 'name', '#each items', '/each', '^empty', '>footer', '!note', '{link', '& raw', '', 3, null]))
      .toEqual(['name', 'workshop', 'link', 'raw']);
    expect(templateVariables(undefined)).toEqual([]);
    expect(templateVariables({ name: 1 })).toEqual([]);
  });

  it('reads a template doc: name, variables, active and approved', () => {
    const t = templateFromDoc('t1', { templatename: ' Welcome ', templatemodel: ['name', 'name', 'url'], active: true, postmarkstatus: 'approved' });
    expect(t).toEqual({ id: 't1', name: 'Welcome', variables: ['name', 'url'], variablesRecorded: true, active: true, approved: true });
    const u = templateFromDoc('t2', { templatename: '', active: 'true', postmarkstatus: 'pending' });
    expect(u).toEqual({ id: 't2', name: 'Untitled template', variables: [], variablesRecorded: false, active: false, approved: false });
  });

  it('tells a template with no variables apart from one whose variables were never recorded', () => {
    expect(templateFromDoc('a', { templatemodel: [] }).variablesRecorded).toBeTrue();
    expect(templateFromDoc('b', {}).variablesRecorded).toBeFalse();
    expect(templateFromDoc('c', { templatemodel: 'name' }).variablesRecorded).toBeFalse();
  });

  it('finds the variable names Firestore cannot store as keys', () => {
    expect(reservedVariables(['name', '__id__', '_x_', '__', '___', '__a', 'b__', '____'])).toEqual(['__id__', '____']);
    expect(reservedVariables(['name'])).toEqual([]);
  });

  it('fingerprints the stored map with every key, so drift from the template shows', () => {
    const stored = { name: { type: 'name' }, signoff: { type: 'static', value: 'Bye' } };
    const vars = ['name', 'signoff'];
    const clean = mailFingerprint('t1', vars, readEmailData(stored, vars));
    expect(storedMailFingerprint('t1', stored)).toBe(clean);
    // a key the template no longer has
    expect(storedMailFingerprint('t1', { ...stored, gone: { type: 'workshopname' } })).not.toBe(clean);
    // the older flat shape, and other malformed entries
    expect(storedMailFingerprint('t1', { ...stored, date: 'workshopname' })).not.toBe(clean);
    expect(storedMailFingerprint('t1', { ...stored, date: { type: 'phone' } })).not.toBe(clean);
    // no stored map is the same as an empty one; no template is ''
    expect(storedMailFingerprint('t1', undefined)).toBe(mailFingerprint('t1', [], {}));
    expect(storedMailFingerprint('t1', ['name'])).toBe(mailFingerprint('t1', [], {}));
    expect(storedMailFingerprint('', stored)).toBe('');
  });

  it('reads stored emailData for the current variables only, skipping malformed entries', () => {
    const raw = {
      name: { type: 'name' },
      link: { type: 'workshopurl', value: 'ignored' },
      signoff: { type: 'static', value: 'Team A&H' },
      blank: { type: 'static' },
      bad: { type: 'phone' },
      flat: 'name',
      gone: { type: 'workshopname' },
    };
    expect(readEmailData(raw, ['name', 'link', 'signoff', 'blank', 'bad', 'flat', 'missing'])).toEqual({
      name: { type: 'name' },
      link: { type: 'workshopurl' },
      signoff: { type: 'static', value: 'Team A&H' },
      blank: { type: 'static', value: '' },
    });
    expect(readEmailData(null, ['name'])).toEqual({});
    expect(readEmailData(['name'], ['0'])).toEqual({});
  });

  it('builds the stored map: value only on static entries, only the current variables', () => {
    const data: any = {
      name: { type: 'name', value: 'leftover' },
      signoff: { type: 'static', value: 'Thanks\nTeam' },
      old: { type: 'workshopname' },
    };
    expect(buildEmailData(['name', 'signoff', 'unset'], data)).toEqual({
      name: { type: 'name' },
      signoff: { type: 'static', value: 'Thanks\nTeam' },
    });
  });

  it('counts unset variables and empty static values', () => {
    const vars = ['a', 'b', 'c', 'd'];
    const data: any = { a: { type: 'name' }, b: { type: 'static', value: '   ' }, c: { type: 'static', value: 'x' } };
    expect(unsetCount(vars, data)).toBe(1);
    expect(emptyStaticCount(vars, data)).toBe(1);
  });

  it('fingerprints what would be stored, ignoring key order and leftover values', () => {
    const a = mailFingerprint('t1', ['x', 'y'], { y: { type: 'static', value: 'hi' }, x: { type: 'name' } });
    const b = mailFingerprint('t1', ['x', 'y'], { x: { type: 'name', value: 'leftover' }, y: { type: 'static', value: 'hi' } });
    expect(a).toBe(b);
    expect(mailFingerprint('t2', ['x', 'y'], { x: { type: 'name' }, y: { type: 'static', value: 'hi' } })).not.toBe(a);
    expect(mailFingerprint('t1', ['x', 'y'], { x: { type: 'name' }, y: { type: 'static', value: 'hi!' } })).not.toBe(a);
    expect(mailFingerprint('', ['x'], { x: { type: 'name' } })).toBe('');
  });
});

describe('WorkshopSettingsv2Component · email template', () => {
  /** Field initialisers don't run with Object.create, so the state the methods use is set here. */
  function make(over: Partial<WorkshopSettingsv2Component> = {}): WorkshopSettingsv2Component {
    const c: any = Object.create(WorkshopSettingsv2Component.prototype);
    Object.assign(c, {
      mailSources: [
        { key: 'name', label: 'Name', hint: '' }, { key: 'workshopname', label: 'Workshop name', hint: '' },
        { key: 'workshopurl', label: 'Workshop URL', hint: '' }, { key: 'static', label: 'Static value', hint: '' },
      ],
      mailTemplates: [], mailTemplateId: '', mailTemplate: null, mailTemplateMissing: false, mailTemplateUnreadable: false,
      mailData: {}, mailLoaded: true, mailSaving: false, mailJustSaved: false, mailSaveError: '', mailSavedPrint: '', mailLoadPrint: '',
      workshopId: 'w1', _isNew: false, openPopover: null, popSearch: '',
    }, over);
    return c;
  }
  const welcome = { id: 't1', name: 'Welcome', variables: ['name', 'link', 'signoff'], variablesRecorded: true, active: true, approved: true };
  const reminder = { id: 't2', name: 'Reminder', variables: ['name', 'date'], variablesRecorded: true, active: true, approved: true };
  /** A component as ensureMailLoaded leaves it for `template` with `stored` as the stored emailData. */
  function loaded(template: any, stored: any): WorkshopSettingsv2Component {
    const data = readEmailData(stored, template.variables);
    return make({
      mailTemplateId: template.id, mailTemplate: template, mailData: data,
      mailLoadPrint: mailFingerprint(template.id, template.variables, data),
      mailSavedPrint: storedMailFingerprint(template.id, stored),
    } as any);
  }

  it('needs every variable chosen and every static value typed before it can save', () => {
    const c = make();
    c.pickMailTemplate(welcome);
    expect(c.mailDirty).toBeTrue();
    expect(c.mailCanSave).toBeFalse();
    expect(c.mailBlocker).toBe('Choose a value for 3 variables');
    c.setMailSource('name', 'name');
    c.setMailSource('link', 'workshopurl');
    c.setMailSource('signoff', 'static');
    expect(c.mailBlocker).toBe('Type the text for 1 static value');
    c.setMailStatic('signoff', '  ');
    expect(c.mailCanSave).toBeFalse();
    c.setMailStatic('signoff', 'Team A&H');
    expect(c.mailBlocker).toBe('');
    expect(c.mailCanSave).toBeTrue();
  });

  it('keeps the choices a newly picked template shares, and drops the rest', () => {
    const c = make();
    c.pickMailTemplate(welcome);
    c.setMailSource('name', 'name');
    c.setMailSource('signoff', 'static');
    c.setMailStatic('signoff', 'Bye');
    c.pickMailTemplate(reminder);
    expect(c.mailData).toEqual({ name: { type: 'name' } });
    expect(c.mailUnset).toBe(1);
  });

  it('keeps the typed static text when switching away and back to Static value', () => {
    const c = make();
    c.pickMailTemplate(welcome);
    c.setMailSource('signoff', 'static');
    c.setMailStatic('signoff', 'Bye');
    c.setMailSource('signoff', 'static');
    expect(c.mailStaticText('signoff')).toBe('Bye');
    c.setMailSource('signoff', 'name');
    expect(c.mailData['signoff']).toEqual({ type: 'name' });
    c.setMailSource('signoff', 'static');
    expect(c.mailStaticText('signoff')).toBe('');
  });

  it('is clean again when the choice returns to what is stored', () => {
    const data = { name: { type: 'name' as const } };
    const c = make({ mailTemplateId: 't2', mailTemplate: reminder, mailData: { ...data } } as any);
    (c as any).mailSavedPrint = mailFingerprint('t2', reminder.variables, data);
    expect(c.mailDirty).toBeFalse();
    c.setMailSource('name', 'workshopname');
    expect(c.mailDirty).toBeTrue();
    c.setMailSource('name', 'name');
    expect(c.mailDirty).toBeFalse();
  });

  it('Remove empties the choice and can be saved, which deletes the stored map', () => {
    const c = make({ mailTemplateId: 't2', mailTemplate: reminder, mailData: { name: { type: 'name' }, date: { type: 'static', value: 'Mon' } } } as any);
    (c as any).mailSavedPrint = mailFingerprint('t2', reminder.variables, c.mailData);
    c.removeMailTemplate();
    expect(c.mailTemplateId).toBe('');
    expect(c.mailDirty).toBeTrue();
    expect(c.mailBlocker).toBe('');
    expect(c.mailCanSave).toBeTrue();
  });

  it('cannot save on a workshop the Enrollment page has not created yet', () => {
    const c = make({ _isNew: true } as any);
    c.pickMailTemplate({ ...reminder, variables: [] });
    expect(c.mailDirty).toBeTrue();
    expect(c.mailCanSave).toBeFalse();
    expect(c.mailBlocker).toBe(c.blockedReason);
  });

  it('warns about a saved template that is no longer offered', () => {
    expect(make({ mailTemplateMissing: true, mailTemplateId: 'gone' } as any).mailTemplateWarning).toContain('deleted');
    expect(make({ mailTemplate: { ...welcome, active: false } } as any).mailTemplateWarning).toBe('This template is no longer active.');
    expect(make({ mailTemplate: { ...welcome, approved: false } } as any).mailTemplateWarning).toBe('This template is no longer approved.');
    expect(make({ mailTemplate: welcome } as any).mailTemplateWarning).toBe('');
  });

  it('counts a Static value with no text as not set yet', () => {
    const c = make();
    c.pickMailTemplate(welcome);
    c.setMailSource('name', 'name');
    c.setMailSource('signoff', 'static');
    expect(c.mailSetCount).toBe(1);
    c.setMailStatic('signoff', '  ');
    expect(c.mailSetCount).toBe(1);
    c.setMailStatic('signoff', 'Bye');
    expect(c.mailSetCount).toBe(2);
  });

  it('flags a saved choice that is incomplete (the template gained a variable) without any edit', () => {
    const c = loaded(reminder, { name: { type: 'name' } });
    expect(c.mailDirty).toBeFalse();
    expect(c.mailShowBlocker).toBeTrue();
    expect(c.mailBlocker).toBe('Choose a value for 1 variable');
    expect(c.mailCanSave).toBeFalse();
    c.setMailSource('date', 'workshopurl');
    expect(c.mailShowBlocker).toBeFalse();
    expect(c.mailCanSave).toBeTrue();
  });

  it('a complete, clean saved choice shows no blocker', () => {
    const c = loaded(reminder, { name: { type: 'name' }, date: { type: 'workshopname' } });
    expect(c.mailDirty).toBeFalse();
    expect(c.mailShowBlocker).toBeFalse();
    expect(c.mailOutOfDate).toBeFalse();
  });

  it('a stored map with entries the template no longer has (or the older flat shape) is out of date and can be saved clean', () => {
    const c = loaded(reminder, { name: { type: 'name' }, date: { type: 'workshopname' }, gone: { type: 'name' } });
    expect(c.mailDirty).toBeTrue();
    expect(c.mailOutOfDate).toBeTrue();
    expect(c.mailCanSave).toBeTrue();
    c.setMailSource('date', 'workshopurl');
    expect(c.mailOutOfDate).toBeFalse();   // now an ordinary edit
    expect(c.mailDirty).toBeTrue();

    const flat = loaded(reminder, { name: { type: 'name' }, date: 'workshopname' });
    expect(flat.mailOutOfDate).toBeTrue();
    expect(flat.mailUnset).toBe(1);
    expect(flat.mailBlocker).toBe('Choose a value for 1 variable');
    expect(flat.mailCanSave).toBeFalse();
  });

  it('cannot save a template whose variables were never recorded', () => {
    const c = make();
    c.pickMailTemplate({ ...reminder, variables: [], variablesRecorded: false });
    expect(c.mailBlocker).toBe("This template's variables were not recorded");
    expect(c.mailCanSave).toBeFalse();
    expect(c.mailShowBlocker).toBeTrue();
  });

  it('cannot save a template with a variable Firestore cannot store, and says which', () => {
    const c = make();
    c.pickMailTemplate({ ...reminder, variables: ['name', '__id__'] });
    c.setMailSource('name', 'name');
    c.setMailSource('__id__', 'workshopurl');
    expect(c.mailBlocker).toBe('{{__id__}} cannot be stored: names that begin and end with __ are reserved. Rename it in the template');
    expect(c.mailCanSave).toBeFalse();
  });

  it('a saved template that could not be read can be replaced or removed, and says so', () => {
    const c = make({ mailTemplateId: 'bad/id', mailTemplateMissing: true, mailTemplateUnreadable: true } as any);
    (c as any).mailSavedPrint = (c as any).mailLoadPrint = mailFingerprint('bad/id', [], {});
    expect(c.mailTemplateLabel).toBe('Saved template (could not be read)');
    expect(c.mailTemplateWarning).toBe('Could not read the saved template. Choose another, or remove it.');
    expect(c.mailDirty).toBeFalse();
    expect(c.mailShowBlocker).toBeFalse();
    c.removeMailTemplate();
    expect(c.mailTemplateUnreadable).toBeFalse();
    expect(c.mailTemplateWarning).toBe('');
    expect(c.mailCanSave).toBeTrue();
    const d = make({ mailTemplateId: 'bad/id', mailTemplateMissing: true, mailTemplateUnreadable: true } as any);
    d.pickMailTemplate(reminder);
    expect(d.mailTemplateLabel).toBe('Reminder');
    expect(d.mailTemplateWarning).toBe('');
  });

  it('searches the offered templates by name', () => {
    const c = make({ mailTemplates: [welcome, reminder], popSearch: 'rem' } as any);
    expect(c.filteredMailTemplates.map(t => t.id)).toEqual(['t2']);
    c.popSearch = '';
    expect(c.filteredMailTemplates.length).toBe(2);
  });
});
