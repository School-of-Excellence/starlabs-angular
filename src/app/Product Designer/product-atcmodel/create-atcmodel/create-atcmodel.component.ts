import { CommonModule } from '@angular/common';
import { Component,OnInit,Inject } from '@angular/core';
import { collection, deleteField, doc, Firestore, getDocs, setDoc } from '@angular/fire/firestore';
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

    if(this.isEdit){
      this.form.patchValue(this.data.doc)
      this.originalImage = this.data.doc?.image || null
      this.previewUrl = this.originalImage
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
    if (this.form.invalid || this.saving) return
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

      const value: any = { ...this.form.value, atcmodel: this.typedName }
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
