import { Component, Inject } from '@angular/core';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { FormBuilder, FormArray, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-releaselogdialog',
  imports: [
    CommonModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    ProfilePictureComponent,
  ],
  templateUrl: './releaselogdialog.component.html',
  styleUrl: './releaselogdialog.component.css'
})
export class ReleaselogdialogComponent {

  // String declarations
  logNumber = "";

  // Array declarations
  logArray = [];

  // Boolean declarations
  developer: boolean = false;
  logform!:FormGroup


  constructor(private firestore : Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef :MatDialogRef<ReleaselogdialogComponent>,
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthguardService) { 
      this.logform = this.fb.group({
        notes: this.fb.array([])
      });
      auth.getRoles().then(async (roles) => {
        this.developer = roles['developer'] ?? false
      })
      const releaselogRef = collection(this.firestore,'releaselog')
      const releaseQuery = query(releaselogRef,orderBy("date", "desc"),limit(1))
      getDocs(releaseQuery).then((log)=>{
        if(!log.empty) {
          this.logNumber = this.updateLogNumber(log.docs[0].data()['versionno']);
        } else {
          this.logNumber = "1.0.0";
        }
      });
      const releaseQuery2 = query(releaselogRef,where("routeurl","==",this.data.currentUrl),orderBy("date", "desc"))
      getDocs(releaseQuery2).then((log)=>{
        if(log.docs.length != 0) {
          for (let i = 0; i < log.docs.length; i++) {
            const logdata = log.docs[i].data();
            this.logArray.push(logdata);
          }
        } else {
          console.log("No Log Found");
        }
      });

      this.addItem();
    }

  ngOnInit(): void {
  }

  get itemsArray() {
    return this.logform.get('notes') as FormArray;
  }

  updateLogNumber(logversion) {
    const [major, minor, patch] = logversion.split('.').map(Number);

    let newPatch = patch + 1;
    let newMinor = minor;
    let newMajor = major;

    if (newPatch >= 10) {
      newPatch = 0;
      newMinor += 1;
    }

    if (newMinor >= 10) {
      newMinor = 0;
      newMajor += 1;
    }

    return `${newMajor}.${newMinor}.${newPatch}`;
  }

  createItem(): FormGroup {
    return this.fb.group({
      log: ['', Validators.required],
    });
  }

  addItem() {
    this.itemsArray.push(this.createItem());
  }

  removeItem(index: number) {
    this.itemsArray.removeAt(index);
  }

  async addLog() {
    let notesArray = [];
    let profileData = {};
    this.logform.value.notes.map((e)=>{
      notesArray.push(e.log)
    });
    const profiledataRef = collection(this.firestore,'profile_data')
    const userrefDoc = doc(this.firestore,'user_data',this.auth.uid)
    const profiledataQuery = query(profiledataRef,where("user_ref","==",userrefDoc))
    getDocs(profiledataQuery).then((profile)=>{
      if(profile.docs.length != 0) {
        profileData = profile.docs[0].data();
      }
    })

    var map = {
      "routeurl" : this.data.currentUrl,
      "notes" : notesArray,
      "developer_pid": profileData['profileid'],
      "developer_name" : profileData['name'],
      "developer_uid" : profileData['user_ref'].id,
      "versionno": this.logNumber,
      "screen_name": this.data.currentComponent,
      "date": new Date()
    }

    const docID = doc(collection(this.firestore,'releaselog')).id
    const releaselogSet = doc(this.firestore,'releaselog',docID)
    setDoc(releaselogSet,{
      map
    }).then(()=>{
      console.log("Log Submitted");
      this.dialogRef.close();
    }).catch((error)=>{
      console.log("Error:",error);
    })
  }

}
