import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { AuthguardService } from '../../../authguard.service';
import { AngularFireStorageModule } from '@angular/fire/compat/storage';
import { DomSanitizer } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { collection, collectionSnapshots, deleteDoc, doc, docSnapshots, Firestore, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, Unsubscribe, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatSelectChange } from '@angular/material/select';
import { MatTableDataSource } from '@angular/material/table';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ThemePalette } from '@angular/material/core';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { getDownloadURL, ref, Storage, uploadBytes } from '@angular/fire/storage';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-participant-reports',
  standalone: true,
  imports:[
  FormsModule,
  MatFormFieldModule,
  MatInputModule,
  CommonModule,
  MatSlideToggleModule, 
  MatPaginatorModule,
  MatSortModule,
  MatTableModule,
  MatSelectModule,
  MatDialogModule,
  ReactiveFormsModule,],
  templateUrl: './participant-reports.component.html',
  styleUrls: ['./participant-reports.component.css']
})
export class ParticipantReportsComponent implements OnInit {
  displayedColumns: string[] = ['participant','anonymous','title','description','image','created','share'];
  @ViewChild('fileInput') fileInput: ElementRef;
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableDataSubscription: Unsubscribe
  @Input() eventid:string
  mapProfile = {};
  profileid: string[] = []; 
  selectedProfile:string;
  title:string;
  description:string;
  submiting = false;
  //images
  images: any[]=[];
  imagesUrl: any[]=[];
  previewImages: any[] = [];
  tableData = []
  color: ThemePalette = 'accent';
  checked = false;
  disabled = false;
  anonymous:boolean;

  constructor(
    public firestore: Firestore,
    private guard: AuthguardService,
    private storage: Storage,
    public dialog: MatDialog,

  ) {
    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.map;
    });
    this.profileData();
    this.viewTable();
   }

  ngOnInit(): void {
  }
  ngOnDestroy(){
    if (this.tableDataSubscription) {
    this.tableDataSubscription(); 
  }
  }
  profileData(){
    this.profileid = [];
    const profileCollection = collection(this.firestore, 'profile_data');
    const profileQuery = query(profileCollection, orderBy('name'));
     getDocs(profileQuery).then(profiledata => {  
       profiledata.forEach(profile =>{
        let data = profile.data();
        // console.log("profiless",data['profileid']);
        this.profileid.push(data['profileid']);
      })
    })
  }
  importImages(images){
    this.images = Array.from(images)
    this.previewImages = []
    for (let i = 0; i < this.images.length; i++) {
      const pic = this.images[i];
      var reader = new FileReader()
      reader.readAsDataURL(pic)
      reader.onload = (event=>{
        this.previewImages.push(event.target.result)
      })
    }
  }
  removeImage(index) {
    // //console.log(index);
    this.images.splice(index, 1);
    this.previewImages.splice(index, 1);
    this.updateFileInput();
  }

  updateFileInput() {
    const dataTransfer = new DataTransfer();
    this.images.forEach(file => {
      dataTransfer.items.add(file);
    });
    this.fileInput.nativeElement.files = dataTransfer.files;
  }
  submit(){
    this.submiting = true
    if (this.images.length > 0) {
        if (this.selectedProfile != '' && this.selectedProfile != undefined && this.title !='' && this.description !='' && this.eventid != null) {
        this.submiting = true
        this.imagesUrl = [];
        const imageUploadPromises = this.images.map((image) => {
          const filePath = `bigwallparticipantreports/images/${new Date().getTime()}_${image.name}`;
          const storageRef = ref(this.storage, filePath); 
          return uploadBytes(storageRef, image).then((snapshot) => { 
          return getDownloadURL(snapshot.ref);
          }).then((url) => {
            this.imagesUrl.push(url);
          });
        });
        Promise.all([...imageUploadPromises]).then(() => {
          const submitCollection = collection(this.firestore, 'participant_reports'); 
          const submitDocRef = doc(submitCollection); 
          const docId = submitDocRef.id; 
          setDoc(submitDocRef, {
            docid: docId,
            eventid: this.eventid,
            anonymous: this.anonymous ?? false,
            profileid: this.selectedProfile,
            title: this.title,
            description: this.description,
            images: this.imagesUrl,
            created: new Date()
          }).then(() => {
            this.submiting = false;
            this.selectedProfile = "";
            this.title = "";
            this.description = "";
            this.anonymous = null;
            this.images = [];
            this.previewImages = [];
          });
        });
      }
       else {
        alert('Please select Event Participant and enter both Title, Description'); 
        this.submiting = false
      }
    } else {
      if (this.selectedProfile != '' && this.selectedProfile != undefined && this.title !='' && this.description !='' && this.eventid != null) {
        this.submiting = true
        console.log("this.participant",this.selectedProfile);
        console.log("this.title",this.title);
        console.log("this.description",this.description);  
        console.log("event id",this.eventid);
        const submitCollection = collection(this.firestore, 'participant_reports'); 
        const submitDocRef = doc(submitCollection);       
        const docId = submitDocRef.id;
       setDoc(submitDocRef,{
          docid: docId,
          eventid:this.eventid,
          profileid: this.selectedProfile,
          anonymous:this.anonymous ?? false,
          title : this.title,
          description:this.description,
          created: new Date()
        }).then(()=>{
          this.submiting = false;
          this.selectedProfile ="",
          this.title ="",
          this.description =""
          this.anonymous = null
        })
      }
      else {
        alert('Please select Event Participant and enter both Title, Description');  
        this.submiting = false
      }
    }
  }
  viewTable() {
    const participantReportsRef = collection(this.firestore, 'participant_reports');
    const q = query(participantReportsRef, orderBy('created', 'desc'));
    this.tableDataSubscription = onSnapshot(q, (querySnapshot) => {
      console.log('postsnap length', querySnapshot.size);
      this.tableData = querySnapshot.docs.map(doc => doc.data());
      this.ngAfterViewInit();
    });
  }

  ngAfterViewInit(){
    this.dataSource.data = this.tableData
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }
  shareToBigWall(row:any){
    let docData = Object.assign({},row)
    const eventDocRef = doc(this.firestore, 'event collection', this.eventid);
    docData['eventref'] = eventDocRef;
    docData['from'] = 'participantreports';
    docData['pinned'] = false;
    const arenaDocRef = doc(this.firestore, 'arena highlights', row['docid']);
    setDoc(arenaDocRef, docData, { merge: true });
  }
}
