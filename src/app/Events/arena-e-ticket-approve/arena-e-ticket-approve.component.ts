import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, TemplateRef, ViewChild } from '@angular/core';
import { collection, doc, Firestore, getDocs, orderBy, query, collectionData , where,updateDoc,setDoc,arrayUnion,writeBatch} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule} from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, takeUntil } from 'rxjs';
import { SelectionModel } from '@angular/cdk/collections';
import * as XLSX from 'xlsx';
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
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatDialogModule,
    MatTooltipModule,
    ProfilePictureComponent
  ],
  templateUrl: './arena-e-ticket-approve.component.html',
  styleUrl: './arena-e-ticket-approve.component.css'
})
export class ArenaETicketApproveComponent {
  displayedColumns: string[] = ["select","profileid","eventdate","eventref","productref","venuefee","contract","action","active"];
  dataSource: MatTableDataSource<any> = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('importSummaryDialog') importSummaryDialog: TemplateRef<any>;

  mapEvents = {}
  selectedEvent = null
  loading = false
  selection = new SelectionModel(true,[]);
  approving = false
  importing = false

  mapProfile = {}
  mapArenaETicket = {}
  mapEligibility = {}
  mapEmailToProfileid = {}
  notFoundParticipants: {name:string, email:string}[] = []
  notEligibleParticipants: {name:string, email:string}[] = []
  importSelectedParticipants: {name:string, email:string}[] = []

  mapProducts={}
  filterForm = {
    profileids:[],
    productids:[],
    cards:{venue:null, contract:null, eticket:null}
  }
  // Active summary-card filter (one at a time); null = no card filter
  activeCards: {venue: string|null, contract: string|null, eticket: string|null} = {venue:null, contract:null, eticket:null}
  // Counts shown in the top summary cards, recomputed whenever the event data changes
  summary = {
    total:0,
    venuePaid:0, venueNotPaid:0,
    contractSigned:0, contractNotSigned:0,
    eticketApproved:0, eticketNotApproved:0
  }
  filterText= ""
  profileList = []
  productList = []
  filterProductText = ""
  selectEventSearch = ""
  eventList = []

