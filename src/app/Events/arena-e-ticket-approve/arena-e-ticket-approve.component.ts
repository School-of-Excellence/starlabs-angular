import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { collection, doc, Firestore, getDocs, orderBy, query, collectionData , where,updateDoc,setDoc,arrayUnion} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, takeUntil } from 'rxjs';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-arena-e-ticket-approve',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    CommonModule,
    MatSelectModule,
    NgxMatSelectSearchModule,
    MatTableModule,
    MatSlideToggleModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    ProfilePictureComponent
  ],
  templateUrl: './arena-e-ticket-approve.component.html',
  styleUrl: './arena-e-ticket-approve.component.css'
})
export class ArenaETicketApproveComponent {
  displayedColumns: string[] = ["profileid","eventdate","eventref","productref","venuefee","contract","action","active"];
  dataSource: MatTableDataSource<any> = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  mapEvents = {}
  selectedEvent = null

  mapProfile = {}
  mapArenaETicket = {}
  mapEligibility = {}

  mapProducts={}
  filterForm = {
    profileid:null,
    event:[]
  }
  filterText= ""
  profileList = []
  filterEvent = ""
  eventList = []

  private destroy$ = new Subject<void>()
  private firestore = inject(Firestore)
  constructor(){
    const eventCollRef = collection(this.firestore,"event collection")
    const eventCollQuery = query(eventCollRef,orderBy("end_date","desc"))
    getDocs(eventCollQuery).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i];
        const elementData = snap.docs[i].data()
        this.mapEvents[element.id] = elementData
        elementData['docid'] = element.id
        this.eventList.push(elementData)
      }
    })

    const profileDataCollRef = collection(this.firestore,"profile_data")
    getDocs(profileDataCollRef).then((snap) => {
      for (let i = 0; i < snap.docs.length; i++) {
        const elementData = snap.docs[i].data()
        this.mapProfile[elementData['profileid']] = elementData
        this.profileList.push(elementData)
      }
    })

    const productsCollRef = collection(this.firestore,"products")
    getDocs(productsCollRef).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProducts[element['id']] = element
      }
    })

  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = this.customfilter()
  }

  ngOnDestroy(){
    this.destroy$.next()
    this.destroy$.complete()
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filterForm)
  }

  filterProfile(){
    let filterValue = this.filterText != null && this.filterText != "" ? this.filterText.trim().toLowerCase() : ""
    return this.profileList.filter(e => e['name'] != undefined ?  e['name'].trim().toLowerCase().includes(filterValue) : false)
  }
  
  filterEvents(){
    let filterValue = this.filterEvent != null && this.filterEvent != "" ? this.filterEvent.trim().toLowerCase() : ""
    return this.eventList.filter(e => e['name'] != undefined ? e['name'].trim().toLowerCase().includes(filterValue) : false)
  }
  
  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['profileid'] != null ? (e['profileid'] === value['profileid']) : true) && 
            (value['event'].length != 0 ? (value['event'].includes(e['eventref']?.id)) : true)
            // (value['productid'].length != 0 ? (value['productid'].includes(e['productref'].id)) : true)
    }
    return filterFunction;
  }

  onEventSelect(){
    let eventRef = doc(this.firestore,"event collection",this.selectedEvent)

    const eventPartReqCollRef = collection(this.firestore,"event participation request")
    const eventPartReqQuery = query(eventPartReqCollRef,where("eventref","==",eventRef),where("status","==","approved"))
    collectionData(eventPartReqQuery).pipe(takeUntil(this.destroy$)).subscribe(eventParticipationSnap => {
      this.dataSource.data = eventParticipationSnap
      this.ngAfterViewInit()
    })

    const arenaETicketCollRef = collection(this.firestore,"arena e-ticket")
    const arenaETicketQuery = query(arenaETicketCollRef,where("eventref","==",eventRef))
    collectionData(arenaETicketQuery).pipe(takeUntil(this.destroy$)).subscribe(eticketsnap => {
      for (let i = 0; i < eticketsnap.length; i++) {
        const element = eticketsnap[i];
        this.mapArenaETicket[element['profileid']] = element
      }
    })

    // e-ticket eligibility (mirrored from Watson) — keyed per EPR by eventparticipationid
    const eligibilityCollRef = collection(this.firestore,"e-ticket eligibility")
    const eligibilityQuery = query(eligibilityCollRef,where("eventid","==",this.selectedEvent))
    collectionData(eligibilityQuery).pipe(takeUntil(this.destroy$)).subscribe(eligibilitysnap => {
      this.mapEligibility = {}
      for (let i = 0; i < eligibilitysnap.length; i++) {
        const element = eligibilitysnap[i];
        this.mapEligibility[element['eventparticipationid']] = element
      }
    })
  }

  // Venue fee column — exempted / paid / not paid, from the e-ticket eligibility mirror
  getVenueFeeStatus(row:any):string{
    const eligibility = this.mapEligibility[row['docid']]
    if([null,undefined].includes(eligibility)){
      return '—'
    }
    if(eligibility['exempted'] === true){
      return 'Exempted'
    }
    return eligibility['venue_fee_paid'] === true ? 'Paid' : 'Not paid'
  }

  // Contract column — zohostatus from the e-ticket eligibility mirror
  getContractStatus(row:any):string{
    const eligibility = this.mapEligibility[row['docid']]
    if([null,undefined].includes(eligibility) || [null,undefined,''].includes(eligibility['zohostatus'])){
      return '—'
    }
    return eligibility['zohostatus']
  }

  // Approve is allowed only when the participant's e-ticket eligibility says either:
  //   1. exempted === true, OR
  //   2. venue_fee_paid === true AND zohostatus === 'completed'
  canApprove(row:any):boolean{
    const eligibility = this.mapEligibility[row['docid']]
    if([null,undefined].includes(eligibility)){
      return false
    }
    if(eligibility['exempted'] === true){
      return true
    }
    return eligibility['venue_fee_paid'] === true && eligibility['zohostatus'] === 'completed'
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  onToggle(event:any,row:any){
    updateDoc(doc(this.firestore,"arena e-ticket",this.mapArenaETicket[row['profileid']]['docid']),{
      active:event.checked
    })
  }

  onSubmit(row:any){
    console.log(row)
    if(confirm("Are you sure ?")){
      if([null, undefined].includes(this.mapArenaETicket[row['profileid']])){
        let products = []
        products.push(row['productref'].id)
        let docid = doc(collection(this.firestore,"arena e-ticket")).id
        let eventParticipationRef = doc(this.firestore,"event participation request",row['docid'])
        setDoc(doc(this.firestore,"arena e-ticket",docid),{
          createddate:new Date(),
          docid:docid,
          eventparticipationref:eventParticipationRef,
          eventref:row['eventref'],
          producteligible:products,
          profileid:row['profileid'],
          active:true,
          eventstartdate:this.mapEvents[this.selectedEvent]['start_date']?.toDate(),
          eventenddate:this.mapEvents[this.selectedEvent]['end_date']?.toDate()
        })
      }else{
        let products = this.mapArenaETicket[row['profileid']]['producteligible'] || []
        products.push(row['productref'].id)
        updateDoc(doc(this.firestore,"arena e-ticket",this.mapArenaETicket[row['profileid']]['docid']),{
          producteligible:products
        })
      }
    }
  }

  onProductAppend(row:any){
    if(confirm("Are you sure ?")){
      updateDoc(doc(this.firestore,"arena e-ticket",this.mapArenaETicket[row['profileid']]['docid']),{
        producteligible: arrayUnion(row['productref'].id)
      })
    }
  }
}
