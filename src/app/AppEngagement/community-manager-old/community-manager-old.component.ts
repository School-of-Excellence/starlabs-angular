import { Component, ElementRef, OnInit, ViewChild,AfterViewInit, QueryList } from '@angular/core';
import {
  Firestore, collection, collectionData,
  DocumentReference, doc,setDoc,updateDoc,
  docData, query,deleteDoc, orderBy
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatChipInputEvent } from '@angular/material/chips';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { CommonModule } from '@angular/common'; 
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { inject } from '@angular/core';
import { deleteObject, getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { onSnapshot } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import {MatPaginator} from '@angular/material/paginator';
import {MatSort} from '@angular/material/sort';
import {MatTableDataSource} from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { MatChip} from '@angular/material/chips';
import { MatChipOption } from '@angular/material/chips';
import { MatChipListbox } from '@angular/material/chips';
import {CdkDragDrop, moveItemInArray} from '@angular/cdk/drag-drop';
import { DomSanitizer } from '@angular/platform-browser';
import { Storage } from '@angular/fire/storage';

export interface postElement{
  categoryname:string,
  communitycategory:DocumentReference, 
  created:Date | any,
  description:string,
  docid:string,
  eventref:DocumentReference,
  type:string,
  videos:Array<videoElement>
  tags:Array<string>
}
export interface videoElement {
  thumbnail:any ,
  video:any,
  title:string
}

export interface uploadElement {
  url:string | ArrayBuffer,
  filename:string | null,
  uploadurl:File
}
@Component({
  selector: 'app-community-manager-old',
   imports:[
    CommonModule,
    FormsModule,        
    MatProgressBarModule,
    NgxMatSelectSearchModule,
    MatToolbarModule,
    MatTableModule, 
    MatPaginatorModule,
    ReactiveFormsModule,
    MatChipsModule,
    MatInputModule,
    MatIconModule, 
    MatFormFieldModule, 
    MatButtonModule,
    DragDropModule,
    MatOptionModule, 
    MatSelectModule,],
  templateUrl: './community-manager-old.component.html',
  styleUrl: './community-manager-old.component.css'
})
export class CommunityManagerOldComponent {
 //form
  createPost:postElement = {
    categoryname:null,
    communitycategory:null,
    created:null,
    description:null,
    docid:null,
    eventref:null,
    type : null,
    videos:[],
    tags:[]
  }
  //category
  newCategoryType:string = null
  newCategoryName:string = null
  categorydocid:string = null
  filteredcategory:any []
  categorylist:any [] = []
  @ViewChild("chipcategorylist") chipcategorylist;
  selectedCategoryName:any = null
  selectedCategory: any = null;
  //tag
  newTagName:string = null
  tagDocid:string = null
  filteredtag:any []
  taglist:any []
  @ViewChild("chiptaglist") chiptaglist;
  selectedTagName:any = []
  //snippet
  snippet:videoElement = {
    thumbnail : null,
    video : null,
    title:null
  }
  //event
  selectedCategoryDocId: string | null = null;
  selectedEvent:any = null
  eventAndQueueList:any [] = []
  eventSearchText:string = ''
  mapEvent:any = {}
  queueList:any [] = []
  eventList:any [] = []
  //subscription
  communityCategorySubscription:Subscription
  communityTagSubscription:Subscription
  eventlistsubscription:Subscription
  queuelistsubscription:Subscription
  //element ref for input filetype
  @ViewChild("thumbnail")thumbnailElement : ElementRef
  @ViewChild("video") videoElement : ElementRef
  //dialog
  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:"Processing Please wait ..."},disableClose:true})
  }
  //table
  // 'index'
  displayedColumns: string[] = ['index','eventref','categoryname', 'type', 'created','edit','delete'];
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  tableDataSubscription:Subscription
  //roles
  roles:any
  operationMode:String = 'Submit'
  postTypeList:any [] = []
  uploadpercentage:any = 0
  communityPostList = []
  snippetSubscription: Subscription
  activeSnippet = {}
  // activeSnippetEvent = null
  selectedEventFilter = "all"
  selectedTypeFilter = "all"
  filterTypeList = [
    {
      "type": "story",
      "label": "Snippets (Story)"
    },
    {
      "type": "post",
      "label": "Community Post"
    },
    {
      "type": "video",
      "label": "Masterclass (video)"
    }
  ]
