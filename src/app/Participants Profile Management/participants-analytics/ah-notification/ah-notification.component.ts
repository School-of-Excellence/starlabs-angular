import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { DocumentReference, Firestore, doc, docData, query, where, getDocs, collectionData, serverTimestamp, arrayUnion, setDoc, collection, addDoc, orderBy, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../../authguard.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { LoadingProgressComponent } from '../../../loading-progress/loading-progress.component';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Router } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Inject } from '@angular/core';

@Component({
  selector: 'app-ah-notification',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatSelectModule,
    CommonModule,
    NgxMatSelectSearchModule,
    FormsModule,
    MatCheckboxModule,
    MatDialogModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatTooltipModule,
    MatSlideToggleModule
  ],

  templateUrl: './ah-notification.component.html',
  styleUrl: './ah-notification.component.css'
})
export class AhNotificationComponent implements AfterViewInit {

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  allusers: boolean = false
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
  sticky: boolean = false;
  logged:boolean = true;
  notificationimage = null;

  // Array declarations
  templateArray = [];
  templateCategories = [];
  templateSubCategories = [];

  // Object declarations
  selectedTemplate: any = null;

  // String declarations
  searchCategory: string = "";
  searchSubCategory: string = "";
  broadcastname = "";
  view: string = "create";
  templateType: string = "Standard";
  searchFilter: string = "";

  // Edit mode
  isEditMode: boolean = false;
  editingDocId: string | null = null;

  templateForm: FormGroup
  categoryCollectionRef: DocumentReference
  private destroy$ = new Subject<void>()
  scheduled: boolean = false;
  scheduleDate: Date | null = null;
  scheduleTime: string = '';
  scheduleDateTime: Date | null = null;
  scheduletime: any = null;
  minDate: Date = new Date();
  profiles: string[] = [];
  displayedColumns: string[] = [
    // 'broadcastname',
    'title',
    'subtitle',
    'message',
    'landingpage',
    'sticky',
    'logged',
    'schedule',
    'actions'
  ];

