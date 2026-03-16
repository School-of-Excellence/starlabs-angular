import * as XLSX from 'xlsx'; 
import { Component ,OnInit,Inject} from '@angular/core';
import { Firestore, collection,writeBatch, collectionData,query, where,getDoc,setDoc, getDocs,doc, updateDoc, deleteDoc ,serverTimestamp} from '@angular/fire/firestore';
import { Storage, ref as afRef, uploadBytes as afUploadBytes, getDownloadURL as afGetDownloadURL } from '@angular/fire/storage';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { AuthguardService } from '../../../authguard.service';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-evolutiom-mapping-add',
  imports: [
    MatFormFieldModule,
    CommonModule,MatDatepickerModule,FormsModule,MatSelectModule,MatProgressBarModule,NgxMatSelectSearchModule,MatInputModule,MatButtonModule,MatIconModule,MatTableModule  
  ],
  templateUrl: './evolutiom-mapping-add.component.html',
  styleUrl: './evolutiom-mapping-add.component.css'
})
export class EvolutiomMappingAddComponent {
   mapProfile: { [key: string]: string } = {};
  loading:boolean = true;
  disableButton:boolean = false;
  searchTerm: string = '';
  selectedProfile: string | null = null;
  filteredKeys: string[] = [];  
  title: string = '';
  videourl: string = '';
  recordedDate: Date | null = null;

