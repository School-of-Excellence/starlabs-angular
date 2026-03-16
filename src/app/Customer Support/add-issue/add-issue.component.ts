import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, arrayUnion, doc, Firestore, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { AddNotesComponent } from '../add-notes/add-notes.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-add-issue',
  imports: [
    MatProgressBarModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatMenuModule,
  ],
  templateUrl: './add-issue.component.html',
  styleUrl: './add-issue.component.css'
})
export class AddIssueComponent {
  @ViewChild('myTextarea') myTextarea: ElementRef;
  @ViewChild('fileInput') fileInput: ElementRef;

  filteredClient = ""
  filteredEmail = ""
  filteredPhone = ""
  filteredMember = ""
  addissue!: FormGroup;
  statuslist: any;
  serviceOption = [
    { label: "Service Type", value: "service" },
    { label: "Non Service Type", value: "nonservice" }
  ]

  // status = [
  //   {value: 'open', viewValue: 'open'},
  //   {value: 'Action yet to be taken', viewValue: 'Action yet to be taken'},
  //   {value: 'closed', viewValue: 'closed'}
  // ];

  issueImageFiles = []
  issueImagePath = []
  clients = [];
  reportedBy = [];
  categories = [];
  subcategories = [];
  chatadminUsers = [];
  selectedClientEmail: string;
  selectedClientPhone: string;
  newNote: '';
  reported: any
  reportedDate: any;
  imageUrl: any
  File!: File;
  images!: File
  imageFiles: any;
  isFullWidth: any;
  isFullScreen: any[];
  mapProfile = {}
  mapProduct = {}
  mapJourneyData = {}
  record: unknown;
  reportedUser: any;


  notes: any;
  selectedClient: any;
  reportedPerson: any;
  editedPerson: any;
  note: any[];
  closedDays: any;
  activeDays: any;
  reportDate: Date;
  issueReportedBy: any;
  emails: any;
  clientMobile: any;
  isScreen: boolean;
  issue: any;
  clientIds: any;
  journeys = [];
  convertedleads: any[];
  checkIssue: boolean;
  journeyList: any[];
  productsList: any[];
  ownerlist: any[];
  userData: {};
  mapPerson: {};
  issuereported: any;
  writtenby
  selectedFiles = [];
  profileList = [];
  profile_name = "";
  profile_id = "";
  profile_email = "";
  filetype = "";
  linkPattern = /(http(s)?:\/\/[^\s]+)/g;
  configData = {};
  loading: boolean = true;
  expectedNumber;


