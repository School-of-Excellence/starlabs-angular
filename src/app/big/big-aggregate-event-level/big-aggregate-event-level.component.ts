import { Component, ViewChild } from '@angular/core';
import { FormGroup, Validators, FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule } from '@angular/common';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-big-aggregate-event-level',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    CommonModule,
    NgxMatSelectSearchModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './big-aggregate-event-level.component.html',
  styleUrl: './big-aggregate-event-level.component.css'
})
export class BigAggregateEventLevelComponent {
aggregateForm! : FormGroup

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;
  dragDisabled = true;
  displayedColumns: string[] = ['participant', 'atcmodel','queueid', 'currentlevel', 'levelupcount', 'specialactivity', 'boosteractivity', 'fasttrack', 'regular', 'warmup'];
  dataSource = new MatTableDataSource();
  atcModelLevelup = {}
  private subscription = new Subject<void>();
  participantList = []
  atcModelList = []
  name : any
  // levelSubscription: Subscription;
  levelList = [];
  participantaggregateList = []
  crossmatch: any;
  crossmatcherrormessage: any;
  configuration = []
  configurationmatch: boolean;
  configurationerrormessage: string | boolean;
  maplevel = {}
  maplevels = {}
  mapparticipant = {}
  configurationcheck: boolean;
  filteredClient: any;
  loading:boolean = false
  mapBigActivity = {}
  selectedParticipant 
  selectedATCModel 

  mapQueue = {}
  filter:any = {
    participant:[],
    atcmodel:[],
    event:[]
  }
  queueList = []
  profilelist = []
  filterText
  filteredQueueList
  filteredProfilelist
  mapActivityPerParticipant = {}
  totalActivityCount = 0
  constructor( public formbuilder: FormBuilder,
    public guard: AuthguardService, 
    public firestore: Firestore,
    public dialog:MatDialog) {
    this.aggregateForm = this.formbuilder.group ({
      participant: [, {validators: [Validators.required], updateOn:"change"}],
      atcmodel:[,{validators: [Validators.required], updateOn:"change"}],
      level:[,{validators: [Validators.required], updateOn:"change"}],
    })
    guard.getRoles().then(roles=>{
      // if(roles["developer"] || roles["admin"] || roles["ah"]){
        getDocs(query(collection(this.firestore,"profile_data"),orderBy("name","asc"))).then(snap => {
          for (let i = 0; i < snap.docs.length; i++) {
            this.participantList.push(snap.docs[i].data())
            this.mapparticipant[snap.docs[i].id] = snap.docs[i].data()['name']
          }
          this.profilelist = snap.docs.map(e => e.data())
          this.filteredProfilelist = this.profilelist
        })
        getDocs(query(collection(this.firestore,"queue generation"),orderBy("queuename","asc"))).then(queueSnap => {
          for (let i = 0; i < queueSnap.docs.length; i++) {
            const element = queueSnap.docs[i];
            this.mapQueue[element.id] = element.data()['queuename']
          }
          this.queueList = queueSnap.docs.map(e => e.data())
          this.filteredQueueList = this.queueList
        })
        collectionSnapshots(query(collection(this.firestore,"big aggregate event level"),orderBy('atcmodel'))).pipe(takeUntil(this.subscription)).subscribe(snapdata => {
          let snap = snapdata.map(doc=>({id:doc.id,...doc.data()}))
          this.participantaggregateList = snap
          // console.log(this.participantaggregateList);
          this.ngAfterViewInit()
        })
        collectionSnapshots(query(collection(this.firestore,"atcmodel level config"),orderBy('level'))).pipe(takeUntil(this.subscription)).subscribe(docdata => {
          let documet = docdata.map(doc=>({id:doc.id,...doc.data()}))
          this.configuration = documet
          this.atcModelList = Array.from(new Set(documet.map(e => e['atcmodel'])));
          this.configuration.forEach(item => {
            this.maplevel[item['level'].id] =  item
          })
        })
        // this.firestore.collection('profile_data').get().toPromise().then(res => {
        //   for (let j = 0; j< res.docs.length; j++) {
        //     const element = res.docs[j].data();
        //     this.mapparticipant[element['profileid']] = element['name']
        //   }
        // })
        getDocs(collection(this.firestore,"biglevel")).then(docData => {
          for (let k = 0; k < docData.docs.length; k++) {
            const element = docData.docs[k].data();
            this.maplevels[element['docid']] = element['level']
          }
        })
        getDocs(collection(this.firestore,"bigactivity")).then(docdata => {
          for (let k = 0; k < docdata.docs.length; k++) {
            const element = docdata.docs[k].data();
            this.mapBigActivity[element['docid']] = element['activity']
          }
        })
      // }
      
    })
   }

  ngOnInit(): void {
    collectionSnapshots(query(collection(this.firestore,"biglevel"),orderBy("level"))).pipe(takeUntil(this.subscription)).subscribe(list=>{
      this.levelList = list.map(doc=>({id:doc.id,...doc.data()}))
    })
    this.aggregateForm.valueChanges.subscribe(() => {
      this.onatcselect();
    });
    this.dataSource.filterPredicate = this.customfilter()
  }

  ngAfterViewInit(){
    this.dataSource.data = this.participantaggregateList
    this.dataSource.sort = this.sort
    this.dataSource.paginator = this.paginator
    this.onFilter()
  }

  ngOnDestroy(){
    this.subscription.next();
    this.subscription.complete();
    this.dataSource.filterPredicate = this.customfilter()
  }

  onSearchText(type){
    let value = ![null,undefined].includes(this.filterText) ? this.filterText.toLowerCase().trim() : ""
    if(type === 'participant'){
      return this.filteredProfilelist = this.profilelist.filter( e => e.name.toLowerCase().indexOf(value) ===  0)
    }else{
      return this.filteredQueueList = this.queueList.filter(e => e['queuename'].toLowerCase().indexOf(value) === 0)
    }
  }

