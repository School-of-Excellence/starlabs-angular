import { Component, inject, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTable, MatTableDataSource, MatTableModule } from '@angular/material/table';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AuthguardService } from '../../authguard.service';
import { Firestore,collection,collectionData,doc,getDocs, query, where } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-event-attendance-log',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    NgxMatSelectSearchModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule
  ],
  providers:[
    provideNativeDateAdapter()
  ],
  templateUrl: './event-attendance-log.component.html',
  styleUrl: './event-attendance-log.component.css'
})
export class EventAttendanceLogComponent {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort, {static: true}) sort: MatSort;
  @ViewChild('table', {static: true}) table: MatTable<any>;
  dragDisabled = true;
  displayedColumns: string[] = ['participant', 'product', 'logdate'];
  dataSource = new MatTableDataSource();
  mapparticipant: any = {}
  attendenceList: unknown[];
  mapproduct: any = {}
  selectedevent : any
  mapEvents: any = {};
  eventList :any = []
  showtable : boolean = false
  filter: any;
  events: any = [];
  startDate : Date
  endDate : Date
  filteredDataSource: string[] = [];
  participants: number;
  // filter variables
  profileDataList = []
  productList = []
  form : FormGroup
  filterText = ""
  filterProduct = ""
  uniqueParticipantList = []

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(
    public guard: AuthguardService, 
    private formbuilder : FormBuilder
  ) 
  {
    this.form = this.formbuilder.group ({
      profileid:[,],
      product:[[],],
      range:new FormGroup({
        start: new FormControl(),
        end: new FormControl()
      })
    })

    getDocs(collection(this.firestore,"profile_data")).then(res => {
      for (let j = 0; j< res.docs.length; j++) {
        const element = res.docs[j].data();
        this.profileDataList.push(element)
        this.mapparticipant[element['profileid']] = element['name']
      }
    })

    getDocs(collection(this.firestore,"products")).then(snapshot => {
      for (let k = 0; k< snapshot.docs.length; k++) {
        const product = snapshot.docs[k].data();
        this.productList.push(product)
        this.mapproduct[product['id']] = product['product']
      }
    })

    getDocs(collection(this.firestore,"event collection")).then(snapshot => {
      for (let j = 0; j < snapshot.docs.length; j++) {
        const element = snapshot.docs[j];
        const elementData = snapshot.docs[j].data()
        this.mapEvents[element.id] = elementData
        elementData['docid'] = element.id
        this.events.push(elementData)
      }
    })
        
  }

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => {
      this.onFilter()
    });

    this.dataSource.filterPredicate = this.customfilter()
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  onEventSelected(){
    this.showtable = true
    console.log(this.selectedevent);
    collectionData(query(collection(this.firestore,"arena e-ticket log"),
     where('eventref', '==', doc(this.firestore,'event collection', this.selectedevent))
    )).pipe(takeUntil(this.destroy$)).subscribe(list=>{
      this.dataSource.data = list
      this.dataSource.sort = this.sort
      this.dataSource.paginator = this.paginator
      this.participants = list.length
      this.onFilter()
    })
     
  } 

  onProfileFilter(){
    return this.profileDataList.filter(e => e.name != undefined ? e.name.toLowerCase().indexOf(this.filterText) === 0 : false)
  }

  onProductFilter(){
    return this.productList.filter(e => e.product.toLowerCase().indexOf(this.filterProduct) === 0)
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.form.value)
    var profileList = this.dataSource.filteredData.map(e => e["profileid"])
    this.uniqueParticipantList = Array.from(new Set(profileList))
  }

  onResetForm(){
    this.form.patchValue({
      profileid:null,
      product:[],
      range:{
        start:null,
        end:null
      }
    })
  }

  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['profileid'] != null ? (e['profileid'] === value['profileid']) : true) && 
            (value['product'].length != 0 ? (value['product'].includes(e['product']?e['product'].id:null)) : true) &&
            (!Object.values(value.range).includes(null) ? (e['logdate'].toDate() > new Date(new Date(value.range['start']).setHours(0,0,0,0)) && e['logdate'].toDate() < new Date(new Date(value.range['end']).setHours(23,59,59,59))) : true)
    }
    return filterFunction;
  }

  returnFilterEvent(){
    return this.events.filter((e:any) => e.name && e.name.toLowerCase().includes(this.filter?.toLowerCase() || ""))
  }
}
