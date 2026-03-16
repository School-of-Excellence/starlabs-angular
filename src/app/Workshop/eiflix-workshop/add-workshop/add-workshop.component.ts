import { Component, OnInit,Inject} from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { collection, collectionData, doc ,setDoc, updateDoc} from '@angular/fire/firestore';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatOptionModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { AuthguardService } from '../../../authguard.service';

@Component({
  selector: 'app-add-workshop',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatDialogModule,
    MatIconModule,
    MatOptionModule,
    MatChipsModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatButtonModule
  ],
  templateUrl: './add-workshop.component.html',
  styleUrls: ['./add-workshop.component.css']
})
export class AddWorkshopComponent implements OnInit {
  startDatePicker: any;
  endDatePicker: any;
  registrationDatePicker: any;
  profileData:any = {}
  mapUserRefToName = {}
  createForm!: FormGroup;
  challengelist:any[] = []
  enrollmentlist:any[] = []
  filteredProfileData:any[] = []

  constructor(
    @Inject(MAT_DIALOG_DATA) public currentContent: any,
    private formbuilder:FormBuilder,
    private storage : Storage,
    private firestore:Firestore,
    private _snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AddWorkshopComponent>,
    private authguard: AuthguardService
  ){ 
    this.authguard.getProfileMap().then(e => {
      this.profileData = Object.values(e.docdata).filter(e => ![null,undefined].includes(e['user_ref']))
      this.filteredProfileData = this.profileData
      for (let i = 0; i < this.profileData.length; i++) {
        const element = this.profileData[i];
        if(element.user_ref != undefined && element.user_ref != null){
          this.mapUserRefToName[element.user_ref.id] = element['name']
        }
      }
    })
    const enrolmentRef = collection(this.firestore, "eiflix enrolment");
    collectionData(enrolmentRef).subscribe(snap => {
      this.enrollmentlist = snap;
    })

    const challengeRef = collection(this.firestore, "eiflix workshop challenges");
    collectionData(challengeRef).subscribe(snap => {
      this.challengelist = snap;
    })
  }

  ngOnInit(): void {
    this.createForm = this.formbuilder.group({
    title: [null,[Validators.required]],
    description:[null,],
    challengeref:[null,[Validators.required]],
    enrolmentref:[null,[Validators.required]],
    workshopgroupname:[null,[Validators.required]],
    workshopadmin:[[],],
    startdate: [null,[Validators.required]],
    enddate: [null,[Validators.required]],
    lastregistrationdate: [null,[Validators.required]],
    workshopthumbnail:[{},],
    workshoptrailer:[[],]
  })
  if (this.currentContent != null) {
    const startDate = this.currentContent.startdate?.toDate?.();
    const endDate = this.currentContent.enddate?.toDate?.();
    const lastDate = this.currentContent.lastregistrationdate?.toDate?.();
    const convertStartDate = startDate ? `${startDate.toISOString().substring(0, 10)}T${startDate.getHours()}:${startDate.getMinutes()}`: null;
    this.createForm.patchValue({
      title: this.currentContent.title ?? null,
      description: this.currentContent.description ?? null,
      challengeref: this.currentContent.challengeref?.id ?? null,
      enrolmentref: this.currentContent.enrolmentref?.id ?? null,
      workshopgroupname: this.currentContent.workshopgroupname ?? null,
      workshopadmin: this.currentContent.workshopadmin ?? [],
      startdate: convertStartDate,
      enddate: endDate ?? null,
      lastregistrationdate: lastDate ?? null,
      workshopthumbnail: this.currentContent.workshopthumbnail ?? {},
      workshoptrailer: this.currentContent.workshoptrailer ?? []
    });
  }
  }

  onAddImage(event: Event) {
    let eventvalue = (event.target as HTMLInputElement).value.trim();
    let filtervalue = !["", null, undefined].includes(eventvalue) ? eventvalue.trim() : "";
    let key = filtervalue.split("size")[1];

    if (key != undefined && key.includes("w") && key.includes("h")) {
      const currentValue = { ...(this.createForm.get('workshopthumbnail')?.value || {}) };
      currentValue[key] = filtervalue;
      this.createForm.get('workshopthumbnail')?.setValue(currentValue);
    } else {
      this.openSnackBar("Invalid url");
    }

    (event.target as HTMLInputElement).value = "";
}

