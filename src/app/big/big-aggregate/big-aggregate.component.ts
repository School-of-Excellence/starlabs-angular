import { Component, inject, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { collection, collectionData, doc, Firestore, getDocs, orderBy, query, setDoc } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';

@Component({
  selector: 'app-big-aggregate',
  imports: [
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatInputModule,
    MatSelectModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './big-aggregate.component.html',
  styleUrl: './big-aggregate.component.css'
})
export class BigAggregateComponent {
  aggregateForm : FormGroup 

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;

  dragDisabled = true;
  // 'levelupcount'
  displayedColumns: string[] = ['participant', 'atcmodel', 'currentlevel', 'specialactivity', 'boosteractivity', 'fasttrack', 'regular', 'warmup'];
  dataSource = new MatTableDataSource();
  atcModelLevelup = {}

  participantList = []
  atcModelList = []
  name : any
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

  filter:any = {
    participant:[],
    atcmodel:[],
  }
  profilelist = []
  filterText
  filteredProfilelist
  mapActivityPerParticipant = {}
  totalActivityCount = 0
  
  private firestore = inject(Firestore)
  private destroy$ = new Subject<void>()
  constructor( 
    public formbuilder: FormBuilder,
    public guard: AuthguardService, 
    public dialog:MatDialog
  ) 
  {
    this.aggregateForm = this.formbuilder.group ({
      participant: [, {validators: [Validators.required], updateOn:"change"}],
      atcmodel:[,{validators: [Validators.required], updateOn:"change"}],
      level:[,{validators: [Validators.required], updateOn:"change"}],
    })
    
    getDocs(collection(this.firestore,"profile_data")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        this.participantList.push(snap.docs[i].data())
        this.mapparticipant[snap.docs[i].id] = snap.docs[i].data()['name']
      }
      this.profilelist = snap.docs.map(e => e.data())
      this.filteredProfilelist = this.profilelist
    })

    collectionData(query(collection(this.firestore,"big aggregate level"),orderBy('atcmodel'))).pipe(takeUntil(this.destroy$))
    .subscribe(snap => {
      this.participantaggregateList = snap
      this.ngAfterViewInit()
    })

    collectionData(query(collection(this.firestore,"atcmodel level config"),orderBy('level'))).pipe(takeUntil(this.destroy$))
    .subscribe(doc => {
      this.configuration = doc
      this.atcModelList = Array.from(new Set(doc.map(e => e['atcmodel'])));
      this.configuration.forEach(item => {
        this.maplevel[item['level'].id] =  item
      })
    })

    getDocs(collection(this.firestore,'biglevel')).then(doc => {
      for (let k = 0; k < doc.docs.length; k++) {
        const element = doc.docs[k].data();
        this.maplevels[element['docid']] = element['level']
      }
    })

    getDocs(collection(this.firestore,"bigactivity")).then(doc => {
      for (let k = 0; k < doc.docs.length; k++) {
        const element = doc.docs[k].data();
        this.mapBigActivity[element['docid']] = element['activity']
      }
    })

    collectionData(query(collection(this.firestore,"biglevel"),orderBy("level"))).pipe(takeUntil(this.destroy$))
    .subscribe(list=>{
      this.levelList = list
    })
      
  }

  ngOnInit(): void {
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
    this.destroy$.next()
    this.destroy$.complete()
  }

  onSearchText(type:string){
    let value = ![null,undefined].includes(this.filterText) ? this.filterText.toLowerCase().trim() : ""
    if(type === 'participant'){
      return this.filteredProfilelist = this.profilelist.filter( e => e.name.toLowerCase().indexOf(value) ===  0)
    }else{
      return [];
    }
  }

  returnFilterClient(){
    return this.participantList.filter(e => e.name && e.name.toLowerCase().includes(this.filteredClient?.toLowerCase() || ''));
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filter)
    this.filterPerAtcmodel();
    this.mapActivityByParticipant()
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['participant'].length != 0 ? value['participant'].includes(e['profileid']) : true) &&
      (value['atcmodel'].length != 0 ? value['atcmodel'].includes(e['atcmodel']) : true)
    }
    return (data: any, filter: string) => {
      let result = filterFunction(data, filter);
      return result
    };
  }

  onClearFilter(){
    this.filter = {
      participant:[],
      atcmodel:[]
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
            this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || 0) + (activityelement['completed'] || 0)
            this.totalActivityCount = (this.totalActivityCount || 0) + (activityelement['completed'] || 0)
          }
        }else if(key === 'fasttrack'){
          for (let j = 0; j < (element[key] || []).length; j++) {
            const fasttrackelement = element[key][j];
            fasttrackelement['stabilization'].forEach((e:any) => {
              this.mapActivityPerParticipant[element['profileid']] = (this.mapActivityPerParticipant[element['profileid']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || 0) + (e['completed'] || 0)
              this.totalActivityCount = (this.totalActivityCount || 0) + (e['completed'] || 0)
            });
            fasttrackelement['validation'].forEach((e:any) => {
              this.mapActivityPerParticipant[element['profileid']] = (this.mapActivityPerParticipant[element['profileid']] || {})
              this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] = (this.mapActivityPerParticipant[element['profileid']][element['atcmodel']] || 0) + (e['completed'] || 0)
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
    if (this.selectedParticipant && this.selectedATCModel) {
      var documentcheck  =  this.participantaggregateList.some(e =>  e.atcmodel.replace(/\s+/g, ' ').trim() === this.selectedATCModel.replace(/\s+/g, ' ').trim() && e.profileid === this.selectedParticipant)
      this.crossmatch = documentcheck
      this.crossmatcherrormessage = documentcheck ? "Document Already exists for this ATCmodel": false
    }
  }


  onlevelselect(){
    const selectedATCModel = this.aggregateForm.get('atcmodel').value;
    const selectedlevel = this.aggregateForm.get("level").value;
    this.configurationcheck = !this.configuration.some(e => e.level.id === selectedlevel && e.atcmodel && e.atcmodel.replace(/\s+/g, ' ').trim() === selectedATCModel.replace(/\s+/g, ' ').trim())
    this.configurationerrormessage = this.configurationcheck ? "level doesn't have configuration.please set configuration": false
  } 

  async submit(){
    var value = this.aggregateForm.value
    if(this.aggregateForm.valid){
      this.loading = true
      const selectedlevel = value.level;
      let configdata = this.maplevel[selectedlevel]['metrics'] 
      let level = this.maplevel[selectedlevel]['level']
      let regular = configdata.map(e => e['completed'] = 0)
      let id = doc(collection(this.firestore,"big aggregate level")).id
      var data = {
        atcmodel : value.atcmodel,
        profileid : value.participant,
        id : id,
        level : level,
        regular : configdata,
        lastupdated : new Date()
      }

      await setDoc(doc(this.firestore,"big aggregate level",id),data)
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