constructor(
  public firestore: Firestore,
  private dialog: MatDialog,
  public auth: AuthguardService,
  private router: Router,
  private sanitizer: DomSanitizer,
  private storage: Storage
) {
  this.auth.getRoles().then(roles => {
    this.roles = roles;
    // if (roles['ah'] || roles['ahmember'] || roles['admin'] || roles['developer'] || roles['floor']) {
      const communityCategoryRef = collection(this.firestore, 'community category');
      this.communityCategorySubscription = collectionData(communityCategoryRef, { idField: 'docid' }).subscribe(categorysnap => {
        this.categorylist = categorysnap;
      });

      const tagRef = collection(this.firestore, 'community post tags');
      this.communityTagSubscription = collectionData(tagRef, { idField: 'docid' }).subscribe(typesnap => {
        this.taglist = typesnap;
      });

      const snippetRef = doc(this.firestore, 'activesnippet/0');
      this.snippetSubscription = docData(snippetRef).subscribe((event: any) => {
        var value = event ?? {};
        value["event"] = (value["event"] ?? []).map((e: any) => e.path);
        this.activeSnippet = value;
      });

      const queueRef = collection(this.firestore, 'queue generation');
      this.queuelistsubscription = collectionData(queueRef, { idField: 'docid' }).subscribe((queuesnap: any[]) => {
        this.queueList = queuesnap.map((element: any) => {
          this.mapEvent[element['docid']] = element['queuename'];
          element['type'] = "queue";
          element['path'] = `queue generation/${element['docid']}`;
          return element;
        });
        this.ngOnInit();
      });

      const eventRef = collection(this.firestore, 'event collection');
      this.eventlistsubscription = collectionData(eventRef, { idField: 'docid' }).subscribe((eventsnap: any[]) => {
        this.eventList = eventsnap.map((element: any) => {
          this.mapEvent[element['docid']] = element['name'];
          element['type'] = "event";
          element['path'] = `event collection/${element['docid']}`;
          return element;
        });
        this.ngOnInit();
      });

      const postRef = query(collection(this.firestore, "community post"), orderBy('created', 'desc'));
      this.tableDataSubscription = collectionData(postRef, { idField: 'docid' }).subscribe((postsnap: any[]) => {
        let data = postsnap.map((element, index) => {
          element['index'] = index + 1;
          return element;
        });
        this.communityPostList = data;
        this.ngAfterViewInit();
      });

      const classifyDocRef = doc(this.firestore, "classify/communityposttype");
      docData(classifyDocRef).subscribe((snap: any) => {
        this.postTypeList = snap['name'];
      });

    // } else {
    //   console.log("unaccessed user");
    //   this.router.navigateByUrl("/");
    // }
  });
}

  ngOnInit(): void {
    this.eventAndQueueList = [...this.queueList,...this.eventList]    
    if(this.valueCheck(this.createPost.categoryname)){
      this.categorylist.forEach(e => {
        if(e['docid'] === this.categorydocid){
          this.chipcategorylist.value = e
        }
      })
    }
    if(this.createPost.tags.length != 0){
      let array = []
      this.taglist.forEach(e => {
        this.createPost.tags.includes(e.tag) ? array.push(e) : null
      })
      this.chiptaglist.value = array
    }
  }

  ngAfterViewInit(){
    var list = this.communityPostList.filter(e => {
      var typeCheck = this.selectedTypeFilter == "all" ? true : this.selectedTypeFilter == e["type"]
      var eventCheck = this.selectedEventFilter == "all" ? true : this.selectedEventFilter == e["eventref"].id
      return typeCheck && eventCheck
    })
    this.dataSource.data = list
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
  }

  ngOnDestroy(){
    this.communityCategorySubscription.unsubscribe()
    this.communityTagSubscription.unsubscribe()
    this.eventlistsubscription.unsubscribe()
    this.tableDataSubscription.unsubscribe()
    this.queuelistsubscription.unsubscribe()
    this.snippetSubscription.unsubscribe()
  }
  enableEventSnippet() {
  console.log(this.activeSnippet);
  if ((this.activeSnippet["title"] ?? "").length !== 0 && (this.activeSnippet["highlight"] ?? "").length !== 0) {
    // firestore.createId() no longer exists; generate an ID with crypto.randomUUID() or use Firestore's doc ID
    this.activeSnippet["docid"] = this.activeSnippet["docid"] ?? crypto.randomUUID();
    // map string paths to DocumentReference objects
    this.activeSnippet["event"] = (this.activeSnippet["event"] ?? []).map((path: string) => doc(this.firestore, path));
    const snippetDocRef = doc(this.firestore, 'activesnippet', '0');
    setDoc(snippetDocRef, this.activeSnippet);
  }
}
    /*
    console.log(this.activeSnippetEvent, oldValue)
    if(oldValue != null){
      var collection = oldValue["type"] == "queue" ? "queue generation" : "event collection"
      this.firestore.collection(collection).doc(oldValue["docid"]).update({
        showsnippet: true
      })
    }
    if(this.activeSnippetEvent != null){
      var collection = this.activeSnippetEvent["type"] == "queue" ? "queue generation" : "event collection"
      this.firestore.collection(collection).doc(this.activeSnippetEvent["docid"]).update({
        showsnippet: false
      })
    }
    */

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
  onEventSelect(value: any) {
  if (value.type === 'queue') {
    this.createPost.eventref = doc(this.firestore, 'queue generation', value['docid']);
  } else if (value.type === 'event') {
    this.createPost.eventref = doc(this.firestore, 'event collection', value['docid']);
  }
}
  filterEvent(){
    let filteredValue = this.valueCheck(this.eventSearchText) ? this.eventSearchText.trim().toLowerCase() : ""
    return this.eventAndQueueList.filter(e => e['type'] === 'queue' ? e['queuename'].toLowerCase().includes(filteredValue.toLowerCase()) : e['name'].toLowerCase().includes(filteredValue.toLowerCase()))
  }

  onCategorySelect(chipData: any) {
    // Toggle selection logic
    if (this.selectedCategoryDocId === chipData['docid']) {
      this.selectedCategoryDocId = null;
      this.selectedCategory = null; // Clear the ngModel selection
    } else {
      this.selectedCategoryDocId = chipData['docid'];
      this.selectedCategory = chipData; // Set the ngModel selection
    }
    
    // Update form data
    this.createPost.categoryname = chipData['categoryname'];
    this.createPost.type = chipData['type'];
    this.createPost.communitycategory = doc(collection(this.firestore, "community category"), chipData['docid']);
    this.newCategoryName = chipData['categoryname'];
    this.newCategoryType = chipData['type'];
    this.categorydocid = chipData['docid'];
  }

  onselectedCategorychange(){
    console.log(this.selectedCategoryName);
    
  }

  addnewcategory(type:string){
        if (this.valueCheck(this.newCategoryName) && this.valueCheck(this.newCategoryType)) {
        const newName = this.newCategoryName.trim().replace(/\s+/g, "").toLowerCase();
        const categoryExists = this.categorylist.some(
          e => e.categoryname.trim().replace(/\s+/g, "").toLowerCase() === newName
        );
        if (!categoryExists) {
          let id = type === 'new' ? doc(collection(this.firestore, 'community category')).id : this.categorydocid;
          const categoryDocRef = doc(this.firestore, 'community category', id);
              setDoc(categoryDocRef, {
          docid:id,
          categoryname:this.newCategoryName,
          type:this.newCategoryType
        },{merge:true}).then(() => {
          this.newCategoryName = null
          this.newCategoryType = null
          this.categorydocid = null
          console.log("new community category added successfully");
        }).catch(err => {console.log(err);
        })
      }else{console.log("category already exist");}
    }else{ console.log("please enter category name and type");}
  } 
  deletecategory() {
    if (this.valueCheck(this.categorydocid)) {
      const docRef = doc(this.firestore, 'community category', this.categorydocid);
      deleteDoc(docRef).then(() => {
        this.newCategoryName = null;
        this.newCategoryType = null;
        this.categorydocid = null;
      }).catch(err => {
      console.error('Error deleting category:', err);
     });
   }
  }
  onTagSelect(chip: MatChip,index: number) {
      const tagValue = chip.value['tag'];
      const isSelected = this.createPost.tags.includes(tagValue);
      if (!isSelected) {
        this.createPost.tags.push(tagValue);
        chip.color = 'primary'; // Optional: visually mark as selected
      } else {
        const findIndex = this.createPost.tags.findIndex(e => e === tagValue);
        if (this.valueCheck(findIndex)) {
          this.createPost.tags.splice(findIndex, 1);
          chip.color = undefined; // Optional: reset visual
        }
      }
    }
    addnewtag() {
        if (this.valueCheck(this.newTagName)) {
          const trimmedName = this.newTagName.trim().replace(/\s+/g, "").toLowerCase();
          const tagExists = this.taglist.some(
            e => e.tag.toLowerCase().replace(/\s+/g, "") === trimmedName
          );
          if (!tagExists) {
            const id = doc(collection(this.firestore, "community post tags")).id;
            const tagDocRef = doc(this.firestore, "community post tags", id);
            setDoc(tagDocRef, {
              docid: id,
              tag: this.newTagName,
            }, { merge: true }).then(() => {
              this.newTagName = null;
              console.log("new community tag added successfully");
            }).catch(err => {
              console.log(err);
            });
          } else {
            console.log("category already exists");
          }
        } else {
          console.log("please enter category name and type");
        }
      }
  deletetag() {
    if (this.valueCheck(this.tagDocid)) {
      const docRef = doc(this.firestore, 'community post tags', this.tagDocid);
      deleteDoc(docRef).then(() => {
        this.newTagName = null;
        this.tagDocid = null;
      }).catch(err => {
        console.error('Error deleting tag:', err);
      });
    }
  } 

