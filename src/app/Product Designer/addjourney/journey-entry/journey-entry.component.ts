import { Component, Inject, OnInit } from '@angular/core';
import { collection, deleteDoc, doc, Firestore, Timestamp, getDocs, setDoc, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { NgFor, NgIf } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { Storage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from '@angular/fire/storage';

@Component({
  selector: 'app-journey-entry',
  imports: [
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatInputModule,
    NgIf,
    NgFor,
    MatFormFieldModule,
    MatChipsModule,
    MatRadioModule,
    MatSelectModule
  ],
  templateUrl: './journey-entry.component.html',
  styleUrl: './journey-entry.component.css'
})
export class JourneyEntryComponent implements OnInit {
  // addJourneyForm : FormGroup = this.fb.group ({
  //   journey:[,{validators : [Validators.required],updateOn : "change"}],
  //   originalfee:[0,],
  //   extras: [[],],
  //   atcmodel:[null,],
  //   journeyupgrades: [[],],
  //   addonproducts: [[],],
  //   type : ["",]
  // })
  addJourneyForm!: FormGroup;
  journeyarray = []
  dialogtitle
  submitbutton
  crossmatch:boolean
  croosmatcherrormessage
  delete = false

  atcModelList = []
  videos = []
  attachments: Array<{ name: string; type: string; size: number; uploadedAt: Timestamp; url: string }> = [];
  readonly MAX_FILE_SIZE = 5 * 1024 * 1024;
  uploadProgress: number | null = null;

  // collectionVariables
  journeyCollection;
  atcModelCollection;
  contenturlcollection;

  addOnBlur = true;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  constructor(
    public dialogref: MatDialogRef<JourneyEntryComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb : FormBuilder,
    private storage: Storage,
    private afs: Firestore
  ){
    this.journeyCollection = collection(this.afs, 'journey');
    this.atcModelCollection = collection(this.afs, "atc model");
    this.contenturlcollection = collection(this.afs, "content_urls");

    this.submitbutton = this.data !== null ? "Update" : "Submit"
    this.dialogtitle = this.data !== null ? "Edit Journey" : "Add Journey"
    this.initializeForm();
    if(this.data){
      if(this.data.delete){
        this.delete = this.data.delete
      }if(this.data.journey){
        this.addJourneyForm.patchValue({
          journey : data.journey,
          // count : data.count,
          originalfee:data.originalfee ?? 0,
          extras:data.extras ?? [],
          addonproducts:data.addonproducts ?? [],
          journeyupgrades:data.journeyupgrades ?? [],
          type : data.type ?? null,
          atcmodel : data.atcmodel ?? null,
          playlist : data.playlist ?? []
        })
        this.attachments = data.attachments ?? [];
      }
    }
    this.loadJourneyData()
    // this.afs.collection("journey").get().toPromise().then((snapshot) => {
    //   this.journeyarray = snapshot.docs.map(e => e.data())
    // })
    // this.afs.collection("atc model").get().toPromise().then(snap => {
    //   this.atcModelList = snap.docs.map(e => e.data())
    // })
  }
  private initializeForm(){
    this.addJourneyForm = this.fb.group({
      journey: ['', { validators: [Validators.required], updateOn: 'change' }],
      originalfee: [0],
      extras: [[]],
      atcmodel: [null],
      journeyupgrades: [[]],
      addonproducts: [[]],
      type: [''],
      playlist: [[]]
    });
  }
  async loadJourneyData() {
    try {
      const snapshot = await getDocs(this.journeyCollection);
      this.journeyarray = snapshot.docs.map(doc => doc.data());
      console.log('Journey data loaded:', this.journeyarray);
    } catch (error) {
      console.error('Error loading journey data:', error);
    }
    try {
      const atcSnapshot = await getDocs(this.atcModelCollection)
      this.atcModelList = atcSnapshot.docs.map(e => e.data());
    } catch (error) {
      console.error('Error loading journey data:', error);
    }
    try {
      const content = await getDocs(this.contenturlcollection)
      this.videos = content.docs.map((e:any) => ({docref: e.ref,...e.data()}));
    } catch (error) {
      console.error('Error loading journey data:', error);
    }
  }
  ngOnInit(): void {}

  onvaluechange(event){
    const match = this.journeyarray.some((items) => {
      let a = event?.replace(/ /g,"").toLowerCase()
      let b = items.journey.replace(/ /g, "").toLowerCase()
      return a === b
    })
    this.crossmatch = match
    return this.croosmatcherrormessage = match === true ? event + " already exist .Choose another journey" : false
  }

  getErrorMessage(): string {
    if (this.addJourneyForm.get('journey')?.hasError('required')) {
      return 'You must enter a journey';
    }
    return '';
  }

  async onformsubmit(value){
    console.log(value);

    const journeyData = {
      journey: value.journey,
      originalfee: value.originalfee,
      extras: value.extras,
      addonproducts: value.addonproducts,
      journeyupgrades: value.journeyupgrades,
      type: value.type ?? null,
      atcmodel: value.atcmodel ?? null,
      playlist : (value.playlist ?? []).length == 0 ? null : value.playlist,
      attachments: this.attachments
    };
    if(this.data !== null){
      const jouneyDoc = doc(this.journeyCollection,this.data.id)
      await updateDoc(jouneyDoc,journeyData)
      this.addJourneyForm.reset()
      console.log("Document successfully updated");
      this.dialogref.close();
    }if(this.data === null){
      const newDocRef = doc(this.journeyCollection)
      const newJourneyData = {
        id:newDocRef.id,
        ...journeyData
      }
      await setDoc(newDocRef,newJourneyData)
      console.log("Form successfully submitted");
      this.dialogref.close();
    }
  }

  async onAttachmentSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    for (const file of Array.from(input.files)) {
      if (file.size > this.MAX_FILE_SIZE) {
        alert(`"${file.name}" exceeds 5MB`);
        continue;
      }
      try {
        this.uploadProgress = 0;
        const storageRef = ref(this.storage, `journey/attachments/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              this.uploadProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            },
            (error) => {
              console.error('upload error:', error);
              reject(error);
            },
            () => resolve()
          );
        });
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        this.attachments = [...this.attachments, { name: file.name, type: file.type, size: file.size, uploadedAt: Timestamp.now(),url }];
        this.uploadProgress = null;
      } catch (err) {
        console.error('upload error:', err);
        this.uploadProgress = null;
      }
    }
    input.value = '';
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  ondelete(id){
    const journeyDoc = doc(this.journeyCollection,id)
    deleteDoc(journeyDoc).then(() => {
      console.log("document successfully deleted");
      this.dialogref.close()
    })
    // this.afs.collection("journey").doc(id).delete().then(() => {
    //   console.log("document successfully deleted");
    //   this.dialogref.close()
    // })
  }

  onCancel(){this.dialogref.close()}

  addExtras(event: MatChipInputEvent): void {
    const values = (event.value || '').trim();
    if (values) {
      this.addJourneyForm.get('extras').value.push(values);
    }
    event.input.value = null
  }

  removeExtras(value): void {
    const index = this.addJourneyForm.get('extras').value.indexOf(value);
    if (index >= 0) {
      this.addJourneyForm.get('extras').value.splice(index, 1);
    }
  }

  addUpgrades(event: MatChipInputEvent): void {
    const values = (event.value || '').trim();
    if (values) {
      this.addJourneyForm.get('journeyupgrades').value.push(values);
    }
    event.input.value = null
  }

  removeUpgrades(value): void {
    const index = this.addJourneyForm.get('journeyupgrades').value.indexOf(value);
    if (index >= 0) {
      this.addJourneyForm.get('journeyupgrades').value.splice(index, 1);
    }
  }

  addAddons(event: MatChipInputEvent): void {
    const values = (event.value || '').trim();
    if (values) {
      this.addJourneyForm.get('addonproducts').value.push(values);
    }
    event.input.value = null
  }

  removeAddons(value): void {
    const index = this.addJourneyForm.get('addonproducts').value.indexOf(value);
    if (index >= 0) {
      this.addJourneyForm.get('addonproducts').value.splice(index, 1);
    }
  }

  compareRef(o1: any, o2: any): boolean {
    return o1 && o2 && o1.path === o2.path;
  }

}