  constructor(
    public dialogRef: MatDialogRef<AddIssueComponent>,
    @Inject(MAT_DIALOG_DATA) public dailogData: any,
    public formbuilder: FormBuilder,
    public dialog: MatDialog,
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    public pipe: DatePipe,
    public storage: Storage,
    private authservice: AuthguardService
  ) {
    this.addissue = this.formbuilder.group({
      issueno: ["",],
      reporteddate: [, { validators: [Validators.required], updateOn: "change" }],
      clientid: [, { validators: [Validators.required], updateOn: "change" }],
      email: [, { validators: [], updateOn: "change" }],
      mobile: [, { validators: [], updateOn: "change" }],
      journey: [, { validators: [], updateOn: "change" }],
      product: [,],
      reportedBy: ['', { validators: [Validators.required], updateOn: "change" }],
      issueReportedBy: ['', { validators: [Validators.required], updateOn: "change" }],
      assign: [[], { validators: [Validators.required], updateOn: "change" }],
      category: ['', { validators: [Validators.required], updateOn: "change" }],
      subcategory: ['',],
      status: ['', { updateOn: "change" }],
      issue: [, { validators: [Validators.required], updateOn: "change" }],
      notes: ["", { validators: [], updateOn: "change" }],
      issueimages: [[]],
      files: [[],],
    })
    const profiledataRef = collection(this.firestore, 'profile_data')
    getDocs(profiledataRef).then(async (data) => {
      const profileData = data.docs;
      for (let i = 0; i < profileData.length; i++) {
        const element = profileData[i].data();
        this.mapProfile[element['profileid']] = element['name'];
        this.profileList.push(element)
      }
    });

    const usersrolesRef = collection(this.firestore, 'users_roles')
    const userRolequery = query(usersrolesRef, where("chatxadmin", "==", true))
    getDocs(userRolequery).then((users) => {
      for (let i = 0; i < users.docs.length; i++) {
        const element = users.docs[i];
        const profiledataDoc = doc(this.firestore, 'profile_data', element.data()['profile_ref'].id)
        getDoc(profiledataDoc).then((profile) => {
          this.chatadminUsers.push(profile.data())
        })
      }
    });
    const chatconfigDoc = doc(this.firestore, 'chat config', '0jqtiq3sxtbLVcEGMDhW')
    getDoc(chatconfigDoc).then((config) => {
      this.configData = config.data();
    });

    this.categories = dailogData['categories']
    this.profile_id = this.authservice.uid;
    this.authservice.getUser().then((user) => {
      this.profile_email = user.email;
    });

    this.addissue.patchValue({
      reporteddate: pipe.transform(dailogData.metadata["reporteddate"] != null ? dailogData.metadata["reporteddate"].toDate() : new Date(), "yyyy-MM-dd"),
      // issueno: dailogData.metadata.issueno,
      clientid: dailogData.metadata["clientid"] == null ? dailogData.metadata['clientissue'] : dailogData.metadata["clientid"],
      email: dailogData.metadata["email"] == null ? dailogData.metadata['clientissue'] : dailogData.metadata["email"],
      mobile: dailogData.metadata["mobile"] == null ? dailogData.metadata['clientissue'] : dailogData.metadata["mobile"],
      journey: dailogData.metadata["journey"] != null ? dailogData.metadata["journey"].id : null,
      reportedBy: [null, undefined, ''].includes(dailogData.metadata["reportedBy"]) ? '' : dailogData.metadata["reportedBy"],
      issueReportedBy: [null, undefined, ''].includes(dailogData.metadata["issueReportedBy"]) ? '' : dailogData.metadata["issueReportedBy"],
      assign: dailogData.metadata["assign"] ?? [],
      status: dailogData.metadata["status"] ? dailogData.metadata["status"]["status"] : 'Open',
      issue: dailogData.metadata["issue"],
      category: dailogData.metadata["category"],
      subcategory: dailogData.metadata["subcategory"]
    });

    // console.log(dailogData.metadata["assign"]);


    if (dailogData.metadata["category"]?.length != 0) {
      this.getSubCategory(dailogData.metadata["category"])
    }

    if (dailogData['type'] == 'edit') {
      this.addissue.get('reporteddate').disable()
    }

    if (dailogData.metadata["status"] && dailogData.metadata["status"]["status"] === 'closed') {
      const closedDate = dailogData.metadata['status']['date'].toDate()
      // console.log(closedDate)
      const reportedDate = dailogData.metadata["reporteddate"].toDate()
      // console.log(reportedDate)
      const daysDiff = Math.floor((closedDate - reportedDate) / (1000 * 3600 * 24))
      this.closedDays = daysDiff.toString();
      // console.log(this.closedDays)
    } else if (dailogData.metadata["status"]) {
      const currentDate = new Date();
      const reportedDate = dailogData.metadata["reporteddate"].toDate()
      const daysDiff = Math.floor((currentDate.getTime() - reportedDate) / (1000 * 3600 * 24));
      this.activeDays = daysDiff.toString();
      // console.log(this.activeDays)
    }
    // this.addissue.get('issueno')?.disable();

    if (dailogData && dailogData.metadata && dailogData.metadata.status && dailogData.metadata.status.editedBy) {
      this.editedPerson = this.mapProfile[dailogData.metadata['status']['editedBy']];
    }

    this.reportedDate = this.pipe.transform(dailogData.metadata["reporteddate"] != null ? dailogData.metadata["reporteddate"].toDate() : new Date(), 'MMM d, y, h:mm:ss a')

    // this.firestore.collection('journey').valueChanges().subscribe(res => {
    //   this.journeyList = res
    // });

    setTimeout(() => {
      this.loading = false;
    }, 1000);

  }