  onRemoveImage(key: string) {
    const currentValue = { ...this.createForm.get('workshopthumbnail')?.value };
    delete currentValue[key];
    this.createForm.get('workshopthumbnail')?.setValue(currentValue);
  }

  get workshopThumbnailValue(): { [key: string]: string } {
   return this.createForm.get('workshopthumbnail')?.value || {};  
  }

  onAddVideo(event: Event) {
    let eventvalue = (event.target as HTMLInputElement).value.trim();
    let filtervalue = !["", null, undefined].includes(eventvalue) ? eventvalue.trim() : "";

    if (filtervalue.length !== 0) {
      const currentList = [...(this.createForm.get('workshoptrailer')?.value || [])];
      currentList.push(filtervalue);
      this.createForm.get('workshoptrailer')?.setValue(currentList);
    }

    (event.target as HTMLInputElement).value = "";
}

  onRemoveVideo(index: number) {
  const currentList = [...(this.createForm.get('workshoptrailer')?.value || [])];
  currentList.splice(index, 1);
  this.createForm.get('workshoptrailer')?.setValue(currentList);
}

  onTextSearch(type:string,event:Event){
    let textvalue = (event.target as HTMLInputElement).value.trim()
    let filtervalue = ![null,undefined,""].includes(textvalue) ? textvalue.toLowerCase() : ""
    if(type === 'workshopadmin'){
      this.filteredProfileData = this.profileData.filter(e => e.name.toLowerCase().indexOf(filtervalue) === 0)
    }
  }

  onRemoveWorkshopAdmin(formkey:string,index:number){
    this.createForm.get(formkey).value.splice(index,1)
  }

  onAddFromChipList(formkey:string,event:MatAutocompleteSelectedEvent){
    this.createForm.get(formkey).value.push(event.option.value)
  }

  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.id === c2.id : c1 === c2;
  }

  submit() {
    if (this.createForm.valid) {
      console.log("form", this.createForm.value);
      var docid = this.currentContent != null ? this.currentContent.docid : crypto.randomUUID();
      // console.log(this.currentContent);
      this.createForm.value['challengeref'] = this.createForm.value['challengeref'] != undefined? doc(this.firestore, "eiflix workshop challenges", this.createForm.value['challengeref']): null;
     this.createForm.value['enrolmentref'] = this.createForm.value['enrolmentref'] != undefined
      ? doc(this.firestore, "eiflix enrolment", this.createForm.value['enrolmentref'])
      : null;
      if([null,undefined].includes(this.currentContent)){
        console.log("onset");
         const docRef = doc(this.firestore, "eiflix workshop", docid)
         setDoc(docRef, {
          docid: docid,
          title: this.createForm.value.title,
          description:this.createForm.value.description,
          challengeref:this.createForm.value.challengeref,
          enrolmentref:this.createForm.value.enrolmentref,
          workshopadmin:this.createForm.value.workshopadmin,
          workshopgroupname:this.createForm.value.workshopgroupname,
          startdate: new Date(this.createForm.value.startdate),
          enddate: this.createForm.value.enddate,
          lastregistrationdate: this.createForm.value.lastregistrationdate,
          workshopthumbnail:this.createForm.value.workshopthumbnail,
          workshoptrailer:this.createForm.value.workshoptrailer
        }).then(() => {
          console.log("Document successfully written!");
          this.dialogRef.close(); 
        }).catch((error) => {
          console.error("Error writing document: ", error);
        });
      }else{
        console.log("on update");
        const docRef = doc(this.firestore, "eiflix workshop", docid);
        updateDoc(docRef, {
          docid: docid,
          title: this.createForm.value.title,
          description:this.createForm.value.description,
          challengeref:this.createForm.value.challengeref,
          enrolmentref:this.createForm.value.enrolmentref,
          workshopadmin:this.createForm.value.workshopadmin,
          workshopgroupname:this.createForm.value.workshopgroupname,
          startdate: new Date(this.createForm.value.startdate),
          enddate: this.createForm.value.enddate,
          lastregistrationdate: this.createForm.value.lastregistrationdate,
          workshopthumbnail:this.createForm.value.workshopthumbnail,
          workshoptrailer:this.createForm.value.workshoptrailer
        }).then(() => {
          console.log("Document successfully updated!");
          this.dialogRef.close(); 
        }).catch((error) => {
          console.error("Error updating document: ", error);
        });
      }
    }
  }

  openSnackBar(message:string) {
    this._snackBar.open(message, 'Close', {
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  dialogClose(){
    this.dialogRef.close()
  }
}