   importPreview: any[] = [];
    mapEmailData: any = {};
  constructor(
    public firestore: Firestore, 
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,
    public dialogRef: MatDialogRef<EvolutiomMappingAddComponent>,
    @Inject(MAT_DIALOG_DATA) public data : any,
    public router: Router,
  ) { 
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
     this.mapEmailData = e.mapEmailData;
      this.filteredKeys = this.getKeys(this.mapProfile);
    }).then(value=>{
      this.loading = false;
    })
  }

  ngOnInit(): void {
    console.log("consoling edit data",this.data);
    if (this.data) {
      this.selectedProfile = this.data.profileid;
      this.title = this.data.title;
      this.recordedDate = this.data.recordeddate.toDate();
      this.videourl = this.data.videourl;
    }
  }

  getKeys(obj: any): string[] {
    return Object.keys(obj);
  }

  filterOptions(): void {
    this.filteredKeys = this.getKeys(this.mapProfile).filter(key => 
      this.mapProfile[key].toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  onSelect(selectedId: string): void {
    this.selectedProfile = selectedId; 
    console.log('Selected ID:', selectedId);
  }
  async addEvolution() {
  this.disableButton = true;

  // Validate inputs
  if (!this.selectedProfile || !this.title || !this.recordedDate || !this.videourl) {
    alert('Please fill in all required fields.');
    this.disableButton = false;
    return;
  }

  try {
    if (this.data != null) {
      // 🔹 Update existing evolution mapping document
      const docRef = doc(this.firestore, 'evolutionmappingvideo', this.data.docid);

      await setDoc(
        docRef,
        {
          recordeddate: this.recordedDate,
          title: this.title,
          videourl: this.videourl,
        },
        { merge: true } // merges existing data
      );

      this.disableButton = false;
      this.closeDialog();

    } else {
      // 🔹 Create a new document reference with auto-generated ID
      const newDocRef = doc(collection(this.firestore, 'evolutionmappingvideo'));
      const documentId = newDocRef.id;

      await setDoc(newDocRef, {
        docid: documentId,
        recordeddate: this.recordedDate,
        title: this.title,
        videourl: this.videourl,
        profileid: this.selectedProfile,
        created: serverTimestamp(),
        deleted: false,
        // urllive: true
      });

      // Reset form fields
      this.disableButton = false;
      console.log('✅ Added successfully!');
      this.recordedDate = null;
      this.title = null;
      this.videourl = null;
      this.selectedProfile = null;
    }
  } catch (error) {
    this.disableButton = false;
    console.error('❌ Error adding/updating document:', error);
  }
}
  // addEvolution() {
  //   this.disableButton = true;
  //   if (!this.selectedProfile || !this.title || !this.recordedDate || !this.videourl) {
  //     alert('Please fill in all required fields.');
  //     return;
  //   }
  //   if (this.data != null) {
  //     this.firestore.collection("evolutionmappingvideo").doc(this.data.docid).set({
  //       recordeddate: this.recordedDate,
  //       title: this.title,
  //       videourl: this.videourl,
  //     }, { merge: true }).then(value =>{
  //       this.disableButton = false;
  //       this.closeDialog()
  //     })
  //   } else {
  //     const documentId = this.firestore.createId();
  //     const evolutionMapCollection = this.firestore.collection("evolutionmappingvideo").doc(documentId);
  //     evolutionMapCollection.set({
  //       docid: documentId,
  //       recordeddate: this.recordedDate,
  //       title: this.title,
  //       videourl: this.videourl,
  //       profileid: this.selectedProfile,
  //       created:firebase.firestore.FieldValue.serverTimestamp(),
  //       deleted:false,
  //       // urllive:true
  //     })
  //     .then(() => {
  //       this.disableButton = false;
  //       console.log('added');
  //       this.recordedDate = null,
  //       this.title = null,
  //       this.videourl = null,
  //       this.selectedProfile = null
  //     })
  //     .catch((error) => {
  //       console.error('Error', error);
  //     });
  //   }
  // }
  closeDialog() {
    this.dialogRef.close();
  }
    onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload only Excel or CSV files.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      this.importPreview = [];
      jsonData.slice(1).forEach((row: any) => {
        let [email, title, videourl] = row;
        if (!email && !title && !videourl) return;
        email = email ? String(email).trim() : '';
        videourl = videourl ? String(videourl).trim() : '';
        if (typeof title === 'number') {
          const date = XLSX.SSF.parse_date_code(title);
          if (date) {
            const jsDate = new Date(date.y, date.m - 1, date.d);
            title = jsDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
          } else {
            title = String(title);
          }
        } else {
          title = String(title ?? '');
        }
        const profileData = this.mapEmailData[email];
        this.importPreview.push({
          email,
          title,
          videourl,
          profileid: profileData ? profileData['profileid'] ?? profileData['id'] : null,
        });
      });
    };

    reader.readAsArrayBuffer(file);
  }

  // onFileSelected(event: any): void {
  //   const file = event.target.files[0];
  //   if (!file) return;

  //   const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
  //   if (!allowedTypes.includes(file.type)) {
  //     alert('Please upload only Excel or CSV files.');
  //     return;
  //   }

  //   const reader = new FileReader();
  //   reader.onload = (e: any) => {
  //     const data = new Uint8Array(e.target.result);
  //     const workbook = XLSX.read(data, { type: 'array' });
  //     const sheetName = workbook.SheetNames[0];
  //     const worksheet = workbook.Sheets[sheetName];
  //     const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  //     this.importPreview = []; 

  //     jsonData.slice(1).forEach((row: any) => {
  //       const [email, title, videourl] = row;
  //       if (email && title && videourl) {
  //         const profileData = this.mapEmailData[email];
  //         this.importPreview.push({
  //           email,
  //           title,
  //           videourl,
  //           profileid: profileData ? profileData['profileid'] : null,
  //         });
  //       }
  //     });
  //   };
  //   reader.readAsArrayBuffer(file);
  // }
  async uploadBulk() {
    this.disableButton = true;
    const batch = writeBatch(this.firestore);
    let count = 0;

    for (const item of this.importPreview) {
      if (!item.profileid) continue;

      const newDocRef = doc(collection(this.firestore, 'evolutionmappingvideo'));
      batch.set(newDocRef, {
        docid: newDocRef.id,
        recordeddate: serverTimestamp(),
        title: item.title,
        videourl: item.videourl,
        profileid: item.profileid,
        created: serverTimestamp(),
        deleted: false
      });
      count++;
    }

    try {
      await batch.commit();
      alert(`${count} records uploaded successfully!`);
      this.importPreview = [];
    } catch (err) {
      console.error('Bulk upload failed:', err);
      alert('Error during bulk upload. Check console.');
    } finally {
      this.disableButton = false;
    }
  }

}