  adjustTextareaHeight() {
    if (this.myTextarea) {
      const textarea = this.myTextarea.nativeElement;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
      console.log(this.myTextarea)
    }
  }

  async ngOnInit() {
    const counterRef = doc(this.firestore, 'counters/ticketCounter');
    // const counterRef = this.firestore.doc('counters/ticketCounter').ref;
    // Run the increment in a transaction
    this.expectedNumber = await runTransaction(this.firestore, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);

      let nextNumber;
      if (!counterDoc.exists()) {
        nextNumber = 1001;
      } else {
        const data = counterDoc.data();
        nextNumber = data['currentNumber'] + 1;
      }

      return nextNumber;
    });
  }

  getStatusColor(status: string): string {
    if (status['status'].toLowerCase() === "open") {
      return 'row-open';
    } else if (status['status'].toLowerCase() === "closed") {
      return 'row-closed';
    }
    return '';
  }

  openSnackBar(message: string, action: string) {
    this.snackBar.open(message, action, { duration: 2000 })
  }

  returnFilterClient() {
    return this.profileList.filter(e => e.name != null && e.name.toLowerCase().includes(this.filteredClient.toLowerCase())).sort((a, b) => a.name?.toLowerCase().localeCompare(b.name?.toLowerCase()))
  }

  returnFilterEmail() {
    return this.profileList.filter(e => e.email && e.email.toLowerCase().includes(this.filteredEmail.toLowerCase()))
  }

  returnFilterPhone() {
    return this.profileList.filter(e => typeof e.number === 'string' && e.number.includes(this.filteredPhone));
  }

  returnFilterMember() {
    return this.chatadminUsers.filter(e => e.name?.toLowerCase().includes(this.filteredMember.toLowerCase())).sort((a, b) => a.name?.toLowerCase().localeCompare(b.name?.toLowerCase()))
  }

  importImage(event: any): void {
    const files = Array.from(event.target.files);
    this.issueImageFiles = files;
    this.issueImagePath = [];
    this.isFullScreen = [];

    for (let i = 0; i < this.issueImageFiles.length; i++) {
      const file = this.issueImageFiles[i];
      const reader = new FileReader();
      reader.onload = () => {
        const imageUrl = reader.result as string;
        this.issueImagePath.push(imageUrl);
        this.isFullScreen.push(false);
      };
      reader.readAsDataURL(file);
    }
  }

  toggleFullScreen(index: number): void {
    this.isFullScreen[index] = !this.isFullScreen[index];
  }

  removeImage(index: number): void {
    this.issueImageFiles.splice(index, 1);
    this.issueImagePath.splice(index, 1);
    this.isFullScreen.splice(index, 1);
  }

  toggleScreen() {
    this.isScreen = !this.isScreen;
  }

  openImage(url) {
    window.open(url, '_blank')
  }

  // async onsubmit(value: any) {
  //   const dialogref = this.dialog.open(LoadingProgressComponent, {
  //     data: {
  //       msg: this.dailogData.type == 'new' ? 'Creating Ticket' : 'Editing Ticket'
  //     },
  //     disableClose: true
  //   });

  //   try {
  //     const selectedClientId = value.clientid;
  //     const clientName = this.mapProfile[selectedClientId];
  //     const notes = {
  //       remarks: this.newNote || "",
  //       date: new Date(),
  //       writtenBy: value.reportedBy
  //     };
  //     const status = {
  //       status: value.status,
  //       date: new Date(),
  //       editedBy: value.reportedBy
  //     };

  //     const files = this.selectedFiles;

  //     this.reportDate = new Date(this.addissue.get('reporteddate').value);
  //     const currentTime = new Date();
  //     this.reportDate.setHours(currentTime.getHours());
  //     this.reportDate.setMinutes(currentTime.getMinutes());
  //     this.reportDate.setSeconds(currentTime.getSeconds());
  //     this.reportDate.setMilliseconds(currentTime.getMilliseconds());
  //     this.reportDate = (this.dailogData.metadata['reporteddate'] == null ? this.reportDate : this.dailogData.metadata['reporteddate']);
  //     this.issueReportedBy = this.dailogData.metadata['issueReportedBy'] == null ? this.issueReportedBy : this.dailogData.metadata['issueReportedBy'];
  //     const id = this.dailogData.metadata["id"] == null ? doc(collection(this.firestore, 'clientissue')).id : this.dailogData.metadata["id"];

  //     // Create a document reference for the counter
  //     const counterRef = doc(this.firestore, 'counters/ticketCounter');

  //     // Run the increment in a transaction
  //     const issueNumber = await runTransaction(this.firestore, async (transaction) => {
  //       const counterDoc = await transaction.get(counterRef);

  //       let nextNumber;
  //       if (!counterDoc.exists()) {
  //         // Initialize counter if it doesn't exist
  //         nextNumber = 1001;
  //         transaction.set(counterRef, { 'currentNumber': nextNumber });
  //       } else {
  //         // Increment existing counter
  //         const data = counterDoc.data();
  //         nextNumber = data['currentNumber'] + 1;
  //         transaction.update(counterRef, { 'currentNumber': nextNumber });
  //       }
  //       return nextNumber;
  //     });

  //     const record = {
  //       id: id,
  //       clientid: value.clientid,
  //       chatstatus: "New",
  //       priority: "",
  //       name: clientName,
  //       reporteddate: this.reportDate,
  //       journey: doc(this.firestore, 'journey', value.journey),
  //       reportedBy: value.reportedBy,
  //       assign: value.assign,
  //       issue: value.issue,
  //       category: value.category,
  //       subcategory: value.subcategory ?? null,
  //       status: status,
  //       last_modification: new Date(),
  //       issueReportedBy: value.issueReportedBy,
  //       email: value.email,
  //       mobile: value.mobile,
  //       mandatereview: {},
  //       review: {},
  //       issueno: issueNumber
  //     };

  //     if (this.dailogData.metadata["id"] == null) {
  //       record["notes"] = notes.remarks.length != 0 ? arrayUnion(notes) : [];
  //     } else if (notes.remarks.length != 0) {
  //       record["notes"] = arrayUnion(notes);
  //     }

  //     // Create the ticket document
  //     await setDoc(doc(this.firestore, '/clientissue/' + id), record, { merge: true })
  //     this.openSnackBar("Issue Added Successfully", "");

  //     // Handle chat messages
  //     const extractedLinks = (value.issue.match(this.linkPattern) || []).map(link => link.trim());
  //     if (this.dailogData['type'] == 'new') {
  //       const firstmessageId = doc(collection(this.firestore, 'clientissue')).id;
  //       const firstMsgRef = doc(this.firestore, 'clientissue', id, 'messages', firstmessageId)

  //       const firstMessage = {
  //         "time": new Date(),
  //         "message": value.issue,
  //         "messageid": firstMsgRef.id,
  //         "issueno": issueNumber,
  //         "sender_profileid": value.clientid,
  //         "sender_email": this.profile_email,
  //         "sender_uid": null,
  //         "pending": ["user"],
  //         "read_by": ["admin"],
  //         "links": extractedLinks,
  //         "files": [],
  //         "ticketid": id,
  //         "type": "chat"
  //       };

  //       const batch = writeBatch(this.firestore)
  //       batch.set(firstMsgRef, firstMessage);
  //       await batch.commit();
  //       console.log('First Message sent successfully');
  //       await this.uploadFiles('', firstMsgRef);
  //     }

  //     if (files.length != 0) {
  //       await this.uploadFiles(doc(this.firestore, 'clientissue', id), '');
  //     }

  //     dialogref.close();
  //     this.dialogRef.close();

  //   } catch (error) {
  //     this.openSnackBar("Error processing ticket:", "ok");
  //     console.error("Error processing ticket:", error);
  //     dialogref.close();
  //   }
  // }

  async onsubmit(value: any) {
    const dialogref = this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: this.dailogData.type == 'new' ? 'Creating Ticket' : 'Editing Ticket'
      },
      disableClose: true
    });

    try {
      const selectedClientId = value.clientid;
      const clientName = this.mapProfile[selectedClientId];
      const notes = {
        remarks: this.newNote || "",
        date: new Date(),
        writtenBy: value.reportedBy
      };
      const status = {
        status: value.status,
        date: new Date(),
        editedBy: value.reportedBy
      };

      this.reportDate = new Date(this.addissue.get('reporteddate').value);
      const currentTime = new Date();
      this.reportDate.setHours(currentTime.getHours());
      this.reportDate.setMinutes(currentTime.getMinutes());
      this.reportDate.setSeconds(currentTime.getSeconds());
      this.reportDate.setMilliseconds(currentTime.getMilliseconds());
      this.reportDate = (this.dailogData.metadata['reporteddate'] == null ? this.reportDate : this.dailogData.metadata['reporteddate']);
      this.issueReportedBy = this.dailogData.metadata['issueReportedBy'] == null ? this.issueReportedBy : this.dailogData.metadata['issueReportedBy'];
      const id = this.dailogData.metadata["id"] == null ? doc(collection(this.firestore, 'clientissue')).id : this.dailogData.metadata["id"];

      // Create a document reference for the counter
      const counterRef = doc(this.firestore, 'counters/ticketCounter');

      // Run the increment in a transaction
      const issueNumber = await runTransaction(this.firestore, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);

        let nextNumber;
        if (!counterDoc.exists()) {
          nextNumber = 1001;
          transaction.set(counterRef, { 'currentNumber': nextNumber });
        } else {
          const data = counterDoc.data();
          nextNumber = data['currentNumber'] + 1;
          transaction.update(counterRef, { 'currentNumber': nextNumber });
        }
        return nextNumber;
      });

      // ============================================
      // STEP 1: UPLOAD FILES FIRST
      // ============================================
      let uploadedFiles: any[] = [];
      if (this.selectedFiles.length > 0) {
        console.log('Uploading files before creating ticket...');
        uploadedFiles = await this.uploadFilesAndGetUrls();
        console.log('Files uploaded:', uploadedFiles.length);
      }

      // ============================================
      // STEP 2: PREPARE TICKET RECORD
      // ============================================
      const record: any = {
        id: id,
        clientid: value.clientid,
        chatstatus: "New",
        priority: "",
        name: clientName,
        reporteddate: this.reportDate,
        journey: doc(this.firestore, 'journey', value.journey),
        reportedBy: value.reportedBy,
        assign: value.assign,
        issue: value.issue,
        category: value.category,
        subcategory: value.subcategory ?? null,
        status: status,
        last_modification: new Date(),
        issueReportedBy: value.issueReportedBy,
        email: value.email,
        mobile: value.mobile,
        mandatereview: {},
        review: {},
        issueno: issueNumber,
        files: uploadedFiles
      };

      if (this.dailogData.metadata["id"] == null) {
        record["notes"] = notes.remarks.length != 0 ? arrayUnion(notes) : [];
      } else if (notes.remarks.length != 0) {
        record["notes"] = arrayUnion(notes);
      }

      // ============================================
      // STEP 3: CREATE BATCH AND ADD ALL WRITES
      // ============================================
      const batch = writeBatch(this.firestore);

      // Add ticket document to batch
      const ticketRef = doc(this.firestore, 'clientissue', id);
      batch.set(ticketRef, record, { merge: true });

      // Add first message to batch (only for new tickets)
      if (this.dailogData['type'] == 'new') {
        const extractedLinks = (value.issue.match(this.linkPattern) || []).map(link => link.trim());

        const firstMessageId = doc(collection(this.firestore, 'clientissue')).id;
        const firstMsgRef = doc(this.firestore, 'clientissue', id, 'messages', firstMessageId);

        // Determine message type based on uploaded files
        let messageType = 'chat';
        if (uploadedFiles.length > 0) {
          messageType = uploadedFiles[0]['mediatype'] || 'file';
        }

        const firstMessage = {
          time: new Date(),
          message: value.issue,
          messageid: firstMessageId,
          issueno: issueNumber,
          sender_profileid: value.clientid,
          sender_email: this.profile_email,
          sender_uid: null,
          pending: ["user"],
          read_by: ["admin"],
          links: extractedLinks,
          files: uploadedFiles,
          ticketid: id,
          type: messageType
        };

        // batch.set(firstMsgRef, firstMessage);
        console.log('First message added to batch');
      }

      // ============================================
      // STEP 4: COMMIT BATCH (SINGLE ATOMIC WRITE)
      // ============================================
      await batch.commit();
      console.log('Batch committed successfully - Ticket and First Message created');

      this.openSnackBar("Issue Added Successfully", "");
      dialogref.close();
      this.dialogRef.close();

    } catch (error) {
      this.openSnackBar("Error processing ticket:", "ok");
      console.error("Error processing ticket:", error);
      dialogref.close();
    }
  }

  async uploadFilesAndGetUrls(): Promise<any[]> {
    const uploadedFiles: any[] = [];

    if (this.selectedFiles.length === 0) {
      console.log("No files to upload");
      return uploadedFiles;
    }

    console.log('Uploading', this.selectedFiles.length, 'files...');

    for (let a = 0; a < this.selectedFiles.length; a++) {
      const imageFile = this.selectedFiles[a];
      const filePath = `Chat/${imageFile.name}_${imageFile.lastModified}_${imageFile.size}`;
      const fileRef = ref(this.storage, filePath);

      try {
        const uploadResult = await uploadBytes(fileRef, imageFile);
        const imageURL = await getDownloadURL(uploadResult.ref);

        const map: any = {
          filename: imageFile.name,
          filetype: imageFile.type,
          fileurl: imageURL,
          mediatype: imageFile.type.split('/')[0],
        };

        uploadedFiles.push(map);
        console.log('File uploaded:', map.filename);
      } catch (error) {
        console.error('Error uploading file:', imageFile.name, error);
      }
    }

    return uploadedFiles;
  }

  async createNotfication(receiverId, issueData) {
    // const docId = doc(collection(this.firestore,'logs')).id
    const docId = doc(collection(this.firestore, 'notifications', receiverId, 'logs')).id
    issueData['date'] = new Date()
    issueData['message'] = 'New Issue is created',
      issueData['read'] = false
    issueData['type'] = "inappmessage"
    await setDoc(doc(this.firestore, 'notifications', receiverId, 'logs', docId), issueData).then(() => {
      console.log('Notofication Log has been created');
    }).catch((error) => {
      console.log('Error Creating Notification Log', error);
    })
  }

  openNotes() {
    let dialogref = this.dialog.open(AddNotesComponent)
    dialogref.afterClosed().subscribe((result) => {
      if (result != null || undefined) {
        this.newNote = result;
      }
    })
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  async checkIssues(clientid: any) {
    await getDocs(collection(this.firestore, 'clientissue')).then(res => {
      let clientids = [];
      res.forEach(doc => {
        const client = doc.data()['clientid']
        clientids.push(client)
      })
      if (clientids.includes(clientid)) {
        console.log(clientids.includes(clientid))
        this.checkIssue = true;
      } else {
        this.checkIssue = false;
      }
    });
  }

  async getSubCategory(event) {
    if (this.dailogData['type'] == 'edit') {
      this.addissue.patchValue({
        assign: this.dailogData.metadata['assign']
      })
    } else {
      let data = this.categories.filter((e) => e.category == event);
      this.addissue.patchValue({
        assign: data.map((e) => e.assignto)[0]
      })
      this.subcategories = data.map((g) => g.subcategories);
    }

  }

  async fetchProfileData(event) {

    const data = this.profileList.filter((e) => e.profileid == event);
    let journeyId = '';
    await getDocs(query(collection(this.firestore, 'participantjourneyproduct'), where("profileid", "==", event), where("journeystatus", "in", ["ongoing", "initiated", "completed"]))).then((journey) => {
      if (journey.docs.length > 0 && journey.docs[0].exists()) {
        journeyId = journey.docs[0].data()['journeyref'].id
      }
    });

    this.addissue.patchValue({
      mobile: data[0]['number'],
      email: data[0]['email'],
      journey: journeyId != '' ? journeyId : ''
    });
  }

  chooseType(type) {

    if (type == 'image') {
      this.filetype = 'image/*';
    } else if (type == 'video') {
      this.filetype = 'video/*';
    } else if (type == 'audio') {
      this.filetype = 'audio/*';
    } else if (type == 'files') {
      this.filetype = 'application/*';
    }

    setTimeout(() => {
      this.fileInput.nativeElement.click();
    }, 50);
  }

  onClick(event) {
    event.target.value = '';
  }


  selectFiles(value: Event): void {
    const target = value.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    var localURL = Array.from(files);
    this.selectedFiles.push(...localURL)
    var localfile = [];

    for (let i = 0; i < localURL.length; i++) {
      const element = localURL[i];
      const reader = new FileReader();
      reader.readAsDataURL(element);
      reader.onload = (event => {
        console.log(element);

        var map = {};
        map['filename'] = element.name
        map['type'] = element.type
        map['url'] = event.target.result,
          map['lastModified'] = element.lastModified,
          map['size'] = element.size
        localfile.push(map);
      });
    }
    this.addissue.patchValue({
      files: this.selectedFiles
    });
    // console.log(this.selectedFiles);

  }

  removeFile(index) {
    this.selectedFiles.splice(index, 1)
    var file = Object.assign([], this.addissue.get("files").value)
    file.splice(index, 1)
    this.addissue.patchValue({
      files: file
    });
  }

  async uploadFiles(chatCollection, chatSubCollection) {
    console.log("files");

    var uploadedFiles = [];
    if (this.selectedFiles.length != 0) {
      console.log('file uploading...');
      for (let a = 0; a < this.selectedFiles.length; a++) {
        const imageFile = this.selectedFiles[a];
        const filePath = `Chat/${imageFile.name}_${imageFile.lastModified}_${imageFile.size}`;
        const fileRef = ref(this.storage, filePath);

        try {
          const uploadResult = await uploadBytes(fileRef, imageFile);
          const imageURL = await getDownloadURL(uploadResult.ref);

          const map: any = {
            filename: imageFile.name,
            filetype: imageFile.type,
            fileurl: imageURL,
            mediatype: imageFile.type.split('/')[0],
          };

          uploadedFiles.push(map);
          console.log('File uploaded:', map.filename);
        } catch (error) {
          console.error('Error uploading file:', imageFile.name, error);
        }
      }

      if (chatSubCollection != '') {
        await updateDoc(chatSubCollection, {
          "files": uploadedFiles ?? [],
          "type": uploadedFiles.length == 0 ? 'text' : uploadedFiles[0]['filetype'],
        }).then(() => {
          console.log("file uploaded and updated successfully");
        }).catch((error) => {
          console.log('Oops error while uploading files', error);
        });
      }

      if (chatCollection != '') {
        updateDoc(chatCollection, {
          "last_modification": new Date(),
          "files": uploadedFiles
        }).then(() => {
          console.log("file uploaded and updated successfully in main collection");
        }).catch((error) => {
          console.log('Oops error while uploading files in main collection', error);
        });
      }

    } else {
      console.log("No files to upload");
    }
  }

}