  dataSource = new MatTableDataSource<any>([]);
  notifications$!: Observable<any[]>;
  isScheduleMode: boolean = false;
  scheduleEditingDocId: string | null = null;
  expandedRowId: string | null = null;
  scheduleRowDate: Date | null = null;
  scheduleRowTime: string = '';
  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'broadcastname': return item.broadcastname?.toLowerCase() || '';
        case 'title': return item.title?.toLowerCase() || '';
        case 'subtitle': return item.subtitle?.toLowerCase() || '';
        case 'message': return item.message?.toLowerCase() || '';
        case 'landingpage': return item.landingpage?.toLowerCase() || '';
        case 'sticky': return item.sticky ? 1 : 0;
        case 'logged': return item.logged ? 1 : 0;
        default: return item[property];
      }
    };
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  loadNotifications(): void {
    const ref = collection(this.firestore, 'savednotifications');
    const q = query(ref, orderBy('created', 'desc'));

    this.notifications$ = collectionData(q, { idField: 'id' });

    this.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.dataSource.data = data;
      });
  }

  editNotification(row: any): void {
    this.isEditMode = true;
    this.editingDocId = row.id;
    this.broadcastname = row.broadcastname || '';
    this.title = row.title || '';
    this.subtitle = row.subtitle || '';
    this.message = row.message || '';
    this.landingPage = row.landingpage || '';
    this.sticky = row.sticky || false;
    this.logged = row.logged || true;
    this.notificationimage = null;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // this.openSnackBar("Editing notification - make changes and click Save or Send", "OK");
  }

  // cancelEdit(): void {
  //   this.isEditMode = false;
  //   this.editingDocId = null;
  //   this.resetNotificationForm();
  // }
  async deleteTable(row: any) {
    if (!row?.id) {
      console.error('Document ID missing');
      return;
    }

    const confirmed = confirm('Are you sure you want to delete this notification?');

    if (!confirmed) return;

    try {
      console.log('Deleting row:', row);

      const docRef = doc(this.firestore, 'savednotifications', row.id);
      await deleteDoc(docRef);

      console.log('Document deleted successfully');

    } catch (error) {
      console.error('Error deleting document:', error);
    }
  }

  sendFromTable(row: any): void {
    if(confirm("are you sure want to send")){
    const data = {
      broadcastname: row.broadcastname || '',
      title: row.title || '',
      subtitle: row.subtitle || '',
      message: row.message || '',
      landingpage: row.landingpage || '',
      sticky: row.sticky || false,
      logged: row.logged || true,
      notificationimage: row.notificationimage || null,
      scheduled: false,
      scheduletime: null
    };
      this.dialogRef.close(data);
    }
    // this.openSnackBar("Sending Notification...", "OK");
  }
  async updateNotification(): Promise<void> {
    if (!this.editingDocId) return;

    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Updating Notification" },
      disableClose: true
    });

    try {
      const docRef = doc(this.firestore, 'savednotifications', this.editingDocId);
      let notificationimage = undefined;
      if (this.notificationimage != null) {
        const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
        try {
          const storageRef = ref(this.storage, filepath);
          const uploadResult = await uploadBytes(storageRef, this.notificationimage);
          notificationimage = await getDownloadURL(uploadResult.ref);
        } catch (error) {
          console.error('Image upload failed:', error);
        }
      }

      let data: any = {
        broadcastname: this.broadcastname,
        title: [null, undefined, ""].includes(this.title) ? "" : this.title,
        subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
        message: [null, undefined, ""].includes(this.message) ? "" : this.message,
        landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
        sticky: this.sticky,
        logged: this.logged,
        updated: serverTimestamp()
      };

      if (notificationimage !== undefined) {
        data.notificationimage = notificationimage;
      }

      await updateDoc(docRef, data);
      this.openSnackBar("Notification Updated Successfully", "OK");
      this.cancelEdit();
    } catch (error) {
      console.error('Error updating notification:', error);
      this.openSnackBar("Error Updating Notification", "OK");
    } finally {
      dialogref.close();
    }
  }
  // async updateNotification(): Promise<void> {
  //   if (!this.editingDocId) return;

  //   const dialogref = this.dialog.open(LoadingProgressComponent, {
  //     data: {
  //       msg: "Updating Notification"
  //     },
  //     disableClose: true
  //   });

  //   try {
  //     const docRef = doc(this.firestore, 'savednotifications', this.editingDocId);

  //     let data: any = {
  //       broadcastname: this.broadcastname,
  //       title: [null, undefined, ""].includes(this.title) ? "" : this.title,
  //       subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
  //       message: [null, undefined, ""].includes(this.message) ? "" : this.message,
  //       landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
  //       sticky: this.sticky,
  //       updated: serverTimestamp()
  //     };

  //     await updateDoc(docRef, data);

  //     this.openSnackBar("Notification Updated Successfully", "OK");
  //     this.cancelEdit();
  //   } catch (error) {
  //     console.error('Error updating notification:', error);
  //     this.openSnackBar("Error Updating Notification", "OK");
  //   } finally {
  //     dialogref.close();
  //   }
  // }


  constructor(
    public guard: AuthguardService,
    public firestore: Firestore,
    public router: Router,
    public dialogRef: MatDialogRef<any>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formbuilder: FormBuilder,
    public storage: Storage,
    private dialog: MatDialog,
    private snackBar: MatSnackBar) {

    this.templateForm = this.formbuilder.group({
      templateName: ['', { validators: [Validators.required] }],
      templateAlias: ['', { validators: [Validators.required], updateOn: "change" }],
      templateCategory: ['', { validators: [Validators.required], updateOn: "change" }],
      templateSubCategory: ['', { validators: [Validators.required], updateOn: "change" }],
    });

    // this.categoryCollectionRef = doc(this.firestore,"email validators","templateCategories")
    // docData(this.categoryCollectionRef).pipe(takeUntil(this.destroy$)).subscribe((data)=>{
    //   this.templateCategories = data['categories'] ?? []
    //   this.templateSubCategories = data['subcategories'] ?? []
    // });
  }

  ngOnInit(): void {
    if (this.data && Array.isArray(this.data)) {
      this.profiles = this.data
        .filter(selected => selected["profileid"] != null)
        .map(selected => selected["profileid"]);
      console.log("Profiles:", this.profiles);
    }
    this.loadNotifications();
  }

  ngOnDestroy() {
    this.destroy$.next()
    this.destroy$.complete()
  }
  onDateTimeChange(): void {
    if (this.scheduleDate && this.scheduleTime) {
      const mergedDateTime = new Date(this.scheduleDate);
      const [hours, minutes] = this.scheduleTime.split(':').map(Number);
      mergedDateTime.setHours(hours);
      mergedDateTime.setMinutes(minutes);
      mergedDateTime.setSeconds(0);
      mergedDateTime.setMilliseconds(0);
      if (mergedDateTime > new Date()) {
        this.scheduleDateTime = mergedDateTime;
        this.scheduletime = mergedDateTime;
      } else {
        this.scheduleDateTime = null;
        this.scheduletime = null;
        this.openSnackBar("Please select a future date and time", "OK");
      }
    } else {
      this.scheduleDateTime = null;
      this.scheduletime = null;
    }
  }
  async fetchTemplates() {
    const collRef = collection(this.firestore, "notification templates")
    const q = query(collRef, where("templatevalidated", "==", true), where("type", "==", "notification"))
    collectionData(q).pipe(takeUntil(this.destroy$)).subscribe((templates) => {
      if (templates.length != 0) {
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

  sendValidation() {
    let check = false;
    let formValue = this.templateForm.value;
    if (this.view == 'select') {
      check = [null, undefined, ''].includes(this.broadcastname) || [null, undefined].includes(this.selectedTemplate) ? true : false;
    } else {
      check = [null, undefined, ''].includes(formValue['templateAlias'])
        || [null, undefined, ''].includes(formValue['templateName'])
        || [null, undefined, ''].includes(formValue['templateCategory'])
        || [null, undefined, ''].includes(formValue['templateSubCategory'])
        || [null, undefined, ''].includes(this.title)
        || [null, undefined, ''].includes(this.subtitle) ? true : false;
    }
    return check
  }


  onTemplateChange(event: any): void {
    this.selectedTemplate = event.value;
  }

  isTemplatePresent(): boolean {
    return Object.keys(this.selectedTemplate).length != 0;
  }

  importImages(value: FileList): void {
    var localURL = Array.from(value);
    this.notificationimage = localURL[0];
    console.log('Image set:', this.notificationimage); // Add this
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action);
  }

  async sendNotification(formValue) {
    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Sending Notification"
      },
      disableClose: true
    });

    // try {
    if (this.view == 'select') {
      // if(this.selectedTemplate['message'].trim().length != 0){
      //   let data = {
      //     broadcastname: this.broadcastname,
      //     title: this.selectedTemplate['title'],
      //     subtitle: [null, undefined, ""].includes(this.selectedTemplate['subtitle']) ? "" : this.selectedTemplate['subtitle'],
      //     message: this.selectedTemplate['message'],
      //     landingpage: [null, undefined, ""].includes(this.selectedTemplate['landingpage']) ? "" : this.selectedTemplate['landingpage'],
      //     sticky: this.sticky,
      //     notificationimage: [null, undefined, ""].includes(this.selectedTemplate['notificationimage']) ? null : this.selectedTemplate['notificationimage']
      //   }
      //   dialogref.close();
      //   this.openSnackBar("Notification Sent Successfully", "OK");
      //   console.log(data)
      //   this.dialogRef.close(data);
      // }
    } else if (this.view == 'create') {
      if (this.message.trim().length != 0) {
        // let data = {
        //   broadcastname: this.broadcastname,
        //   title: [null, undefined, ""].includes(this.title) ? "" : this.title,
        //   subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
        //   message: [null, undefined, ""].includes(this.message) ? "" : this.message,
        //   landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
        //   sticky: this.sticky,
        //   notificationimage: [null, undefined, ""].includes(this.notificationimage) ? null : this.notificationimage
        // }
        let data = {
          broadcastname: this.broadcastname,
          title: [null, undefined, ""].includes(this.title) ? "" : this.title,
          subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
          message: [null, undefined, ""].includes(this.message) ? "" : this.message,
          landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
          sticky: this.sticky,
          logged: this.logged,
          notificationimage: [null, undefined, ""].includes(this.notificationimage) ? null : this.notificationimage,
          scheduled: false,  // Add this
          scheduletime: null  // Add this
        }
        console.log(data)
        dialogref.close();

        // If in edit mode, update instead of closing dialog
        // if (this.isEditMode) {
        //   await this.updateNotification();
        //   return;
        // }

        this.dialogRef.close(data);
        /*
        var notificationImage = null
        if(this.notificationimage != null){
          const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
          // await this.storage.upload(filepath, this.notificationimage).then(async completed => {
          //   await completed.ref.getDownloadURL().then(url => {
          //     notificationImage = url
          //   }).catch(err => {console.log(err);})
          // }).catch(err => {console.log(err);})
          try {
            const storageRef = ref(this.storage, filepath);
            const uploadResult = await uploadBytes(storageRef, this.notificationimage);
            const notificationImage = await getDownloadURL(uploadResult.ref);
            console.log('Upload completed:', notificationImage);
          } catch (error) {
            console.error('Upload failed:', error);
          }
        }
        
        let docID = doc(this.firestore,"inapp templates").id;
        let templatedata = {
          active: false,
          docid : docID,
          date : serverTimestamp(),
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
        */
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
    // } catch {
    //   dialogref.close();
    //   this.openSnackBar("Error Sending Notification", "OK");
    // }
  }
  resetNotificationForm(): void {
    this.broadcastname = '';
    this.title = '';
    this.subtitle = '';
    this.message = '';
    this.landingPage = '';
    this.sticky = false;
    this.logged = true;
    this.notificationimage = null;
    this.isEditMode = false;
    this.editingDocId = null;
  }
  async saveNotification(formValue) {
    if (this.isEditMode) {
      await this.updateNotification();
      return;
    }

    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Saving Notification" },
      disableClose: true
    });

    try {
      if (this.view == 'create') {
        if (this.message.trim().length != 0) {
          let notificationimage = null;
          if (this.notificationimage != null) {
            console.log('Uploading image:', this.notificationimage);
            const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
            try {
              const storageRef = ref(this.storage, filepath);
              const uploadResult = await uploadBytes(storageRef, this.notificationimage);
              notificationimage = await getDownloadURL(uploadResult.ref);
              console.log('Upload completed:', notificationimage);
            } catch (error) {
              console.error('Upload failed:', error);
            }
          }

          let data = {
            broadcastname: this.broadcastname,
            title: [null, undefined, ""].includes(this.title) ? "" : this.title,
            subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
            message: [null, undefined, ""].includes(this.message) ? "" : this.message,
            landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
            sticky: this.sticky,
            logged: this.logged,
            notificationimage: notificationimage,
            created: serverTimestamp()
          };

          await addDoc(collection(this.firestore, 'savednotifications'), data);
          console.log(data);
          this.resetNotificationForm();
        }
      }
    } catch (error) {
      console.error('Error saving notification:', error);
    } finally {
      dialogref.close();
    }
  }
  // async saveNotification(formValue) {
  //   // If in edit mode, update instead of creating new
  //   if (this.isEditMode) {
  //     await this.updateNotification();
  //     return;
  //   }

  //   const dialogref = this.dialog.open(LoadingProgressComponent, {
  //     data: {
  //       msg: "Saving Notification"
  //     },
  //     disableClose: true
  //   });
  //   try {
  //     if (this.view == 'select') {
  //     } else if (this.view == 'create') {
  //       if (this.message.trim().length != 0) {
  //         let data = {
  //           broadcastname: this.broadcastname,
  //           title: [null, undefined, ""].includes(this.title) ? "" : this.title,
  //           subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
  //           message: [null, undefined, ""].includes(this.message) ? "" : this.message,
  //           landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
  //           sticky: this.sticky,
  //           // notificationimage: [null, undefined, ""].includes(this.notificationimage) ? null : this.notificationimage,
  //           created: serverTimestamp()
  //         }
  //         const ref = await addDoc(
  //           collection(this.firestore, 'savednotifications'),
  //           data
  //         );
  //         console.log(data)
  //         this.resetNotificationForm();
  //         // dialogref.close();
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Error saving notification:', error);
  //   } finally {
  //     dialogref.close();
  //   }
  // }
  async scheduleNotification(formValue) {
    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Scheduling Notification"
      },
      disableClose: true
    });

    try {
      if (this.message.trim().length != 0 && this.scheduleDateTime) {
        // Validate that the scheduled time is in the future
        if (this.scheduleDateTime <= new Date()) {
          dialogref.close();
          this.openSnackBar("Please select a future date and time", "OK");
          return;
        }

        // Validate that both date and time are selected
        if (!this.scheduleDate || !this.scheduleTime) {
          dialogref.close();
          this.openSnackBar("Please select both date and time", "OK");
          return;
        }

        let notificationimage = null;
        if (this.notificationimage != null) {
          const filepath = "Notification Images/" + new Date().toISOString() + this.notificationimage.name;
          try {
            const storageRef = ref(this.storage, filepath);
            const uploadResult = await uploadBytes(storageRef, this.notificationimage);
            notificationimage = await getDownloadURL(uploadResult.ref);
            console.log('Upload completed:', notificationimage);
          } catch (error) {
            console.error('Upload failed:', error);
          }
        }

        let data = {
          broadcastname: this.broadcastname,
          title: [null, undefined, ""].includes(this.title) ? "" : this.title,
          subtitle: [null, undefined, ""].includes(this.subtitle) ? "" : this.subtitle,
          message: [null, undefined, ""].includes(this.message) ? "" : this.message,
          landingpage: [null, undefined, ""].includes(this.landingPage) ? "" : this.landingPage,
          sticky: this.sticky,
          logged: this.logged,
          notificationimage: notificationimage,
          scheduled: this.scheduled,
          scheduletime: this.scheduletime
        };

        console.log(data);
        dialogref.close();
        this.openSnackBar("Notification Scheduled Successfully for " + this.scheduleDateTime.toLocaleString(), "OK");
        this.dialogRef.close(data);
      } else {
        dialogref.close();
        this.openSnackBar("Please fill all required fields", "OK");
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
      dialogref.close();
      this.openSnackBar("Error Scheduling Notification", "OK");
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

  selectAll(value) {
    if (value) {
      this.selectedProfiles = this.profileList
      this.eventLists.forEach(event => event.checked = false)
    }
    else {
      this.selectedProfiles = []
    }
  }

  onEventSelect(index, value) {
    var eventpath = this.eventLists[index].eventpath
    if (value) {
      this.eventParticipants.filter(e => e.eventpath == eventpath).forEach(profile => {
        if (!this.selectedProfiles.includes(profile.profilepath)) this.selectedProfiles.push(profile.profilepath)
      })
    }
    else {
      this.eventParticipants.filter(e => e.eventpath == eventpath).forEach(profile => {
        if (this.selectedProfiles.includes(profile.profilepath)) {
          var valueIndex = this.selectedProfiles.findIndex(e => e == profile.profilepath)
          this.selectedProfiles.splice(valueIndex, 1)
        }
      })
    }
    this.selectedProfiles = this.selectedProfiles.concat([])
  }

  returnNameList(): string {
    var name = []
    this.selectedProfiles.forEach(path => name.push(this.mapProfiles[path]))
    return name.join(', ')
  }

  addCategory() {
    setDoc(this.categoryCollectionRef, {
      categories: arrayUnion(this.searchCategory)
    }, { merge: true }).then(() => {
      console.log("Category Added Successfully");
      this.templateForm.controls['templateCategory'].setValue(this.searchCategory);
      this.searchCategory = "";
    }).catch((error) => {
      console.log("Oops Error While Adding Category", error);
    });
  }


  addSubCategory() {
    setDoc(this.categoryCollectionRef, {
      subcategories: arrayUnion(this.searchSubCategory)
    }, { merge: true }).then(() => {
      console.log("Category Added Successfully");
      this.templateForm.controls['templateSubCategory'].setValue(this.searchSubCategory);
      this.searchSubCategory = "";
    }).catch((error) => {
      console.log("Oops Error While Adding Category", error);
    });
  }

  onSearchCategory() {
    let returnData = this.templateCategories;
    if (![null, undefined, ""].includes(this.searchCategory)) {
      return returnData.filter((e) => e.includes(this.searchCategory));
    } else {
      return this.templateCategories;
    }
  }

  onSearchSubCategory() {
    let returnData = this.templateSubCategories;
    if (![null, undefined, ""].includes(this.searchSubCategory)) {
      return returnData.filter((e) => e.includes(this.searchSubCategory));
    } else {
      return this.templateSubCategories;
    }
  }
  scheduleFromTable(row: any): void {
    this.isScheduleMode = true;
    this.isEditMode = false;
    this.scheduleEditingDocId = row.id;
    this.editingDocId = row.id;
    this.title = row.title || '';
    this.subtitle = row.subtitle || '';
    this.message = row.message || '';
    this.landingPage = row.landingpage || '';
    this.sticky = row.sticky || false;
    this.logged = row.logged || true;
    this.broadcastname = row.broadcastname || '';
    this.scheduleRowDate = null;
    this.scheduleRowTime = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  cancelEdit(): void {
    this.isEditMode = false;
    this.isScheduleMode = false;
    this.editingDocId = null;
    this.scheduleEditingDocId = null;
    this.scheduleRowDate = null;
    this.scheduleRowTime = '';
    this.resetNotificationForm();
  }
  async saveRowScheduleFromForm(): Promise<void> {
    if (!this.scheduleRowDate || !this.scheduleRowTime || !this.scheduleEditingDocId) {
      this.openSnackBar("Please select both date and time", "OK");
      return;
    }
    const mergedDateTime = new Date(this.scheduleRowDate);
    const [hours, minutes] = this.scheduleRowTime.split(':').map(Number);
    mergedDateTime.setHours(hours);
    mergedDateTime.setMinutes(minutes);
    mergedDateTime.setSeconds(0);
    mergedDateTime.setMilliseconds(0);

    if (mergedDateTime <= new Date()) {
      this.openSnackBar("Please select a future date and time", "OK");
      return;
    }

    try {
      const docRef = doc(this.firestore, 'savednotifications', this.scheduleEditingDocId);
      await updateDoc(docRef, {
        scheduledat: mergedDateTime,
        schedule: true,
        sent: false,
        profiles: this.profiles,
      });
      this.openSnackBar("Notification scheduled for " + mergedDateTime.toLocaleString(), "OK");
      this.cancelEdit();
    } catch (error) {
      console.error('Error scheduling:', error);
      this.openSnackBar("Error scheduling notification", "OK");
    }
  }


async toggleScheduleStatus(row: any): Promise<void> {
  try {
    const docRef = doc(this.firestore, 'savednotifications', row.id);
    await updateDoc(docRef, { schedule: false });
    this.openSnackBar("Schedule cancelled", "OK");
  } catch (error) {
    console.error('Error toggling schedule:', error);
  }
}
  /*
  sendUpdates(){
    if(this.selectedProfiles.length != 0 && this.message.trim().length != 0){
      var userRef = []
      this.selectedProfiles.forEach(path =>{
        this.appUserList.filter(e => e.profilepath == path).forEach(user =>{
          userRef.push(this.firestore.doc(user.userpath).ref)
        })
      })
      this.firestore.collection("A&H updates").add({
        date: firebase.default.firestore.FieldValue.serverTimestamp(),
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
  */
}