uploadThumbnail(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files && files.length !== 0) {
    const reader = new FileReader();
    reader.readAsDataURL(files[0]);
    reader.onload = (e) => {
      this.snippet['thumbnail'] = {
        url: e.target?.result,
        filename: files[0].name,
        uploadurl: files[0],
      };
      this.snippet['title'] = files[0].name;
    };
  }
}
uploadVideo(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files && files.length !== 0) {
    const file: File = files[0];
    this.snippet['video'] = {
      url: URL.createObjectURL(file),
      filename: file.name,
      uploadurl: file,
    };
  }
}
  sanitize(url:string){
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  onAddSnippet(){
    if(this.valueCheck(this.snippet.thumbnail)){
      this.createPost.videos.push(this.snippet)
      this.thumbnailElement.nativeElement.value = null
      this.snippet.video != null ? this.videoElement.nativeElement.value = null : null
      this.snippet = {
        thumbnail : null,
        video : null,
        title:null
      }
    }
  }
  async onRemoveSnippet(index:number){
    if(this.operationMode === "Update"){
      for (let i = 0; i < this.createPost.videos.length; i++) {
        const element = this.createPost.videos[i];
        for (const key in element){
          if(this.valueCheck(element[key]) && ['thumbnail','video'].includes(key)){
          try {
            const fileRef = ref(this.storage, element[key]);
            await deleteObject(fileRef);
          } catch (err) {
            console.log(err);
          } finally {
            this.createPost.videos.splice(index, 1);
          }
        }
      }
    }
    }else{
      this.createPost.videos.splice(index,1)
    }
  }
  async onSubmitPost(){
    let loadingref = this.loading
    console.log(this.createPost);
    this.operationMode === 'Submit' ? this.createPost.created = new Date() : null
    let id = this.operationMode === 'Submit' ? doc(collection(this.firestore, 'community post')).id  : this.createPost.docid;   
     this.operationMode === 'Submit' ? this.createPost.docid = id : null
     console.log(this.validatingPost())
    if(this.validatingPost()){
      console.log(this.validatingPost())
      await this.uploadVideos()
      await setDoc(doc(this.firestore, 'community post', this.createPost.docid), this.createPost, { merge: true })
      .then(() => {        this.onReset()
        loadingref.close()
        console.log("document successfully submitted");
      }).catch(err => {console.log(err);
      })
    }else{loadingref.close()}
  }
  validatingPost():boolean{
    let validate = true
    for (const key in this.createPost) {
      if(!['description'].includes(key)){
        if(!this.valueCheck(this.createPost[key])){ 
          validate = false
        }else if(key === 'videos'){
          if(this.createPost[key].length === 0){
            validate = false
          }
        }
      }
    }
    return validate
  }
  async uploadVideos() {
      for (let i = 0; i < this.createPost.videos.length; i++) {
        const element = this.createPost.videos[i];
        for (const key in element) {
          if (
            element[key] != null &&
            ['thumbnail', 'video'].includes(key) &&
            this.valueCheck(element[key]['uploadurl'])
          ) {
            const filepath = "Community Post/" + new Date().toISOString() + element[key]['filename'];
            const fileRef = ref(this.storage, filepath);

            try {
              const uploadResult = await uploadBytes(fileRef, element[key]['uploadurl']);
              const url = await getDownloadURL(uploadResult.ref);
              element[key] = url;
            } catch (err) {
              console.log(err);
            }
          }
        }
      }
    }
  onDelete(row:any){
    console.log(row);
    if(confirm("are you sure want to delete")){
      for (let i = 0; i < row.videos.length; i++){
        const element = row.videos[i];
        for (const key in element) {
          if(element[key] != null){
            if(['thumbnail','video'].includes(key)){
             const fileRef =ref(this.storage, element[key]); 
             deleteObject(fileRef).catch(err => console.error('Delete failed:', err));            }
          }
        }
      }
     const postDocRef = doc(this.firestore, 'community post', row.docid);
     deleteDoc(postDocRef)
      .then(() => console.log('Document deleted successfully'))
      .catch(err => console.error('Error deleting document:', err));    }
  }
  valueCheck(value:any){
    return ![null,undefined,""," "].includes(value)
  }
  drop(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.createPost.videos, event.previousIndex, event.currentIndex);
  }
  onPatchCommunityPost(doc:postElement){
    this.operationMode = "Update"
    this.createPost = {
      categoryname:doc.categoryname,
      communitycategory:doc.communitycategory,
      created:doc.created.toDate(),
      description:doc.description,
      docid:doc.docid,
      eventref:doc.eventref,
      type : doc.type,
      videos:doc.videos,
      tags:doc.tags
    }
    console.log("after patched data lokks like",this.createPost);
    this.eventAndQueueList.forEach(e => {
      if(e['docid'] === doc.eventref.id){
        this.selectedEvent = e
      }
    })
    // console.log(this.selectedEvent);
    this.categorylist.forEach(e => {
      if(e['docid'] === doc.communitycategory.id){
        this.chipcategorylist.value = e
        this.newCategoryName = e.categoryname
        this.newCategoryType = e.type
        this.categorydocid = e.docid
      }
    })
    //patching tag
    let array = []
    this.taglist.forEach(e => {
      if(this.valueCheck(doc.tags)){
        doc.tags.includes(e.tag) ? array.push(e) : null
      }
    })
    this.chiptaglist.value = array

  }
  onReset(){
    this.operationMode = 'Submit'
    this.createPost = {
      categoryname:null,
      communitycategory:null,
      created:null,
      description:null,
      docid:null,
      eventref:null,
      type : null,
      videos:[],
      tags:[]
    }
    this.selectedEvent = null
    // this.chipcategorylist.value = null
    this.selectedCategory = null
    this.newCategoryName = null
    this.newCategoryType = null
    this.categorydocid = null
    // this.chiptaglist.value = []
    this.categorylist = []
  }
  compareFnc(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }
  compareFnt(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }
  compareFn(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }
  testHLS(hlsdata){
    console.log(hlsdata)
    if(hlsdata != null && hlsdata != undefined){
      var url = "https://media.publit.io/file/h_480/" + hlsdata["responsepublitio"]["id"] + ".mp4"
      window.open(url, '_blank')
    }
  }
  makeAvailable(data: any) {
  console.log(data);
  const docRef = doc(this.firestore, 'community post', data['docid']);
  updateDoc(docRef, {
    available: !(data['available'] ?? false)
  }).then(() => {
    console.log('Availability status updated.');
  }).catch(err => {
    console.error('Error updating availability:', err);
  });
}
}
/*
  let uploadingsize:any = 0
  for (let i = 0; i < this.createPost.videos.length; i++) {
    const element = this.createPost.videos[i];
    for (const key in element){
      if(element[key] != null && key != 'title' && this.valueCheck(element[key]['uploadurl'])){
        let file:File = element[key]['uploadurl']
        uploadingsize++
      }
    }
  }
  uploadingsize
  console.log(uploadingsize);
  let refpath = this.storage.ref(filepath)
  this.uploadpercentage = uploadtask.percentageChanges().subscribe(result => {
    console.log(result);
    if(result === ){}     
  })
  uploadtask.snapshotChanges().pipe(
    finalize(() => refpath.getDownloadURL().subscribe(url => {
      element[key] = url
    }))
  )
*/
