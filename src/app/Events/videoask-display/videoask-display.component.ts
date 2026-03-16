import { Component, inject, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { arrayRemove, arrayUnion, collection, collectionData, doc, Firestore, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-videoask-display',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    FormsModule,
    CommonModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatDatepickerModule,
    MatButtonModule,
    MatSlideToggleModule
  ],
  templateUrl: './videoask-display.component.html',
  styleUrl: './videoask-display.component.css'
})
export class VideoaskDisplayComponent {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort, {static: true}) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;

  displayedColumns: string[] = ['profileid', 'videoaskid', 'event', 'fileurl', "uploaded", "addtohighlights",'tag'];
  dataSource = new MatTableDataSource();

  // filter variables
  // Profile Data
  profileDataList = []
  mapparticipant = {}
  mapparticipantNew = {}
  // Map Event
  mapEvents = {}
  eventList = []
  // Map Workshop
  mapWorkshop = {}
  workshopList = []
  // Map Queue
  mapQueue = {}
  queueList = []
  // Map VideoAsk Template
  mapVideoAsk = {}

  form : FormGroup 
  filterText = ""
  filterEvent = ""
  filteredProfileData = []
  filteredProfileDataNew = []
  filteredEventData = []

  tableData = []

  mapProfileToVideoAsk = {}
  snippetView:boolean = false
  stayingInNonSnippetView:boolean = false
  arenaVideoAskList = []
  filteredTemplateList = []

  videoAskTags = []

  loggedInProfileid = null

  private destroy$ = new Subject<void>()
  private firestore =  inject(Firestore)

  constructor(
    public guard : AuthguardService,
    private formbuilder : FormBuilder
  ){
    this.guard.getRoles().then(roles =>{
      this.loggedInProfileid = roles["profile_ref"].id
    })
    this.form = this.formbuilder.group ({
      profileid:[[],],
      event:[[],],
      range:new FormGroup({
        start: new FormControl(),
        end: new FormControl()
      }),
      template:[[],]
    })
   
    // guard.getProfileMap().then(data=>{
    //   this.profileDataList = data.list
    //   this.mapparticipant = data.map
    //   this.filteredProfileData = data.list
    // })
    // guard.getProfileMapNewUser().then(data=>{
    //   this.profileDataListNew = data.list
    //   this.mapparticipantNew = data.map
    //   this.filteredProfileDataNew = data.list
    // })
    Promise.all([
      guard.getProfileMap(),
      guard.getProfileMapNewUser()
    ]).then(([normal, newuser]) => {

      this.profileDataList = [
        ...normal.list,
        ...newuser.list
      ];

      this.mapparticipant = {
        ...normal.map,
        ...newuser.map
      };
      this.mapparticipantNew = {
        ...normal.docdata,
        ...newuser.docdata  
      }

      this.filteredProfileData = this.profileDataList;
    });

    let n = 0

    //event collection
    getDocs(collection(this.firestore,"event collection")).then(snapshot => {
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = snapshot.docs[j].data()
        this.mapEvents[element.id] = elementData
        elementData['docid'] = element.id
        this.eventList.push(elementData)
      }
      n++
      if(n === 3) this.filteredEventData = [...this.eventList,...this.workshopList,...this.queueList]
    })


    // ADD THIS:
    collectionData(
      query(
        collection(this.firestore, 'participant tags'),
        where('tagsfor', 'array-contains', 'video ask'),
        where('isActive', '==', true)
      ),
      { idField: 'docid' }
    ).pipe(takeUntil(this.destroy$)).subscribe((tags: any[]) => {
      this.videoAskTags = tags;
      console.log('videoask tags:', this.videoAskTags);
    });

    // Workshop Data
    getDocs(collection(this.firestore,"eiflix workshop")).then(snapshot => {
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = snapshot.docs[j].data()
        this.mapWorkshop[element.id] = elementData
        this.workshopList.push(elementData)
      }
      n++
      if(n === 3) this.filteredEventData = [...this.eventList,...this.workshopList,...this.queueList]
    })

    // Queue Data
    getDocs(collection(this.firestore,"queue generation")).then(snapshot => {
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = snapshot.docs[j].data()
        this.mapQueue[element.id] = elementData
        this.queueList.push(elementData)
      }
      n++
      if(n === 3) this.filteredEventData = [...this.eventList,...this.workshopList,...this.queueList]
    })

    // Video Ask Template
    getDocs(collection(this.firestore,"arenavideoask")).then(snapshot => {
      this.arenaVideoAskList = []
      for (let i = 0; i < snapshot.docs.length; i++) {
        const element = snapshot.docs[i];
        this.mapVideoAsk[element.id] = element.data()["title"]
        this.arenaVideoAskList.push(element.data())
      }
      this.filteredTemplateList = this.arenaVideoAskList
      console.log("filteredTemplateList",this.filteredTemplateList);
      
    })

    // Participant Video Ask
    collectionData(query(collection(this.firestore,"participantvideoask"),orderBy("uploaded","desc")))
    .pipe(takeUntil(this.destroy$))
    .subscribe(snap => {
      this.tableData = snap
      if(!this.snippetView){
        this.ngAfterViewInit()
        this.getProfileToVideoASK()
      }
    })

    //filter trigger
    this.form.valueChanges.subscribe(() => {
      console.log("onFilterChanges");
      this.onFilter()
    });
      
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = this.customfilter()
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  ngAfterViewInit(){
    if(this.snippetView === false){
      console.log("table view");
      if(this.stayingInNonSnippetView){
        this.dataSource.data =  this.tableData
        this.dataSource.sort = this.sort
        this.dataSource.paginator = this.paginator

      }else{
        this.dataSource = new MatTableDataSource()
        this.displayedColumns = ['profileid', 'videoaskid', 'event', 'fileurl', "uploaded", "addtohighlights",'tag'];
        this.dataSource.data =  this.tableData
        this.dataSource.sort = this.sort
        this.dataSource.paginator = this.paginator
        this.dataSource.filterPredicate = this.customfilter()
        this.onFilter()
        this.stayingInNonSnippetView = true
      }
    }else{
      console.log("snippet view");
      this.dataSource = new MatTableDataSource()
      this.displayedColumns = ['profileid'];
      this.dataSource.data =  Object.keys(this.mapProfileToVideoAsk)
      this.dataSource.sort = this.sort
      this.dataSource.paginator = this.paginator
      this.dataSource.filterPredicate = this.customfilter2()   
    }
    console.log(this.dataSource.data.length);
  }

  getProfileToVideoASK(){
    let filteredData = this.dataSource.filteredData ?? this.dataSource.data
    this.mapProfileToVideoAsk = {}
    for (let i = 0; i < filteredData.length; i++) {
      const element = filteredData[i];
      this.mapProfileToVideoAsk[element['profileid']] = this.mapProfileToVideoAsk[element['profileid']] || []
      this.mapProfileToVideoAsk[element['profileid']].push(element)
    }
  }

  changeToSnippetView(){
    if(!this.snippetView) this.stayingInNonSnippetView = this.snippetView
    this.ngAfterViewInit()
  }

  onProfileFilter(){
    return this.profileDataList.filter(e => e.name != undefined).filter( e => e.name.toLowerCase().indexOf(this.filterText) === 0)
  }

  onEventFilter(){
    return [...this.eventList,...this.workshopList,...this.queueList].filter(e => e.name.toLowerCase().indexOf(this.filterEvent) === 0)
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.form.value)
    if(!this.snippetView) this.getProfileToVideoASK()
  }

  onTextSearch(event:Event,formcontrol){
    let textvalue = !["",null,undefined].includes((event.target as HTMLInputElement).value.trim()) ? (event.target as HTMLInputElement).value.trim() : ""
    if(formcontrol === 'profileid'){
      return this.filteredProfileData = this.profileDataList.filter(e => e.name != undefined).filter( e => e.name.toLowerCase().indexOf(textvalue) === 0)
    }else if(formcontrol === 'event'){
      return this.filteredEventData = [...this.eventList,...this.workshopList,...this.queueList].filter(e => {
        let name = e.name != undefined ? e.name : e.title != undefined ? e.title : e.queuename != undefined ? e.queuename : ""
        if(name.toLowerCase().indexOf(textvalue) === 0) return e
      })
    }else if(formcontrol === 'template'){
      return this.filteredTemplateList = this.arenaVideoAskList.filter(e => e.title.toLowerCase().includes(textvalue))
    }else{
      return null
    }
  }

  selected(event:MatAutocompleteSelectedEvent,formcontrol:string){
    console.log(this.form.get(formcontrol).value,event.option.value,event);
    return this.form.get(formcontrol).value.push(event.option.value),this.onFilter();
  }

  onRemove(formcontrol:string,index:number){
    return this.form.get(formcontrol).value.splice(index,1),this.onFilter();
  }

  onResetForm(){
    this.form.patchValue({
      profileid:[],
      event:[],
      range:{
        start:null,
        end:null
      },
      template:[]
    })
  }

  onShareToHighlights(doc:any){
    let element = Object.assign({},doc)
    element['eventref'] = element['arenaevent']
    element['from'] = "arena videoask"
    element['pinned'] = false 
    setDoc(doc(this.firestore,"arena highlights",element['docid']),element,{merge:true})
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['profileid'].length != 0 ? (value['profileid'].includes(e['profileid'])) : true) && 
            (value['event'].length != 0 ? (value['event'].includes(e['arenaevent'] ? e['arenaevent'].id : e['workshopref'] ? e['workshopref'].id : e['queueref'] ? e['queueref'].id : null)) : true) &&
            (value['template'].length != 0 ? value['template'].includes(e['videoaskid']) : true) &&
            (!Object.values(value.range).includes(null) && ![null,undefined].includes(e['uploaded']) ? (e['uploaded'].toDate() > new Date(new Date(value.range['start']).setHours(0,0,0,0)) && e['uploaded'].toDate() < new Date(new Date(value.range['end']).setHours(23,59,59,59))) : true)
    }
    return filterFunction;
  }

  public customfilter2():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return value['profileid'].length != 0 ? value['profileid'].includes(e) : true
    }
    return filterFunction;
  }

  async updateVideoAdk(row, tagId){
    const confirmMessage = row.tags?.includes(tagId) ? 'Are you sure want to remove this tag?' : 'Are you sure want to add this tag?'
    const check = confirm(confirmMessage);
    if(check){
      const isRemoving = row.tags?.includes(tagId);
      const currentTags: string[] = row.tags || [];
      const updatedTags = isRemoving
        ? currentTags.filter(t => t !== tagId)
        : [...currentTags, tagId];

      await updateDoc(doc(this.firestore, 'participantvideoask', row.docid), {
        tags: isRemoving ? arrayRemove(tagId) : arrayUnion(tagId)
      }).then(async () => {
        console.log('Updated Tag');

        await updateDoc(doc(this.firestore, 'participant metadata', row.profileid), {
          profiletags: isRemoving ? arrayRemove(tagId) : arrayUnion(tagId)
        })

        const logId = doc(collection(this.firestore, 'participant tag logs')).id;
        await setDoc(doc(this.firestore, "participant tag logs", logId), {
          logid: logId,
          profileid: row.profileid,
          type: isRemoving ? "removed" : "added",
          tags: [tagId],
          updated: new Date(),
          updatedby: this.loggedInProfileid,
          source: "videoask"
        })

        // Save version to Participant tag versions
        // const versionDocId = doc(collection(this.firestore, 'participant tag versions')).id;
        // await setDoc(doc(this.firestore, 'participant tag versions', versionDocId), {
        //   profileid: row.profileid,
        //   profiletags: updatedTags,
        //   updated: new Date(),
        //   updatedby: this.loggedInProfileid,
        //   // source: 'videoask',
        //   // videodocid: row.docid
        // });

      }).catch((error)=>{
        console.log(error);
      });
    }
  }

}
