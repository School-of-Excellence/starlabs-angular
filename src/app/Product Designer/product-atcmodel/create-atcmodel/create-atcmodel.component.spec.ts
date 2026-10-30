import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from 'firebase/firestore';
import { connectStorageEmulator, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

import { CreateAtcmodelComponent, normaliseModelName } from './create-atcmodel.component';

// Runs against an isolated DEMO emulator project (demo-* never reaches a cloud project):
//   firebase emulators:start --only firestore,storage --project demo-atcmodel-unit
// with firestore on 127.0.0.1:8189 and storage on 127.0.0.1:9189 (permissive rules). The validation specs
// need no emulator; the save specs mark themselves pending when it isn't running.
const PROJECT = 'demo-atcmodel-unit';
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', storageBucket: `${PROJECT}.appspot.com` }, 'atcmodel-unit');
const firestore = getFirestore(app);
connectFirestoreEmulator(firestore, '127.0.0.1', 8189);
const storage = getStorage(app);
connectStorageEmulator(storage, '127.0.0.1', 9189);

const RUN = Date.now().toString(36);

function makeImage(width: number, height: number, type = 'image/png', name = 'model.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').fillRect(0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(blob => resolve(new File([blob], name, { type })), type));
}

function pick(component: CreateAtcmodelComponent, file: File) {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [file] });
  component.onImagePicked({ target: input } as any);
}

async function until(check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
}

