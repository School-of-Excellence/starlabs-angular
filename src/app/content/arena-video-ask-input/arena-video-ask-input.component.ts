import { Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { DomSanitizer } from '@angular/platform-browser';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { ref, uploadBytes, getDownloadURL, Storage, deleteObject } from '@angular/fire/storage';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-arena-video-ask-input',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    CommonModule,
    MatTableModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatSlideToggleModule,
  ],
  templateUrl: './arena-video-ask-input.component.html',
  styleUrl: './arena-video-ask-input.component.css'
})
export class ArenaVideoAskInputComponent {
videoAskForm = {
    eventid:null,
    questiontype:null,
    questionurl:null,
    active:null,
    description:null,
    url:null,
    filename:null,
    uploadurl:null,
    title:null
  }
  eventlist=[]
  // table
  displayedColumns: string[] = ['title','description','eventref', 'questiontype', 'questionurl', 'active'];
  dataSource: MatTableDataSource<any> = new MatTableDataSource();

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort

  mapVideoaskByEvent = {}
  mapEvent = {}
  private subscription = new Subject<void>();
  constructor(
    private firestore : Firestore,
    private sanitizer:DomSanitizer, 
    private storage : Storage,
    private dialog : MatDialog
    ) { 
      const eventcollectionRef = collection(this.firestore,'event collection')
      getDocs(eventcollectionRef).then(snap => {
      this.eventlist = snap.docs.map(e =>{
        let element = e.data()
        element['id'] = e.id
        this.mapEvent[e.id] = element
        return element
      })
    })
    const arenavideoaskRef = collection(this.firestore,'arenavideoask')
    collectionSnapshots(arenavideoaskRef).pipe(takeUntil(this.subscription)).subscribe(snapdata => {
      let snap = snapdata.map(doc =>({id:doc.id,...doc.data()}))
      this.dataSource.data = snap
      this.ngAfterViewInit()
      this.mapVideoaskByEvent = {}
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        if(element['eventref'] != null){
          this.mapVideoaskByEvent[element['eventref'].path] = this.mapVideoaskByEvent[element['eventref'].path] || []
          this.mapVideoaskByEvent[element['eventref'].path].push(element)
        }
      }
    })
  }
  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  async uploadThumbnail(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e: any) => {
        this.videoAskForm.url = e.target.result;
        this.videoAskForm.filename = file.name;
        this.videoAskForm.uploadurl = file;
      };
    }
  }


  async uploadVideo(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.videoAskForm.url = URL.createObjectURL(file);
      this.videoAskForm.filename = file.name;
      this.videoAskForm.uploadurl = file;
    }
  }


  sanitize(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  async onSubmit(){
    if(this.videoAskForm.uploadurl != null){
      let loading = this.dialog.open(LoadingProgressComponent,{
        data:{
          msg:"Please Wait Uploading ..........."
        },
        disableClose:true
      })
      await this.upload()
      const id = doc(collection(this.firestore,'content_urls')).id
      let docData = {
        docid:id,
        createddate:new Date(),
        description:this.videoAskForm.description,
        active:this.videoAskForm.active,
        eventref:this.videoAskForm.eventid != null ? doc(this.firestore,'event collection',this.videoAskForm.eventid): null,
        questiontype:this.videoAskForm.questiontype,
        questionurl:this.videoAskForm.questionurl,
        title:this.videoAskForm.title
      }
      if(docData['active'] === true){
        await this.updateVideoAskDocUnActive(docData)
      }
      const arenavideoaskRef = doc(this.firestore, 'arenavideoask', id);
      await setDoc(arenavideoaskRef, docData).then(() => {
        this.videoAskForm = {
          eventid:null,
          questiontype:null,
          questionurl:null,
          active:null,
          description:null,
          url:null,
          filename:null,
          uploadurl:null,
          title:null
        }
        loading.close()
      })
    }else{
      alert("please select image (or) video")
    }
  }

  async upload(){
    const filepath = "Arena VideoAsk/"+new Date().toISOString() + this.videoAskForm.filename;
    const storageRef = ref(this.storage,filepath)
    try {
      const snapshot = await uploadBytes(storageRef,this.videoAskForm.uploadurl)
      this.videoAskForm.questionurl = await getDownloadURL(snapshot.ref)
    } catch (error) {
      console.error(error);
    }
  }

  async docChange(event,row:any){
    if(event.checked === true){
      await this.updateVideoAskDocUnActive(row)
    }
    const arenavideoaskRef = doc(this.firestore, 'arenavideoask', row['docid']);
    updateDoc(arenavideoaskRef,{
      active:event.checked
    })
  }

  async updateVideoAskDocUnActive(row:any){
    if(this.mapVideoaskByEvent[row['eventref'].path] != undefined){
      let batch = writeBatch(this.firestore)
      for (let i = 0; i < this.mapVideoaskByEvent[row['eventref'].path].length; i++) {
        const element = this.mapVideoaskByEvent[row['eventref'].path][i];
        if(element['docid'] != row['docid']){
          const arenavideoaskRef = doc(this.firestore, 'arenavideoask', element['docid']);
          batch.update(arenavideoaskRef,{active:false})
          if(i != 0 && i%450 === 0){
            await batch.commit().then(() => {
              batch = writeBatch(this.firestore)
            })
          }
        }
      }
      await batch.commit()
    }
  }

  async onDocDelete(doc){
    const questionurlRef = ref(this.storage,doc['questionurl'])
    await deleteObject(questionurlRef)
    const arenavideoaskRef = doc(this.firestore, 'arenavideoask', doc['docid']);
    await deleteDoc(arenavideoaskRef)
  }

}