  private destroy$ = new Subject<void>()
  private eventChange$ = new Subject<void>()
  private firestore = inject(Firestore)
  private dialog = inject(MatDialog)
  private cdr = inject(ChangeDetectorRef)
  constructor(){
    const eventCollRef = collection(this.firestore,"event collection")
    const eventCollQuery = query(eventCollRef,orderBy("start_date","desc"))
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
        if(elementData['email']){
          this.mapEmailToProfileid[elementData['email'].toString().trim().toLowerCase()] = elementData['profileid']
        }
      }
    })

    const productsCollRef = collection(this.firestore,"products")
    getDocs(productsCollRef).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapProducts[element['id']] = element
        this.productList.push(element)
      }
    })

  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = this.customfilter()
    // Sort the "Name" column by the resolved participant name, not the raw profileid
    this.dataSource.sortingDataAccessor = (row:any, column:string) => {
      if(column === 'profileid'){
        return (this.mapProfile[row['profileid']]?.['name'] || '').toString().trim().toLowerCase()
      }
      const value = row[column]
      return typeof value === 'string' ? value.toLowerCase() : value
    }
  }

  ngOnDestroy(){
    this.eventChange$.next()
    this.eventChange$.complete()
    this.destroy$.next()
    this.destroy$.complete()
  }

  onFilter(){
    this.dataSource.filter = JSON.stringify(this.filterForm)
  }

  clearProfileFilter(event?:Event){
    event?.stopPropagation()
    this.filterForm.profileids = []
    this.onFilter()
  }

  clearProductFilter(event?:Event){
    event?.stopPropagation()
    this.filterForm.productids = []
    this.onFilter()
  }

  filterProfile(){
    let filterValue = this.filterText != null && this.filterText != "" ? this.filterText.trim().toLowerCase() : ""
    return this.profileList.filter(e => e['name'] != undefined ?  e['name'].trim().toLowerCase().includes(filterValue) : false)
  }

  filterProduct(){
      let filterValue = this.filterProductText != null && this.filterProductText != "" ? this.filterProductText.trim().toLowerCase() : ""
      return this.productList.filter(e => e['product'] != undefined ? e['product'].trim().toLowerCase().includes(filterValue) : false)
  }
  
  // Search list for the "Select Event" dropdown — eventList is already sorted by start_date (desc)
  filterSelectEvents(){
    let filterValue = this.selectEventSearch != null && this.selectEventSearch != "" ? this.selectEventSearch.trim().toLowerCase() : ""
    return this.eventList.filter(e => e['name'] != undefined ? e['name'].trim().toLowerCase().includes(filterValue) : false)
  }
  
  public customfilter():(data:any,filter:string)=> boolean{
    let filterFunction = (data:any, filter:any):boolean => {
      let e = data
      let value = JSON.parse(filter);
      return (value['profileids'] && value['profileids'].length != 0 ? value['profileids'].includes(e['profileid']) : true) &&
      (value['productids'] && value['productids'].length != 0 ? value['productids'].includes(e['productref']?.id) : true) &&
      this.matchesCard(e, value['cards'])
    }
    return filterFunction;
  }

  // --- Summary-card classification (mirrors the table columns exactly) ---
  isVenuePaid(row:any):boolean{ return this.getVenueFeeStatus(row) === 'Paid' }
  isContractSigned(row:any):boolean{ return this.getContractStatus(row) === 'completed' }
  isETicketApproved(row:any):boolean{ return this.mapArenaETicket[row['profileid']] != undefined }

  private matchesCard(row:any, cards:{venue:string|null, contract:string|null, eticket:string|null}):boolean{
    const venueClick = cards.venue === null ? true: cards.venue === 'venue_paid' ? this.isVenuePaid(row) : !this.isVenuePaid(row)
    const contractClick = cards.contract === null ? true: cards.contract === 'contract_signed' ? this.isContractSigned(row) : !this.isContractSigned(row)
    const eticketClick = cards.eticket === null ? true: cards.eticket === 'eticket_approved' ? this.isETicketApproved(row) : !this.isETicketApproved(row)
    return venueClick && contractClick && eticketClick
  }

  computeSummary(){
    const rows = this.dataSource.data || []
    let venuePaid=0, contractSigned=0, eticketApproved=0
    for(const row of rows){
      if(this.isVenuePaid(row)) venuePaid++
      if(this.isContractSigned(row)) contractSigned++
      if(this.isETicketApproved(row)) eticketApproved++
    }
    const total = rows.length
    this.summary = {
      total,
      venuePaid, venueNotPaid: total - venuePaid,
      contractSigned, contractNotSigned: total - contractSigned,
      eticketApproved, eticketNotApproved: total - eticketApproved
    }
  }

  // Click a summary card to filter the table by that bucket; click the active one to clear
  toggleCard(card:string){
    const group = card.split('_')[0] as 'venue'|'contract'|'eticket'
    this.activeCards[group] = this.activeCards[group] === card ? null : card
    this.filterForm.cards = {...this.activeCards}
    this.onFilter()
}

  onEventSelect(){
    // Tear down the previously selected event's live subscriptions and reset per-event state
    // so the old event's data no longer flows into the table/maps after switching events.
    this.eventChange$.next()
    this.mapArenaETicket = {}
    this.mapEligibility = {}
    this.dataSource.data = []
    this.loading = true
    this.selection.clear()
    this.activeCards = {venue:null, contract:null, eticket:null}
    this.filterForm.cards = {venue:null, contract:null, eticket:null}
    this.computeSummary()

    let eventRef = doc(this.firestore,"event collection",this.selectedEvent)

    const eventPartReqCollRef = collection(this.firestore,"event participation request")
    const eventPartReqQuery = query(eventPartReqCollRef,where("eventref","==",eventRef),where("status","==","approved"))
    collectionData(eventPartReqQuery).pipe(takeUntil(this.eventChange$),takeUntil(this.destroy$)).subscribe(eventParticipationSnap => {
      this.dataSource.data = eventParticipationSnap
      this.loading = false
      this.computeSummary()
      // paginator/sort live inside the *ngIf="!loading" block — wire them after the
      // table has rendered, otherwise the @ViewChild refs are still undefined here.
      setTimeout(() => this.ngAfterViewInit())
    })

    const arenaETicketCollRef = collection(this.firestore,"arena e-ticket")
    const arenaETicketQuery = query(arenaETicketCollRef,where("eventref","==",eventRef))
    collectionData(arenaETicketQuery).pipe(takeUntil(this.eventChange$),takeUntil(this.destroy$)).subscribe(eticketsnap => {
      this.mapArenaETicket = {}
      for (let i = 0; i < eticketsnap.length; i++) {
        const element = eticketsnap[i];
        this.mapArenaETicket[element['profileid']] = element
      }
      this.computeSummary()
      this.onFilter()
    })

    // e-ticket eligibility (mirrored from Watson) — keyed per EPR by eventparticipationid
    const eligibilityCollRef = collection(this.firestore,"e-ticket eligibility")
    const eligibilityQuery = query(eligibilityCollRef,where("eventid","==",this.selectedEvent))
    collectionData(eligibilityQuery).pipe(takeUntil(this.eventChange$),takeUntil(this.destroy$)).subscribe(eligibilitysnap => {
      this.mapEligibility = {}
      for (let i = 0; i < eligibilitysnap.length; i++) {
        const element = eligibilitysnap[i];
        this.mapEligibility[element['eventparticipationid']] = element
      }
      this.computeSummary()
      this.onFilter()
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
  isProfileEligible(profileid:string):boolean{
    const rows = (this.dataSource.data || []).filter(r => r['profileid'] === profileid)
    return rows.some(r => this.canApprove(r))
  }

  isRowSelectable(row:any):boolean{
    const ticket = this.mapArenaETicket[row['profileid']]
    const alreadyHasProduct = ticket != undefined && ticket['producteligible']?.includes(row['productref']?.id)
    return !alreadyHasProduct && this.isProfileEligible(row['profileid'])
  }
  // Passive count — rows currently visible in the filtered table that cannot be selected/approved
  get notEligibleCount():number{
      return (this.dataSource.filteredData || []).filter(row => !this.isRowSelectable(row)).length
  }
  get selectedParticipantCount():number{
      const uniqueProfileIds = new Set(this.selection.selected.map(row => row['profileid']))
      return uniqueProfileIds.size
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

  importParticipant(){
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.xls,.xlsx'
    fileInput.addEventListener('change', (event:any) => {
      const files:FileList = event.target.files
      if(files && files.length){
        const file = files[0]
        this.importing = true
        this.cdr.detectChanges()
        const reader = new FileReader()
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result as ArrayBuffer)
          const workbook = XLSX.read(data, {type:'array'})
          const worksheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {header:1})
          const excelEmails:string[] = []
          jsonData.forEach((row:any[], index) => {
            if(index > 0 && row[1]){
              excelEmails.push(row[1].toString().trim().toLowerCase())
            }
          })
          const rowsByProfile:{[profileid:string]:any[]} = {}
          for(const row of (this.dataSource.data || [])){
            rowsByProfile[row['profileid']] = rowsByProfile[row['profileid']] || []
            rowsByProfile[row['profileid']].push(row)
          }
          this.notFoundParticipants = []
          this.notEligibleParticipants = []
          this.importSelectedParticipants = []
          for(const email of excelEmails){
            const profileid = this.mapEmailToProfileid[email]
            const matchedRows = profileid ? (rowsByProfile[profileid] || []) : []
            const name = this.mapProfile[profileid]?.['name'] || ''
            if(matchedRows.length == 0){
              this.notFoundParticipants.push({name, email})
              continue
            }
            let anySelectable = false
            for(const row of matchedRows){
              if(this.isRowSelectable(row) && !this.selection.isSelected(row)){
                this.selection.select(row)
                anySelectable = true
              }
            }
            if(anySelectable){
              this.importSelectedParticipants.push({name, email})
            }else if(!matchedRows.some(row => this.selection.isSelected(row))){
              this.notEligibleParticipants.push({name, email})
            }
          }
          this.importing = false
          this.cdr.detectChanges()
          if(this.importSummaryDialog){
            this.dialog.open(this.importSummaryDialog, {width:'520px', autoFocus:false})
          }
        }
        reader.readAsArrayBuffer(file)
      }
    })
    fileInput.click()
  }

  downloadSampleExcel(){
    const sample = [{ name:'John Doe', email:'johndoe@example.com' }]
    const worksheet = XLSX.utils.json_to_sheet(sample)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample')
    XLSX.writeFile(workbook, 'Sample.xlsx')
  }

  dismissImportPanel(){
    this.notFoundParticipants = []
    this.notEligibleParticipants = []
    this.importSelectedParticipants = []
  }

  onProductAppend(row:any){
    if(confirm("Are you sure ?")){
      updateDoc(doc(this.firestore,"arena e-ticket",this.mapArenaETicket[row['profileid']]['docid']),{
        producteligible: arrayUnion(row['productref'].id)
      })
    }
  }

  async bulkApprove(){
    if(this.selection.selected.length == 0) return
    if(!confirm(`Approve ${this.selection.selected.length} participant(s) ?`)) return

    // Group selected rows by profileid, collecting each profile's distinct product ids
    const grouped:{[profileid:string]:{rows:any[], productids:string[]}} = {}
    for(const row of this.selection.selected){
      const pid = row['profileid']
      grouped[pid] = grouped[pid] || {rows:[], productids:[]}
      grouped[pid].rows.push(row)
      grouped[pid].productids.push(row['productref'].id)
    }
    this.approving = true
    const profileIds = Object.keys(grouped)
    const chunkSize = 50
    const chunkDelayMs = 5000
    const chunks:string[][] = []
    for(let i = 0; i < profileIds.length; i += chunkSize){
      chunks.push(profileIds.slice(i, i + chunkSize))
    }

    let succeeded = 0
    let failed = 0

    for(let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++){
      const chunk = chunks[chunkIdx]
      const batch = writeBatch(this.firestore)

      for(const pid of chunk){
        const group = grouped[pid]
        const existingTicket = this.mapArenaETicket[pid]
        let ticketRef
        let data:any = { producteligible: arrayUnion(...group.productids) }

        if(existingTicket == undefined){
          const docid = doc(collection(this.firestore,"arena e-ticket")).id
          ticketRef = doc(this.firestore,"arena e-ticket",docid)
          data = {
            ...data,
            createddate:new Date(),
            docid:docid,
            eventparticipationref:doc(this.firestore,"event participation request",group.rows[0]['docid']),
            eventref:group.rows[0]['eventref'],
            profileid:pid,
            active:true,
            eventstartdate:this.mapEvents[this.selectedEvent]['start_date']?.toDate(),
            eventenddate:this.mapEvents[this.selectedEvent]['end_date']?.toDate()
          }
        }else{
          ticketRef = doc(this.firestore,"arena e-ticket",existingTicket['docid'])
        }
        batch.set(ticketRef, data, {merge:true})
      }
      try{
        await batch.commit()
        succeeded += chunk.length
      }catch(err){
        console.log(err)
        failed += chunk.length
      }
      if(chunkIdx < chunks.length - 1){
        await new Promise(resolve => setTimeout(resolve, chunkDelayMs))
      }
    }
    this.approving = false
    alert(`Approved ${succeeded} participant(s).` + (failed > 0 ? ` ${failed} failed — please retry.` : ''))
    if(failed == 0){
      this.selection.clear()
    }
  }
}