  returnFilterClient(){
    return this.participantList.filter(e => e.name && e.name.toLowerCase().includes(this.filteredClient?.toLowerCase() || ''));
  }
  
  // ApplyFilter(event : Event){
  //   const filterValue = (event.target as HTMLInputElement).value
  //   this.dataSource.filterPredicate = (data: any, filter: string) => {
  //     const participantName = this.mapparticipant[data.profileid];
  //     return participantName.toLowerCase().includes(filter);
  //   };
  
  //   this.dataSource.filter = filterValue;
  //   this.dataSource.filter = filterValue.trim().toLowerCase()
  // }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filter);
    this.filterPerAtcmodel();
    this.mapActivityByParticipant();
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['participant'].length != 0 ? value['participant'].includes(e['profileid']) : true) &&
      (value['atcmodel'].length != 0 ? value['atcmodel'].includes(e['atcmodel']) : true) &&
      (value['event'].length != 0 ? value['event'].includes(e['queueid']) : true)
    }
    return (data: any, filter: string) => {
      let result = filterFunction(data, filter);
      return result
    };
  }

  onClearFilter(){
    this.filter = {
      participant:[],
      atcmodel:[],
      event:[]
    }
    this.onFilter()
  }

  filterPerAtcmodel(){
    return this.atcModelLevelup =  (this.dataSource.filteredData || this.dataSource.data).reduce((r,a) => {
      r[a['atcmodel']] = r[a['atcmodel']] || 0
      r[a['atcmodel']] = r[a['atcmodel']] + 1
      return r
    },{})
  }

  mapActivityByParticipant(){
    this.mapActivityPerParticipant = {}
    this.totalActivityCount = 0
    for (let i = 0; i < (this.dataSource.filteredData || this.dataSource.data).length; i++) {
      const element:any = (this.dataSource.filteredData || this.dataSource.data)[i];
      for (const key in element) {
        if(['specialactivity','boosteractivity','regular','warmup'].includes(key)){
          for (let j = 0; j < (element[key] || []).length; j++) {
            const activityelement = element[key][j];
            this.mapActivityPerParticipant[element['profileid']] = (this.mapActivityPerParticipant[element['profileid']] || {})
            this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || {})
            this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] || 0) + (activityelement['completed'] || 0)
            this.totalActivityCount = (this.totalActivityCount || 0) + (activityelement['completed'] || 0)
          }
        }else if(key === 'fasttrack'){
          for (let j = 0; j < (element[key] || []).length; j++) {
            const fasttrackelement = element[key][j];
            fasttrackelement['stabilization'].forEach((e:any) => {
              this.mapActivityPerParticipant[element['profileid']] = (this.mapActivityPerParticipant[element['profileid']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] || 0) + (e['completed'] || 0)
              this.totalActivityCount = (this.totalActivityCount || 0) + (e['completed'] || 0)
            });
            fasttrackelement['validation'].forEach((e:any) => {
              this.mapActivityPerParticipant[element['profileid']] = (this.mapActivityPerParticipant[element['profileid']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']][element['queueid']] || 0) + (e['completed'] || 0)
              this.totalActivityCount = (this.totalActivityCount || 0) + (e['completed'] || 0)
            });
          }
        }
      }
    }
  }

  onatcselect() {
    this.selectedParticipant = this.aggregateForm.get('participant').value;
    this.selectedATCModel = this.aggregateForm.get('atcmodel').value;
    // console.log(this.selectedATCModel);
    // console.log(this.selectedParticipant);
    if (this.selectedParticipant && this.selectedATCModel) {
      var documentcheck  =  this.participantaggregateList.some(e =>  e.atcmodel.replace(/\s+/g, ' ').trim() === this.selectedATCModel.replace(/\s+/g, ' ').trim() && e.profileid === this.selectedParticipant)
      // console.log(documentcheck);
      this.crossmatch = documentcheck
      this.crossmatcherrormessage = documentcheck ? "Document Already exists for this ATCmodel": false
    }
  }


  onlevelselect(){
    const selectedATCModel = this.aggregateForm.get('atcmodel').value;
    const selectedlevel = this.aggregateForm.get("level").value;
    this.configurationcheck = !this.configuration.some(e => e.level.id === selectedlevel && e.atcmodel && e.atcmodel.replace(/\s+/g, ' ').trim() === selectedATCModel.replace(/\s+/g, ' ').trim())
    // console.log(this.configurationcheck);
    this.configurationerrormessage = this.configurationcheck ? "level doesn't have configuration.please set configuration": false
  } 

  async submit(){
    var value = this.aggregateForm.value
    // console.log(value);
    if(this.aggregateForm.valid){
      this.loading = true
      const selectedlevel = value.level;
      // console.log(selectedlevel);
      let configdata = this.maplevel[selectedlevel]['metrics'] 
      let level = this.maplevel[selectedlevel]['level']
      let regular = configdata.map(e => e['completed'] = 0)
      // console.log(configdata);
      let id = doc(collection(this.firestore,'big aggregate event level')).id
      // console.log(id);
      var data = {
        atcmodel : value.atcmodel,
        profileid : value.participant,
        id : id,
        level : level,
        regular : configdata,
        lastupdated : new Date()
      }
      // console.log(data);
      
      await setDoc(doc(this.firestore,"big aggregate event level",id),data)
      this.loading = false
      this.aggregateForm.reset()
    }
  }

  // openDeleteDialog(id:any) {
  //   this.dialog.open(DeleteBigAggregateComponent, {
  //     data: {
  //       id : id,
  //     }
  //   })
  // }

}