async function emulatorUp(): Promise<boolean> {
  try {
    await Promise.all([
      fetch('http://127.0.0.1:8189/', { mode: 'no-cors' }),
      fetch('http://127.0.0.1:9189/', { mode: 'no-cors' }),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(url: string): Promise<boolean> {
  try {
    await getDownloadURL(ref(storage, url));
    return true;
  } catch {
    return false;
  }
}

describe('CreateAtcmodelComponent', () => {
  let component: CreateAtcmodelComponent;
  let fixture: ComponentFixture<CreateAtcmodelComponent>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<CreateAtcmodelComponent>>;

  async function open(data: any) {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      imports: [CreateAtcmodelComponent],
      providers: [
        provideNoopAnimations(),
        { provide: Firestore, useValue: firestore },
        { provide: Storage, useValue: storage },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateAtcmodelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function text(testid: string): string {
    fixture.detectChanges();
    return (fixture.nativeElement.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '').trim();
  }

  describe('validation', () => {
    const existing = [{ id: 'm1', docid: 'm1', atcmodel: 'Wellness' }, { id: 'm2', docid: 'm2', atcmodel: 'Clarity' }];

    it('normalises names by trimming and lower-casing', () => {
      expect(normaliseModelName('  WeLLness ')).toBe('wellness');
      expect(normaliseModelName(null)).toBe('');
    });

    it('create mode: title and button say Create', async () => {
      await open({ type: 'add', doc: null, existing });
      expect(fixture.nativeElement.querySelector('.ca-title').textContent.trim()).toBe('Create ATC model');
      expect(text('ca-on-submit-2')).toBe('Create');
    });

    it('flags a duplicate name regardless of case and surrounding spaces', async () => {
      await open({ type: 'add', doc: null, existing });
      const name = component.form.get('atcmodel');
      name.setValue(' wellness ');
      expect(name.hasError('duplicate')).toBeTrue();
      expect(text('ca-name-duplicate')).toBe('"wellness" already exists. Use a different name.');
      name.setValue('Wellness 2');
      expect(name.hasError('duplicate')).toBeFalse();
    });

    it('edit mode: the model being edited is not its own duplicate, another model still is', async () => {
      await open({ type: 'edit', doc: existing[0], existing });
      expect(fixture.nativeElement.querySelector('.ca-title').textContent.trim()).toBe('Edit ATC model');
      expect(text('ca-on-submit-2')).toBe('Save changes');
      const name = component.form.get('atcmodel');
      name.setValue('WELLNESS');
      expect(name.hasError('duplicate')).toBeFalse();
      name.setValue('clarity');
      expect(name.hasError('duplicate')).toBeTrue();
    });

    it('rejects a file that is not PNG, JPG, or WebP', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      pick(component, new File(['x'], 'model.gif', { type: 'image/gif' }));
      expect(component.imageError).toBe('Use a PNG, JPG, or WebP image.');
      expect(component.newImageFile).toBeNull();
    });

    it('rejects an image over 200 KB before decoding it', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      pick(component, new File([new Uint8Array(201 * 1024)], 'big.png', { type: 'image/png' }));
      expect(component.imageError).toBe('This image is 201 KB. Upload an image of 200 KB or less.');
      expect(component.newImageFile).toBeNull();
    });

    it('rejects a non-square image and names its size', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      pick(component, await makeImage(120, 80));
      await until(() => !!component.imageError);
      expect(component.imageError).toBe('This image is 120 × 80. Upload a square (1:1) image.');
      expect(component.newImageFile).toBeNull();
      expect(text('ca-image-error')).toContain('120 × 80');
    });

    it('accepts a square image and shows Replace / Remove', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      pick(component, await makeImage(64, 64));
      await until(() => !!component.newImageFile);
      expect(component.imageError).toBeNull();
      expect(text('ca-image-replace')).toBe('Replace');
      expect(text('ca-image-remove')).toBe('Remove');
    });

    it('evolution type is a plain select (no chip) holding the same string value', async () => {
      await open({ type: 'edit', doc: { ...existing[0], evolutiontype: 'specialised' }, existing });
      const select = fixture.nativeElement.querySelector('[data-testid="ca-evolution-type"]');
      expect(select.tagName.toLowerCase()).toBe('mat-select');
      await fixture.whenStable();
      expect(text('ca-evolution-type')).toBe('Specialised');
      expect(component.form.value.evolutiontype).toBe('specialised');
      expect(fixture.nativeElement.querySelectorAll('mat-chip, mat-chip-row').length).toBe(0);
    });

    it('category chips: trimmed, no repeats, removable', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      const chipInput = { clear: jasmine.createSpy('clear') };
      component.addCategory({ value: ' Health ', chipInput } as any);
      component.addCategory({ value: 'Health', chipInput } as any);
      component.addCategory({ value: '  ', chipInput } as any);
      component.addCategory({ value: 'Mindset', chipInput } as any);
      expect(component.form.value.category).toEqual(['Health', 'Mindset']);
      component.removeCategory(0);
      expect(component.form.value.category).toEqual(['Mindset']);
      expect(chipInput.clear).toHaveBeenCalledTimes(4);
    });

    it('content videos: stores refs, shows titles, hides already-chosen options', async () => {
      await open({ type: 'add', doc: null, existing: [] });
      const v1 = { title: 'Intro', ref: doc(firestore, 'content_urls', 'v1') };
      const v2 = { title: 'Breathing', ref: doc(firestore, 'content_urls', 'v2') };
      component.contentData = [v1, v2];
      component.addVideo(v1);
      component.addVideo(v1);
      expect(component.form.value.videourl.map((r: any) => r.path)).toEqual(['content_urls/v1']);
      expect(component.videoTitle(v1.ref)).toBe('Intro');
      expect(component.videoOptions().map(o => o.title)).toEqual(['Breathing']);
      component.videoSearch = 'zzz';
      expect(component.videoOptions()).toEqual([]);
      component.removeVideo(0);
      expect(component.form.value.videourl).toEqual([]);
    });

    describe('forms config', () => {
      const forms = [
        { formid: 'f-life', formname: 'Life Report' },
        { formid: 'f-clarity', formname: 'clarity Call' },
        { formid: 'f-sleep', formname: 'Sleep Diary' },
      ];
      // the `delivery forms` docs as Firestore returns them, plus a soft-deleted one
      const formDocs = [...forms, { formid: 'f-old', formname: 'Old Form', delete: true }]
        .map(({ formid, ...data }) => ({ id: formid, data: () => data }));

      it('edit mode: loads the saved forms in form-name order, unknown or soft-deleted ids last as "Form not found"', async () => {
        await open({ type: 'edit', doc: { ...existing[0], forms: [
          { formid: 'f-sleep', filledby: 'participant' },
          { formid: 'f-gone', filledby: 'participant' },
          { formid: 'f-old', filledby: 'participant' },
          { formid: 'f-clarity', filledby: 'specialist' },
        ] }, existing });
        component.setDeliveryForms(formDocs);
        component.addForm(forms[0]);
        expect(component.formRows.map(r => r.formid)).toEqual(['f-clarity', 'f-life', 'f-sleep', 'f-gone', 'f-old']);
        fixture.detectChanges();
        expect(Array.from(fixture.nativeElement.querySelectorAll('[data-testid="ca-form-missing"]')).length).toBe(2);
      });

      it('only active forms are offered: a soft-deleted form is left out', async () => {
        await open({ type: 'add', doc: null, existing: [] });
        component.setDeliveryForms(formDocs);
        expect(component.formOptions.map(f => f.formid)).toEqual(['f-life', 'f-clarity', 'f-sleep']);
      });

      it('a new form has no filled-by until one is picked, and Save stays off until then', async () => {
        await open({ type: 'add', doc: null, existing: [] });
        component.form.patchValue({ atcmodel: 'Forms model', evolutiontype: 'full' });
        component.setDeliveryForms(formDocs);
        component.addForm(forms[2]);
        expect(component.formRows).toEqual([{ formid: 'f-sleep', name: 'Sleep Diary', filledby: null }]);
        expect(component.formsIncomplete).toBeTrue();
        expect(text('ca-form-filledby-required')).toBe('Choose who fills this form');
        expect(fixture.nativeElement.querySelector('[data-testid="ca-on-submit-2"]').disabled).toBeTrue();

        component.setFilledBy(component.formRows[0], 'participant');
        expect(component.formsIncomplete).toBeFalse();
        expect(text('ca-form-filledby-required')).toBe('');
        expect(fixture.nativeElement.querySelector('[data-testid="ca-on-submit-2"]').disabled).toBeFalse();
      });

      it('search hides forms already added and matches by name, case-insensitively', async () => {
        await open({ type: 'add', doc: null, existing: [] });
        component.setDeliveryForms(formDocs);
        component.addForm(forms[0]);
        component.addForm(forms[0]);
        expect(component.formRows.length).toBe(1);
        expect(component.formOptions.map(f => f.formid)).toEqual(['f-clarity', 'f-sleep']);
        component.searchForms('SLEEP');
        expect(component.formOptions.map(f => f.formid)).toEqual(['f-sleep']);
      });

      it('remove takes the form out of the list', async () => {
        await open({ type: 'add', doc: null, existing: [] });
        component.setDeliveryForms(formDocs);
        component.addForm(forms[0]);
        component.addForm(forms[2]);
        component.removeForm('f-life');
        expect(component.formRows.map(r => r.formid)).toEqual(['f-sleep']);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('[data-testid="ca-form-row"]').length).toBe(1);
      });
    });

    it('edit mode: Remove clears the saved image from the preview', async () => {
      await open({ type: 'edit', doc: { ...existing[0], image: 'https://example.test/x.png' }, existing });
      expect(component.previewUrl).toBe('https://example.test/x.png');
      component.onImageRemove();
      expect(component.imageRemoved).toBeTrue();
      expect(component.previewUrl).toBeNull();
      expect(text('ca-image-pick')).toContain('Upload image');
    });
  });

  describe('save (demo emulator)', () => {
    let up = false;
    beforeAll(async () => { up = await emulatorUp(); });

    async function fill(name: string) {
      component.form.patchValue({ atcmodel: name, evolutiontype: 'full' });
    }

    async function seedModel(id: string, name: string, withImage: boolean): Promise<string | null> {
      let image: string | null = null;
      if (withImage) {
        const r = ref(storage, `atcmodelimages/${id}_seed.png`);
        await uploadBytes(r, await makeImage(32, 32), { contentType: 'image/png' });
        image = await getDownloadURL(r);
      }
      await setDoc(doc(firestore, 'atc model', id), { docid: id, atcmodel: name, evolutiontype: 'full', ...(image ? { image } : {}) });
      return image;
    }

    it('creates a model with its image uploaded to atcmodelimages/', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      await open({ type: 'add', doc: null, existing: [] });
      await fill(`Create ${RUN}`);
      pick(component, await makeImage(64, 64));
      await until(() => !!component.newImageFile);
      await component.onSubmit();

      const saved = (await getDoc(doc(firestore, 'atc model', component.form.value.docid))).data();
      expect(saved['atcmodel']).toBe(`Create ${RUN}`);
      expect(saved['image']).toContain('atcmodelimages');
      expect(await fileExists(saved['image'])).toBeTrue();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('blocks a duplicate another admin just added (fresh read on save), case-insensitively', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      await seedModel(`dup-${RUN}`, `Duplicate ${RUN}`, false);
      await open({ type: 'add', doc: null, existing: [] });
      await fill(`  DUPLICATE ${RUN.toUpperCase()} `);
      expect(component.form.get('atcmodel').hasError('duplicate')).toBeFalse();
      await component.onSubmit();

      expect(component.form.get('atcmodel').hasError('duplicate')).toBeTrue();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect((await getDoc(doc(firestore, 'atc model', component.form.value.docid))).exists()).toBeFalse();
    });

    it('saves the trimmed name', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      await open({ type: 'add', doc: null, existing: [] });
      await fill(`   Trim ${RUN}   `);
      await component.onSubmit();
      const saved = (await getDoc(doc(firestore, 'atc model', component.form.value.docid))).data();
      expect(saved['atcmodel']).toBe(`Trim ${RUN}`);
    });

    it('replace: saves the new image and deletes the old file', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      const id = `replace-${RUN}`;
      const oldImage = await seedModel(id, `Replace ${RUN}`, true);
      await open({ type: 'edit', doc: { id, docid: id, atcmodel: `Replace ${RUN}`, evolutiontype: 'full', image: oldImage }, existing: [] });
      pick(component, await makeImage(48, 48));
      await until(() => !!component.newImageFile);
      await component.onSubmit();

      const saved = (await getDoc(doc(firestore, 'atc model', id))).data();
      expect(saved['image']).not.toBe(oldImage);
      expect(await fileExists(saved['image'])).toBeTrue();
      expect(await fileExists(oldImage)).toBeFalse();
    });

    it('remove: clears the image field and deletes the file', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      const id = `remove-${RUN}`;
      const oldImage = await seedModel(id, `Remove ${RUN}`, true);
      await open({ type: 'edit', doc: { id, docid: id, atcmodel: `Remove ${RUN}`, evolutiontype: 'full', image: oldImage }, existing: [] });
      component.onImageRemove();
      await component.onSubmit();

      const saved = (await getDoc(doc(firestore, 'atc model', id))).data();
      expect('image' in saved).toBeFalse();
      expect(saved['atcmodel']).toBe(`Remove ${RUN}`);
      expect(await fileExists(oldImage)).toBeFalse();
    });

    it('saves forms as [{ formid, filledby }] in form-name order; a new model with none saves []', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      await setDoc(doc(firestore, 'delivery forms', `fa-${RUN}`), { formname: `B form ${RUN}` });
      await setDoc(doc(firestore, 'delivery forms', `fb-${RUN}`), { formname: `A form ${RUN}` });
      const id = `forms-${RUN}`;
      await seedModel(id, `Forms ${RUN}`, false);
      await open({ type: 'edit', doc: { id, docid: id, atcmodel: `Forms ${RUN}`, evolutiontype: 'full', forms: [{ formid: `fa-${RUN}`, filledby: 'participant' }] }, existing: [] });
      await until(() => component.deliveryForms.some(f => f.formid === `fb-${RUN}`));
      component.addForm({ formid: `fb-${RUN}`, formname: `A form ${RUN}` });
      component.setFilledBy(component.formRows.find(r => r.formid === `fb-${RUN}`), 'specialist');
      await component.onSubmit();

      const saved = (await getDoc(doc(firestore, 'atc model', id))).data();
      expect(saved['forms']).toEqual([
        { formid: `fb-${RUN}`, filledby: 'specialist' },
        { formid: `fa-${RUN}`, filledby: 'participant' },
      ]);

      TestBed.resetTestingModule();
      await open({ type: 'add', doc: null, existing: [] });
      await fill(`No forms ${RUN}`);
      await component.onSubmit();
      expect((await getDoc(doc(firestore, 'atc model', component.form.value.docid))).data()['forms']).toEqual([]);
    });

    it('edit without touching the image keeps it', async () => {
      if (!up) { pending('demo emulator not running'); return; }
      const id = `keep-${RUN}`;
      const oldImage = await seedModel(id, `Keep ${RUN}`, true);
      await open({ type: 'edit', doc: { id, docid: id, atcmodel: `Keep ${RUN}`, evolutiontype: 'full', image: oldImage }, existing: [] });
      component.form.patchValue({ description: 'updated' });
      await component.onSubmit();

      const saved = (await getDoc(doc(firestore, 'atc model', id))).data();
      expect(saved['image']).toBe(oldImage);
      expect(saved['description']).toBe('updated');
      expect(await fileExists(oldImage)).toBeTrue();
    });
  });
});
