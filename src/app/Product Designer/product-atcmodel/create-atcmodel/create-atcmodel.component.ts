import { CommonModule } from '@angular/common';
import { Component,OnInit,Inject } from '@angular/core';
import { collection, deleteField, doc, Firestore, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { deleteObject, getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

// Forms config (operator, 2026-10-28): forms: [{ formid, filledby }] on the model; formid = `delivery forms`
// doc id; filledby has no default (the admin must pick one); the list is kept in form-name order.
export type FilledBy = 'specialist' | 'participant'
// name: undefined while the forms load, null when the form isn't an active delivery form
export interface ModelForm { formid: string; name?: string | null; filledby: FilledBy | null }

// Image rules (operator, 2026-10-26): square (1:1) only, PNG / JPG / WebP, max 200 KB.
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const IMAGE_MAX_BYTES = 200 * 1024;

// Duplicate check: trimmed, case-insensitive ("Wellness " == "wellness").
export function normaliseModelName(name: any): string {
  return (name ?? '').toString().trim().toLowerCase();
}

@Component({
  selector: 'app-create-atcmodel',
  imports: [
    ReactiveFormsModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CommonModule,
    MatButtonModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonToggleModule,
    TextFieldModule,
  ],
  templateUrl: './create-atcmodel.component.html',
  styleUrl: './create-atcmodel.component.css'
})
export class CreateAtcmodelComponent {

  form : FormGroup
  contentData = []
  videoSearch = ''
  readonly separatorKeys = [ENTER, COMMA]
  isEdit = false
  saving = false
  saveError: string | null = null

  // names of the OTHER models (normalised), used by the live duplicate validator
  existingNames = new Set<string>()

  // image state: originalImage = URL saved on the doc; newImageFile = picked, not yet uploaded;
  // imageRemoved = operator removed the saved image (cleared on save)
  originalImage: string | null = null
  newImageFile: File | null = null
  previewUrl: string | null = null
  imageRemoved = false
  imageError: string | null = null

  // forms config, kept in variables and refreshed by updateForms() whenever something changes:
  // deliveryForms = active `delivery forms` (not soft-deleted); formRows = this model's forms;
  // formOptions = active forms not chosen yet that match the search; formsIncomplete = a row has no "filled by"
  deliveryForms: { formid: string, formname: string }[] = []
  formRows: ModelForm[] = []
  formOptions: { formid: string, formname: string }[] = []
  formSearch = ''
  formsIncomplete = false

  constructor(
    private fb : FormBuilder,
    private firestore : Firestore,
    private storage : Storage,
    public dialogRef: MatDialogRef<CreateAtcmodelComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ){
    this.isEdit = this.data.type === 'edit'
    this.form = this.fb.group({
      atcmodel:[null,[Validators.required, this.duplicateValidator]],
      evolutiontype:[null,[Validators.required]],
      description:[null,[]],
      category:[[],],
      videourl:[[],],
      directive:[null,[]],
      docid: [doc(collection(this.firestore, 'atc model')).id]
    })
    const contentCollection = collection(this.firestore, 'content_urls')
    getDocs(contentCollection).then(snap => {
        this.contentData = snap.docs.map(e =>{
        const element = e.data()
        element['ref'] = e.ref
        return element
      })
    })

    getDocs(query(collection(this.firestore, 'delivery forms'), orderBy('formname'))).then(snap => this.setDeliveryForms(snap.docs))

    if(this.isEdit){
      this.form.patchValue(this.data.doc)
      this.originalImage = this.data.doc?.image || null
      this.previewUrl = this.originalImage
      this.formRows = (this.data.doc?.forms || []).map((f: any) => ({ formid: f.formid, name: undefined, filledby: f.filledby ?? null }))
      this.updateForms()
    }

    this.setExistingNames(this.data.existing || [])
    // show the duplicate error while typing, not only after blur
    this.form.get('atcmodel').valueChanges.subscribe(() => this.form.get('atcmodel').markAsTouched())
  }

  ngOnInit() {

  }

  private duplicateValidator = (control: AbstractControl): ValidationErrors | null => {
    const name = normaliseModelName(control.value)
    if (!name || !this.existingNames) return null
    return this.existingNames.has(name) ? { duplicate: true } : null
  }

  private setExistingNames(models: any[]) {
    // the model being edited is not its own duplicate (match on the doc id and the stored docid)
    const ownIds = [this.form.value.docid, this.data.doc?.id].filter(id => !!id)
    this.existingNames = new Set(
      models
        .filter(m => !ownIds.includes(m.id) && !ownIds.includes(m.docid))
        .map(m => normaliseModelName(m.atcmodel))
        .filter(n => !!n)
    )
    this.form.get('atcmodel').updateValueAndValidity({ emitEvent: false })
  }

  get typedName(): string {
    return (this.form.value.atcmodel ?? '').toString().trim()
  }

  //// category (array of strings)
  addCategory(event: MatChipInputEvent) {
    const value = (event.value || '').trim()
    const current: string[] = this.form.value.category || []
    if (value && !current.includes(value)) {
      this.form.get('category').setValue([...current, value])
    }
    event.chipInput.clear()
  }

  removeCategory(index: number) {
    const current: string[] = [...(this.form.value.category || [])]
    current.splice(index, 1)
    this.form.get('category').setValue(current)
  }

  //// content videos (array of content_urls refs)
  videoTitle(item: any): string {
    return this.contentData.find(c => c.ref?.id === item?.id)?.title ?? item?.id ?? ''
  }

  videoOptions(): any[] {
    const chosen = new Set((this.form.value.videourl || []).map((v: any) => v?.id))
    const search = this.videoSearch.trim().toLowerCase()
    return this.contentData.filter(c => !chosen.has(c.ref?.id) && (c.title ?? '').toLowerCase().includes(search))
  }

  addVideo(option: any) {
    const current = this.form.value.videourl || []
    if (!current.some((v: any) => v?.id === option.ref.id)) {
      this.form.get('videourl').setValue([...current, option.ref])
    }
  }

  removeVideo(index: number) {
    const current = [...(this.form.value.videourl || [])]
    current.splice(index, 1)
    this.form.get('videourl').setValue(current)
  }

  //// forms config (array of { formid, filledby }, kept in form-name order)
  // Only active forms: a soft-deleted form has delete:true. Most forms have no delete field at all, so a Firestore
  // `!=` filter would drop them too — the deleted ones are filtered out here instead.
  setDeliveryForms(docs: { id: string, data: () => any }[]) {
    this.deliveryForms = docs.filter(d => d.data()['delete'] !== true).map(d => ({ formid: d.id, formname: d.data()['formname'] ?? '' }))
    this.formRows.forEach(r => r.name = this.deliveryForms.find(f => f.formid === r.formid)?.formname ?? null)
    this.updateForms()
  }

  addForm(option: { formid: string, formname: string }) {
    if (this.formRows.some(r => r.formid === option.formid)) return
    this.formRows = [...this.formRows, { formid: option.formid, name: option.formname, filledby: null }]
    this.formSearch = ''
    this.updateForms()
  }

  setFilledBy(row: ModelForm, filledby: FilledBy) {
    row.filledby = filledby
    this.updateForms()
  }

  removeForm(formid: string) {
    this.formRows = this.formRows.filter(r => r.formid !== formid)
    this.updateForms()
  }

  searchForms(text: string) {
    this.formSearch = text
    this.updateForms()
  }

  // after any change: rows in name order (a form without a name last), the "Add a form" list, and the Save block
  updateForms() {
    this.formRows = [...this.formRows].sort((a, b) => {
      if (!a.name || !b.name) return !a.name ? (!b.name ? 0 : 1) : -1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    const chosen = new Set(this.formRows.map(r => r.formid))
    const search = this.formSearch.trim().toLowerCase()
    this.formOptions = this.deliveryForms.filter(f => !chosen.has(f.formid) && f.formname.toLowerCase().includes(search))
    this.formsIncomplete = this.formRows.some(r => !r.filledby)
  }

  trackByFormId(index: number, item: { formid: string }): string {
    return item.formid
  }

  //// image
  onImagePicked(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    this.imageError = null
    if (!IMAGE_TYPES.includes(file.type)) {
      this.imageError = 'Use a PNG, JPG, or WebP image.'
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      this.imageError = `This image is ${Math.round(file.size / 1024)} KB. Upload an image of 200 KB or less.`
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth !== img.naturalHeight) {
        URL.revokeObjectURL(url)
        this.imageError = `This image is ${img.naturalWidth} × ${img.naturalHeight}. Upload a square (1:1) image.`
        return
      }
      this.clearNewImage()
      this.newImageFile = file
      this.previewUrl = url
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      this.imageError = "This file couldn't be read as an image."
    }
    img.src = url
  }

  onImageRemove() {
    this.imageError = null
    this.clearNewImage()
    if (this.originalImage) this.imageRemoved = true
    this.previewUrl = null
  }

  private clearNewImage() {
    if (this.newImageFile && this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.newImageFile = null
  }

  private async uploadNewImage(docid: string): Promise<string> {
    const ext = this.newImageFile.name.split('.').pop()?.toLowerCase() || 'png'
    const storageRef = ref(this.storage, `atcmodelimages/${docid}_${Date.now()}.${ext}`)
    const result = await uploadBytes(storageRef, this.newImageFile, { contentType: this.newImageFile.type })
    return getDownloadURL(result.ref)
  }

  private async deleteStoredImage(url: string) {
    try {
      await deleteObject(ref(this.storage, url))
    } catch (error) {
      // the doc no longer points at it; a missing / foreign file must not fail the save
      console.warn('Old ATC model image not deleted:', error)
    }
  }

  async onSubmit(){
    if (this.form.invalid || this.formsIncomplete || this.saving) return
    this.saving = true
    this.saveError = null
    try {
      // fresh read so a model another admin just added is caught too
      const snap = await getDocs(collection(this.firestore, 'atc model'))
      this.setExistingNames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      if (this.form.get('atcmodel').hasError('duplicate')) {
        this.form.get('atcmodel').markAsTouched()
        return
      }

      const value: any = {
        ...this.form.value,
        atcmodel: this.typedName,
        forms: this.formRows.map(r => ({ formid: r.formid, filledby: r.filledby })),
      }
      let image: string | null = this.originalImage
      let replacedImage: string | null = null
      if (this.newImageFile) {
        image = await this.uploadNewImage(value.docid)
        value.image = image
        replacedImage = this.originalImage
      } else if (this.imageRemoved) {
        image = null
        value.image = deleteField()
        replacedImage = this.originalImage
      }

      const docRef = doc(this.firestore, 'atc model', value.docid);
      await setDoc(docRef, value, { merge: true });
      if (replacedImage) await this.deleteStoredImage(replacedImage)
      this.clearNewImage()
      this.dialogRef.close({ ...value, image });
    } catch (error) {
      console.error('Error saving:', error);
      this.saveError = "Couldn't save the ATC model. Try again."
    } finally {
      this.saving = false
    }
  }

  onCancel() {
    this.clearNewImage()
    this.dialogRef.close()
  }


}
