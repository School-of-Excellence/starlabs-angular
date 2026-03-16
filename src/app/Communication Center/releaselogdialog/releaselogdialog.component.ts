import { Component, Inject, OnInit } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthguardService } from '../../authguard.service';

@Component({
  selector: 'app-releaselogdialog',
  templateUrl: './releaselogdialog.component.html',
  styleUrls: ['./releaselogdialog.component.css']
})
export class ReleaselogdialogComponent implements OnInit {

  // String declarations
  logNumber = "";

  // Array declarations
  logArray = [];

  // Boolean declarations
  developer: boolean = false;

  logform : FormGroup;

  constructor(private firestore : Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef :MatDialogRef<ReleaselogdialogComponent>,
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthguardService) { 

      auth.getRoles().then(async (roles) => {
        this.developer = roles['developer'] ?? false
      })

      this.logform = this.fb.group({
        notes: this.fb.array([])
      });

      // this.firestore.collection('releaselog', ref => ref.orderBy("date", "desc").limit(1)).get().toPromise().then((log)=>{
      //   if(!log.empty) {
      //     this.logNumber = this.updateLogNumber(log.docs[0].data()['versionno']);
      //   } else {
      //     this.logNumber = "1.0.0";
      //   }
      // });

      // this.firestore.collection('releaselog', ref => ref.where("routeurl","==",this.data.currentUrl).orderBy("date", "desc")).get().toPromise().then((log)=>{
      //   if(log.docs.length != 0) {
      //     for (let i = 0; i < log.docs.length; i++) {
      //       const logdata = log.docs[i].data();
      //       this.logArray.push(logdata);
      //     }
      //   } else {
      //     console.log("No Log Found");
      //   }
      // });

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

    // await this.firestore.collection("profile_data", ref => ref.where("user_ref","==", this.firestore.collection("user_data").doc(this.auth.uid).ref)).get().toPromise().then((profile)=>{
    //   if(profile.docs.length != 0) {
    //     profileData = profile.docs[0].data();
    //   }
    // })

    // var map = {
    //   "routeurl" : this.data.currentUrl,
    //   "notes" : notesArray,
    //   "developer_pid": profileData['profileid'],
    //   "developer_name" : profileData['name'],
    //   "developer_uid" : profileData['user_ref'].id,
    //   "versionno": this.logNumber,
    //   "screen_name": this.data.currentComponent,
    //   "date": serverTimestamp()
    // }

    // const docID = this.firestore.createId();
    // this.firestore.collection('releaselog').doc(docID).set(map).then(()=>{
    //   console.log("Log Submitted");
    //   this.dialogRef.close();
    // }).catch((error)=>{
    //   console.log("Error:",error);
    // })
  }

}
