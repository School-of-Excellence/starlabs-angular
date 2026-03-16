import { Component } from '@angular/core';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { addDoc, collection, collectionSnapshots, deleteDoc, arrayUnion, doc, docSnapshots, DocumentReference, Firestore, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Router } from '@angular/router';

@Component({
  selector: 'app-ah-notification',
  imports: [
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './ah-notification.component.html',
  styleUrl: './ah-notification.component.css'
})
export class AhNotificationComponent {
allusers:boolean = false
  appUserList = []
  profileList = []
  selectedProfiles = []
  mapProfiles = {}
  eventLists = [{
    eventpath: "",
    eventname: "",
    checked: false,
  }]
  eventParticipants = [{
    eventpath: "",
    profilepath: ""
  }]
  title = "";
  subtitle = "";
  message = "";
  landingPage = null
  sticky:boolean = false;
  notificationimage = null;

  // Array declarations
  templateArray = [];
  templateCategories = [];
  templateSubCategories = [];

  // Object declarations
  selectedTemplate:any = null;

  // String declarations
  searchCategory: string = "";
  searchSubCategory: string = "";
  broadcastname = "";
  view:string = "create";
  templateType:string = "Standard";

  templateForm !: FormGroup
  private subscription = new Subject<void>();
  constructor(public guard: AuthguardService, 
    public firestore: Firestore, 
    public router: Router, 
    public dialogRef: MatDialogRef<any>,
    private formbuilder: FormBuilder,
    public storage: AngularFireStorage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar) {
    this.templateForm = this.formbuilder.group ({
      templateName: ['',{validators: [Validators.required]}],
      templateAlias: ['',{validators: [Validators.required], updateOn: "change" }],
      templateCategory: ['',{validators: [Validators.required], updateOn: "change" }],
      templateSubCategory: ['',{validators: [Validators.required], updateOn: "change" }],
    });
    // this.eventLists = []
    // this.eventParticipants = []
    // guard.getRoles().then(roles =>{
    //   if(roles["superadmin"] || roles["ah"]){
    //     this.getData()
    //   }
    //   else{
    //     router.navigateByUrl('/')
    //   }
    // })
  }

  ngOnInit(): void {
    this.fetchTemplates();
    const categoryCollectionSnapShot = doc(this.firestore,"email validators","templateCategories")
    docSnapshots(categoryCollectionSnapShot).pipe(takeUntil(this.subscription)).subscribe((docdata)=>{
      let data = { id: docdata.id, ...docdata.data() };
      this.templateCategories = data['categories'] ?? []
      this.templateSubCategories = data['subcategories'] ?? []
    });
  }

  async fetchTemplates() {
    const notificationtemplates = collection(this.firestore,"notification templates")
    const notificationtemplatesQuery = query(notificationtemplates,where("templatevalidated","==",true),where("type","==","notification"))
    await collectionSnapshots(notificationtemplatesQuery).pipe(takeUntil(this.subscription)).subscribe((templates)=>{
      if(templates.length != 0) {
        this.templateArray = [];
        for (let i = 0; i < templates.length; i++) {
          const templatedata = templates[i];          
          this.templateArray.push(templatedata);
        }
      } else {
        console.log("Templates Not Found");
      }
    })
  }

  sendValidation(){
    let check = false;
    let formValue = this.templateForm.value;
    if(this.view == 'select'){
      check = [null,undefined,''].includes(this.broadcastname) || [null,undefined].includes(this.selectedTemplate) ? true : false;
    }else{
      check = [null,undefined,''].includes(formValue['templateAlias']) 
        || [null,undefined,''].includes(formValue['templateName']) 
        || [null,undefined,''].includes(formValue['templateCategory'])
        || [null,undefined,''].includes(formValue['templateSubCategory'])
        || [null,undefined,''].includes(this.title)
        || [null,undefined,''].includes(this.subtitle) ? true : false;
    }
    return check
  }


  onTemplateChange(event: any): void {
    this.selectedTemplate = event.value;
  }

  isTemplatePresent(): boolean {
    return Object.keys(this.selectedTemplate).length != 0;
  }

  importImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.notificationimage = input.files[0];
    }
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  async sendNotification(formValue){
    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Sending Notification"
      },
      disableClose: true
    });
    
    try {
      if(this.view == 'select') {
        if(this.selectedTemplate['message'].trim().length != 0){
          let data = {
            broadcastname: this.broadcastname,
            title: this.selectedTemplate['title'],
            subtitle: [null, undefined, ""].includes(this.selectedTemplate['subtitle']) ? "" : this.selectedTemplate['subtitle'],
            message: this.selectedTemplate['message'],
            landingpage: [null, undefined, ""].includes(this.selectedTemplate['landingpage']) ? "" : this.selectedTemplate['landingpage'],
            sticky: this.sticky,
            notificationimage: [null, undefined, ""].includes(this.selectedTemplate['notificationimage']) ? null : this.selectedTemplate['notificationimage']
          }
          this.dialogRef.close(data);
          this.openSnackBar("Notification Sent Successfully", "OK");
          dialogref.close();
        }
      } else if(this.view == 'create') {
        if(this.message.trim().length != 0){
          let data = {
            broadcastname: this.broadcastname,
            title: [null, undefined, ""].includes(this.title) ? "" : this.title,
            subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
            message: [null, undefined, ""].includes(this.message) ? "" : this.message,
            landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
            sticky: this.sticky,
            notificationimage: [null, undefined, ""].includes(this.notificationimage) ? null : this.notificationimage
          }

          this.dialogRef.close(data);
          dialogref.close();
  
          var notificationImage = null
          if(this.notificationimage != null){
            const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
            await this.storage.upload(filepath, this.notificationimage).then(async completed => {
              await completed.ref.getDownloadURL().then(url => {
                notificationImage = url
              }).catch(err => {console.log(err);})
            }).catch(err => {console.log(err);})
          }
          
          let docID = doc(collection(this.firestore,'inapp templates')).id
          let templatedata = {
            active: false,
            docid : docID,
            date : new Date(),
            createdby : this.guard.uid,
            templatealias : formValue['templateAlias'],
            templatelayout : "",
            templatename : formValue['templateName'],
            templatetype : this.templateType,
            category : formValue['templateCategory'],
            subcategory : formValue['templateSubCategory'],
            templatevalidated : false,
            templatestatus : "created" , 
            type : "notification",
            title: this.title.trim().length != 0 ? this.title.trim() : null,
            subtitle: this.subtitle.trim().length != 0 ? this.subtitle.trim() : null,
            message: this.message.trim(),
            landingpage: (this.landingPage ?? "").trim().length != 0 ? this.landingPage.trim() : null,
            sticky: this.sticky,
            notificationimage: notificationImage
          }

          // if(this.sticky) {
          //   await this.firestore.collection("inapp templates").doc(docID).set(templatedata, {merge: true}).then(()=>{
          //     console.log("Template added Successfully");
          //     this.openSnackBar("Notification Sent Successfully", "OK");
          //     this.dialogRef.close(data);
          //     dialogref.close();
          //   }).catch((error)=>{
          //     console.log("Oops Error while creating Template",error);
          //   });
          // } else {
          //   await this.firestore.collection("notification templates").doc(docID).set(templatedata, {merge: true}).then(()=>{
          //     console.log("Template added Successfully");
          //     this.openSnackBar("Notification Sent Successfully", "OK");
          //     this.dialogRef.close(data);
          //     dialogref.close();
          //   }).catch((error)=>{
          //     console.log("Oops Error while creating Template",error);
          //   });
          // }
        }
      }
    } catch {
      dialogref.close();
      this.openSnackBar("Error Sending Notification", "OK");
    }
  }

  // getData(){
  //   this.firestore.collection("profile_data", ref => ref.orderBy("name")).snapshotChanges().subscribe(profile=>{
  //     var localProfile = []
  //     var localUser = []
  //     profile.forEach(doc=>{
  //       if(doc.payload.doc.data()["user_ref"] != null){
  //         localUser.push({
  //           profilepath: doc.payload.doc.ref.path,
  //           userpath: doc.payload.doc.data()["user_ref"]["path"]
  //         })
  //       }
  //       this.mapProfiles[doc.payload.doc.ref.path] = doc.payload.doc.data()["name"]
  //       localProfile.push(doc.payload.doc.ref.path)
  //     })
  //     this.profileList = localProfile
  //     this.appUserList = localUser
  //   })
  //   this.firestore.collection("event collection").get().toPromise().then(eventData=>{
  //     var localEvent = []
  //     eventData.forEach(event=>{
  //       localEvent.push({
  //         eventpath: event.ref.path,
  //         eventname: event.data()["name"],
  //         checked: false,
  //       })
  //     })
  //     this.eventLists = localEvent
  //   })
  //   this.firestore.collection("events_profiles").snapshotChanges().subscribe(eventParticipants=>{
  //     var localParticipants = []
  //     eventParticipants.forEach(participants=>{
  //       localParticipants.push({
  //         eventpath: participants.payload.doc.data()["event_ref"]["path"],
  //         profilepath: participants.payload.doc.data()["profile_ref"]["path"],
  //       })
  //     })
  //     this.eventParticipants = localParticipants
  //   })
  // }

  selectAll(value){
    if(value){
      this.selectedProfiles = this.profileList
      this.eventLists.forEach(event => event.checked = false)
    }
    else{
      this.selectedProfiles = []
    }
  }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  onEventSelect(index, value){
    var eventpath = this.eventLists[index].eventpath
    if(value){
      this.eventParticipants.filter(e => e.eventpath == eventpath).forEach(profile =>{
        if(!this.selectedProfiles.includes(profile.profilepath)) this.selectedProfiles.push(profile.profilepath)
      })
    }
    else{
      this.eventParticipants.filter(e => e.eventpath == eventpath).forEach(profile =>{
        if(this.selectedProfiles.includes(profile.profilepath)){
          var valueIndex = this.selectedProfiles.findIndex(e => e == profile.profilepath)
          this.selectedProfiles.splice(valueIndex, 1)
        }
      })
    }
    this.selectedProfiles = this.selectedProfiles.concat([])
  }

  returnNameList():string{
    var name = []
    this.selectedProfiles.forEach(path => name.push(this.mapProfiles[path]))
    return name.join(', ')
  }

  addCategory(){
    const categoryCollectionRef = doc(this.firestore,"email validators","templateCategories")
    setDoc(categoryCollectionRef,{
      categories : arrayUnion(this.searchCategory)
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateCategory'].setValue(this.searchCategory);
      this.searchCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }


  addSubCategory(){
    const categoryCollectionRef = doc(this.firestore,"email validators","templateCategories")
    setDoc(categoryCollectionRef,{
      subcategories : arrayUnion(this.searchSubCategory)
    },{merge:true}).then(()=>{
      console.log("Category Added Successfully");
      this.templateForm.controls['templateSubCategory'].setValue(this.searchSubCategory);
      this.searchSubCategory = "";
    }).catch((error)=>{
      console.log("Oops Error While Adding Category",error);
    });
  }

  onSearchCategory(){
    let returnData = this.templateCategories;
    if(![null,undefined,""].includes(this.searchCategory)){
      return returnData.filter((e)=>e.includes(this.searchCategory));
    }else{
      return this.templateCategories;
    }
  }

  onSearchSubCategory(){
    let returnData = this.templateSubCategories;
    if(![null,undefined,""].includes(this.searchSubCategory)){
      return returnData.filter((e)=>e.includes(this.searchSubCategory));
    }else{
      return this.templateSubCategories;
    }
  }

  sendUpdates(){
    if(this.selectedProfiles.length != 0 && this.message.trim().length != 0){
      var userRef = []
      this.selectedProfiles.forEach(path =>{
        this.appUserList.filter(e => e.profilepath == path).forEach(user =>{
          userRef.push(doc(this.firestore,user.userpath))
        })
      })
      addDoc(collection(this.firestore,"A&H updates"),{
        date: new Date(),
        message: this.message,
        users: userRef,
        sticky: this.sticky
      }).then(()=>{
        alert("A&H Update sent")
      })
      this.selectedProfiles = []
      this.eventLists.forEach(data =>{
        data.checked = false
      })
      this.eventLists = this.eventLists.concat([])
      this.message = ""
    }
    else{
      alert("Select At least one profile and Send updates")
    }
  }

}
