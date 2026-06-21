import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-insert-message-dialog',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatMenuModule,
    MatButtonModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    FormsModule,
    NgxMatSelectSearchModule,
    ProfilePictureComponent,
  ],
  templateUrl: './insert-message-dialog.component.html',
  styleUrl: './insert-message-dialog.component.css'
})
export class InsertMessageDialogComponent {

  @ViewChild('fileInput') fileInput: ElementRef;
  [x: string]: any;
  filetype: string;
  // Array declarations
  profileList = [];
  selectedFiles = [];
  files = [];

  // string declarations 
  filteredClient = "";
  selectedClient = "";
  message = "";
  time;
  date;

  constructor(public dialogRef: MatDialogRef<InsertMessageDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private firestore: Firestore,
    private storage: Storage,
    private dialog: MatDialog
  ) {
    const profiledataref = collection(this.firestore,'profile_data')
    getDocs(profiledataref).then(async (data) => {
      const profileData = data.docs;
      for (let i = 0; i < profileData.length; i++) {
        const element = profileData[i].data();
        this.profileList.push(element);
      }
    });
  }

  ngOnInit(): void {
  }

  // function to insert message for the time selecetd 
  async insertMessage() {

    if(![null, undefined, ""].includes(this.selectedClient) && ![null, undefined, ""].includes(this.message)) {
      const loadingref = this.dialog.open(LoadingProgressComponent,{
        data:{
          msg: "Inserting Message"
        },
        disableClose: true
      });
      let docID = doc(collection(this.firestore,'messages')).id
      var files = this.selectedFiles;
      this.selectedFiles = [];
      var extractedLinks = (this.message.match(this['linkPattern']) || []).map(link => link.trim());
      const chatCollection = doc(this.firestore,'clientissue',this.data.ticketid)
      let chatSubCollection = doc(chatCollection,'messages',docID)
      const newDate = new Date(new Date(this.data.data['time'].toDate()).getTime() + 1 * 1000);
      let formateddate = new Date(this.date);
  
      if(![null,undefined,""].includes(this.date) && ![null, undefined,""].includes(this.time)) {
        const [hours, minutes] = this.time.split(':').map(Number);
        formateddate.setHours(hours, minutes, 0, 0);
      } 
        
      let msgData = {
        "time": [null,undefined,""].includes(this.date) && [null, undefined,""].includes(this.time) ? newDate : formateddate,
        "message": this.message,
        "messageid": docID,
        "sender_profileid": this.selectedClient,
        "sender_email": this.data.mapprofile[this.selectedClient]['email'],
        "sender_uid": [null, undefined, ""].includes(this.data.mapprofile[this.selectedClient]['user_ref']) ? null : this.data.mapprofile[this.selectedClient]['user_ref'].id,
        "pending": [],
        "read_by": ['admin', 'user'],
        "links": extractedLinks,
        "files": [],
        "type": "chat",
        "clientid": this.data.clientid,
        "ticketid": this.data.ticketid
      }
  
      const batch = writeBatch(this.firestore);
      batch.set(chatSubCollection, msgData);
  
      await batch.commit().then(async () => {
        console.log('Message sent successfully');
        loadingref.close();
        this.dialogRef.close();
      }).catch((error) => {
        console.log('error', error);
        loadingref.close();
        this.dialogRef.close();
      });
      if (files.length != 0) {
        this.uploadFiles(chatCollection, chatSubCollection, files);
      }
    } else {
      alert("You must enter sender and message fields")
    }
  }

  // function to upload files to db 
  async uploadFiles(chatCollection, chatSubCollection, files) {
    var uploadedFiles = [];

    if (files.length != 0) {
      console.log('file uploading...');

      for (let a = 0; a < files.length; a++) {
        const imageFile = files[a];
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

      await updateDoc(chatSubCollection, {
        "files": uploadedFiles ?? [],
        "type": uploadedFiles.length == 0 ? 'text' : uploadedFiles[0]['filetype'],
      }).then(() => {
        console.log("file uploaded and updated successfully");
      }).catch((error) => {
        console.log('Oops error while uploading files', error);
      });

      await updateDoc(chatCollection, {
        "last_modification": new Date(),
        "files": uploadedFiles
      }).then(() => {
        console.log("file uploaded and updated successfully in main collection");
      }).catch((error) => {
        console.log('Oops error while uploading files in main collection', error);
      });

    } else {
      console.log("No files to upload");
    }
  }

  // function to accept the selected media fields 
  selectFiles(value) {
    this.selectedFiles = [];
    var localURL = [];
    const target = value.target as HTMLInputElement;
    const files = target.files;
    if (!files) return;
    this.selectedFiles = Array.from(files)

    for (let i = 0; i < this.selectedFiles.length; i++) {
      const element = this.selectedFiles[i];
      const reader = new FileReader();
      reader.readAsDataURL(element);
      reader.onload = (event => {
        var map = {};
        map['filename'] = element.name;
        map['type'] = element.type;
        map['url'] = event.target.result;

        localURL.push(map)
        this.files = localURL
      });
    }
  }

  // function to reset the data of media files 
  onClick(event) {
    event.target.value = '';
  }

  // function to remove selected media file 
  removeFile(index) {
    this.selectedFiles.splice(index, 1);
    var file = Object.assign([], this.files);
    file.splice(index, 1);
    this.files = file;
  }

  // function to return client data 
  returnFilterClient() {
    return this.profileList.filter(e => e.name != null && e.name.toLowerCase().includes(this.filteredClient.toLowerCase())).sort((a, b) => a.name?.toLowerCase().localeCompare(b.name?.toLowerCase()))
  }

  // function to choose the file type of selected media  
  chooseType(type) {

    if (type == 'image') {
      this['filetype'] = 'image/*';
    } else if (type == 'video') {
      this['filetype'] = 'video/*';
    } else if (type == 'audio') {
      this['filetype'] = 'audio/*';
    } else if (type == 'files') {
      this['filetype'] = 'application/*';
    }

    setTimeout(() => {
      this.fileInput.nativeElement.click();
    }, 50);
  }


}
