import { Component,inject, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { collectionData, Firestore, QueryDocumentSnapshot, QuerySnapshot, query, orderBy, getDocs, where, collection, DocumentData, documentId, limit, writeBatch, doc, serverTimestamp, collectionSnapshots, updateDoc, setDoc } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { combineLatest, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as XLSX from 'xlsx';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { CommonModule,SlicePipe } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { WatiInputComponent } from '../../Participants Profile Management/participants-analytics/wati-input/wati-input.component';
import { environment } from '../../../environments/environment';
import { EmailInputComponent } from '../../Participants Profile Management/participants-analytics/email-input/email-input.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AhNotificationComponent } from '../../Participants Profile Management/participants-analytics/ah-notification/ah-notification.component';
import { Storage,getDownloadURL, ref, uploadBytes } from '@angular/fire/storage';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';
import { BulkAddProductsComponent } from '../../Participants Profile Management/participants-analytics/bulk-add-products/bulk-add-products.component';

interface ImportPreviewParticipant {
  name: string;
  email: string;
}

interface ImportPreviewData {
  totalRows: number;
  willBeAdded: ImportPreviewParticipant[];
  alreadyInQueue: ImportPreviewParticipant[];
  noProduct: ImportPreviewParticipant[];
}
@Component({
  selector: 'app-initiate-event-product',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    CommonModule,
    SlicePipe,
    MatSelectModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatCheckboxModule,
    MatButtonModule,
    MatTooltipModule,
    NgxMatSelectSearchModule,
    ProfilePictureComponent,
    MatDialogModule
  ],
  templateUrl: './initiate-event-product.component.html',
  styleUrl: './initiate-event-product.component.css'
})
export class InitiateEventProductComponent {

  metaSubscription = new Subject<void>(); // Subscription Handler
  arenaSubscription = new Subject<void>()

  // Mat Table
  @ViewChild(MatPaginator) paginator:MatPaginator
  @ViewChild(MatSort) sort:MatSort
  tableDatasource = new MatTableDataSource()
  tableHeader = ["sno", "name", "product", "status", "action"]
  selection = new SelectionModel(true,[]);

  // Event Participation Request
  mapProfileParticipation = {}
  eventRequestedProfile = []
  eventRequestedNonEligibleProfile = []
  eventRequestedEligibleProfile = []

  // Participant Product
  participantProductList = []

  // Arena Event
  arenaEventList = []
  selectedArena = null
  eventsList = [];

  // Delivery Sequence
  deliverySetList = []
  selectedDeliverySet = null
  searchQueue = '';

  // Queue Variation
  queueVariationList:Array<QueryDocumentSnapshot<any>> = []
  selectedQueueVariation = null
  mapQueueVariation = {}
  selectedEvent = {};
  eventParticipationRequestMap:{
    [key: string]: { [value: string]: any[] };
  } = {};

  activeArray = [];
  inActiveArray = [];
  alreadyInQueue = [];

  // Map Data
  mapProfile = {};
  mapParticipantMetaData = {};
  mapJourney = {};
  mapEmailData = {}
  mapProduct = {}
  mapDeliveryItem = {}
  mapDeliveryCollectionField = {
    "delivery events": {field: "eventname", type: "Event"},
    "delivery fieldwork": {field: "fieldworkname", type: "Big"},
    "delivery forms": {field: "formname", type: "Form"},
    "delivery queue": {field: "queuename", type: "Queue"},
    "appointmenttype": {field: "appointmenttype", type: "Appointment"}
  }
  maxFileSize: number = 10 * 1024 * 1024; // 10MB limit
  missingParticipants: { name: string, email: string }[] = [];

  @ViewChild('participantSheet') participantSheet!: TemplateRef<any>;
  @ViewChild('initiationSummaryDialog') initiationSummaryDialog!: TemplateRef<any>;
  @ViewChild('importPreviewDialog') importPreviewDialog!: TemplateRef<any>;

  readonly INITIATE_CHUNK_SIZE = 20;
  readonly INITIATE_CHUNK_DELAY_MS = 5000;
  bottomSheetSelection = new SelectionModel<string>(true, []);
  bottomSheetParticipants: any[] = [];
  private destroy$ = new Subject<void>();
  private storage = inject(Storage);
  importPreviewData: ImportPreviewData = {
    totalRows: 0,
    willBeAdded: [],
    alreadyInQueue: [],
    noProduct: []
  };
  expandedSections: Record<string, boolean> = {
    willBeAdded: false,
    alreadyInQueue: false,
    noProduct: false
  };
  noProductSelection = new SelectionModel<string>(true, []);
  lastImportedParticipants: { name: string, email: string }[] = [];
  filterValue = '';
  searchResult: { unassigned: any[], alreadyInQueue: any[] } = { unassigned: [], alreadyInQueue: [] };


  constructor(
    public firestore: Firestore,
    public guard: AuthguardService,
    public router: Router,
    public dialog: MatDialog,
    public snackbar: MatSnackBar,
    public bottomSheet: MatBottomSheet,
    private http : HttpClient

    

  ) {
    guard.getRoles().then(roles =>{
      // if(roles["admin"] || roles["ah"] || roles["developer"]){
        this.loadData()

      // } 
      // else{
      //   router.navigateByUrl("/")
      // }
    })
    guard.getJourneyMap().then((map)=>this.mapJourney = map);

  }

  ngOnInit(): void {
    getDocs(collection(this.firestore , 'participant metadata')).then((snap)=>{
      this.mapParticipantMetaData = {};
      snap.docs.forEach((d)=>{
        const data = d.data()
        this.mapParticipantMetaData[data['profileid']] = data;
      });
    });
  }

  ngAfterViewInit() {
    console.log("After View Init")
    this.participantProductList.sort((a, b) => (a["name"] || '').localeCompare(b["name"] || ''))
    this.participantProductList.sort((a, b) => Number(b["eventrequested"]) - Number(a["eventrequested"]))
    this.tableDatasource.data = this.participantProductList;
    setTimeout(() => {
      this.tableDatasource.sort = this.sort;
      this.tableDatasource.paginator = this.paginator;
    }, 2000);
  }

  ngOnDestroy(){
    this.metaSubscription.next()
    this.metaSubscription.complete()
    this.arenaSubscription.next()
    this.arenaSubscription.complete()
  }

  loadData(){
    this.guard.getProfileMap().then(data =>{
      this.mapProfile = data.docdata
      this.mapEmailData = data.mapEmailData
    })

    combineLatest([
      collectionSnapshots(
        query(collection(this.firestore, 'event collection'), orderBy('end_date', 'desc'))
      ).pipe(
        map(value =>
          value.map(v => ({
            ...v.data(),
            docref:v.ref,
            type: 'event'
          }))
        )
      ),
      collectionSnapshots(
        query(collection(this.firestore, 'queue generation'), orderBy('queueenddate', 'desc'))
      ).pipe(
        map(value =>
          value.map(v => ({
            ...v.data(),
            name: v.data()['queuename'],
            docref:v.ref,
            type: 'queue'
          }))
        )
      )
    ]).pipe(takeUntil(this.metaSubscription)).subscribe(([events, queues]) => {
      var merged = [...events, ...queues].filter(e => e["delete"] != true)
      merged.sort((a, b) => (b["queueenddate"] ?? b["end_date"]) - (a["queueenddate"] ?? a["end_date"]))
      this.eventsList = merged;
    });

    getDocs(collection(this.firestore, 'products')).then(list =>{
      for (let i = 0; i < list.docs.length; i++) {
        const doc = list.docs[i];
        var data = doc.data()
        this.mapProduct[doc.id] = data["product"]
      }
    })
  }

  resetValue(){
    this.selection.clear()
    this.tableDatasource.data = []
    this.tableDatasource.paginator = this.paginator
    this.tableDatasource.sort = this.sort
    this.participantProductList = []
    this.selectedDeliverySet = null
    this.deliverySetList = []
    this.selectedQueueVariation = null
    this.queueVariationList = []
    this.mapProfileParticipation = {}
    this.eventRequestedProfile = []
    this.eventRequestedNonEligibleProfile = []
  }

  async getDeliveryActivityName(property: any) {
    var promises: Array<Promise<QuerySnapshot<DocumentData>>> = []
    var keys = Object.keys(property)
    
    for (let i = 0; i < keys.length; i++) {
      const collectionName = keys[i];
      for (let a = 0; a < property[collectionName].length; a += 10) {
        const activityID = property[collectionName].slice(a, a + 10);
        
        // Convert to new Firebase v9+ syntax
        const q = query(
          collection(this.firestore, collectionName),
          where(documentId(), 'in', activityID)
        );
        
        promises.push(getDocs(q));
      }
    }
    
    await Promise.all(promises).then(result => {
      for (let i = 0; i < result.length; i++) {
        const element = result[i];
        element.docs.forEach(doc => {
          var data = doc.data()
          var collectionname = doc.ref.parent.id
          var collectionProperty = this.mapDeliveryCollectionField[collectionname] ?? {}
          var activityName = data[collectionProperty["field"]]
          var activityType = collectionProperty["type"]
          this.mapDeliveryItem[doc.ref.path] = `${activityName} (${activityType})`
        })
      }
    })
  }

  async onArenaEventSelect(arena){
    this.selectedArena = arena;
    console.log("Selected Arena", this.selectedArena);
    this.resetValue()

    var loading = this.dialog.open(LoadingProgressComponent, {
      data: {msg: "Setting up..."}
    })
    var deliverySequenceQuery = getDocs(query(collection(this.firestore,"productToDeliverySequence"), where("product", "==", this.selectedArena["productref"]), limit(1)))
    var eventParticipationQuery = getDocs(query(collection(this.firestore, "event participation request"), where("arenaeventid", "==", this.selectedArena["docid"]), where("status", "in", ["requested", "approved"])))
    var participantProductQuery = getDocs(query(collection(this.firestore,"participantsproduct"), where("productref", "==", this.selectedArena["productref"]), where("status", "==", null)))
    var queueTokenQuery = getDocs(query(collection(this.firestore,"queue_token"), where("queueref", "==", this.selectedArena["eventref"])))

    var variationQuery = null
    if(this.selectedArena["type"] == "queue"){
      variationQuery = getDocs(query(collection(this.firestore, "queue variation"), where("queueref", "==", this.selectedArena["eventref"])))
    }

    var promises:Array<Promise<QuerySnapshot<any>>> = [deliverySequenceQuery, eventParticipationQuery, participantProductQuery]
    if(variationQuery) promises.push(variationQuery)

    await Promise.all(promises).then(async result =>{
      console.log(result)
      // Delivery
      var deliveryResult = result[0]
      for (let i = 0; i < deliveryResult.docs.length; i++) {
        const doc = deliveryResult.docs[i];
        var data = doc.data()
        this.deliverySetList = data["deliveryoptions"] ?? []
      }
      // Map Delivery Activity Name
      var mapDeliveryCollection = {}
      for (let i = 0; i < this.deliverySetList.length; i++) {
        const sequence = this.deliverySetList[i]["deliverysequence"] ?? [];
        for (let j = 0; j < sequence.length; j++) {
          var activityref = sequence[j]["activity"]
          mapDeliveryCollection[activityref.parent.id] = mapDeliveryCollection[activityref.parent.id] ?? []
          mapDeliveryCollection[activityref.parent.id].push(activityref.id)
        }
      }
      await this.getDeliveryActivityName(mapDeliveryCollection)

      // Event Participation Request
      var participationRequestResult = result[1]
      var approvedList = []
      var requestedList = []
      for (let i = 0; i < participationRequestResult.docs.length; i++) {
        const doc = participationRequestResult.docs[i];
        var data = doc.data()
        if(data["status"] == "requested"){
          requestedList.push(data["profileid"])
          this.mapProfileParticipation[data["profileid"]] = data
        }
        else if(data["status"] == "approved"){
          approvedList.push(data["profileid"])
        }
      }
      this.eventRequestedProfile = requestedList

      // Participant Product
      var productResult = result[2]
      var dataList = []
      var pushedProfileid = []
      for (let i = 0; i < productResult.docs.length; i++) {
        const doc = productResult.docs[i];
        var data = doc.data()
        data["name"] = this.mapProfile[data["profileid"]]?.["name"]
        data["email"] = this.mapProfile[data["profileid"]]?.["email"]
        if(data["status"] == null && !pushedProfileid.includes(data["profileid"]) && !approvedList.includes(data["profileid"])){
          data["eventrequested"] = requestedList.includes(data["profileid"])
          dataList.push(data)
          pushedProfileid.push(data["profileid"])
        }
        else{
        }
      }

      this.eventRequestedNonEligibleProfile = requestedList.filter(e => !pushedProfileid.includes(e))
      this.eventRequestedEligibleProfile = dataList.filter(e => e["eventrequested"]).map(e => e["profileid"])
      this.participantProductList = dataList

      queueTokenQuery.then((queuetoken) => {
        if (queuetoken.docs.length != 0) {
          const result = queuetoken.docs.reduce((acc, doc) => {
            const data = doc.data();
            const status = data['tokenstatus'].toLowerCase();

            if (this.mapProfile[data['profile_id']] && this.mapProfile[data['profile_id']]['email']) {
              if (status === 'active') {
                acc.active.push(this.mapProfile[data['profile_id']]['email']);
              } else if (status === 'inactive') {
                acc.inactive.push(this.mapProfile[data['profile_id']]['email']);
              }
            }

            return acc;
          }, { active: [], inactive: [] });

          this.activeArray = result.active;
          this.inActiveArray = result.inactive;
        }
      });
      this.ngAfterViewInit()

      // Queue Variation
      if(promises.length == 4){
        var variationResult = result[3]
        for (let i = 0; i < variationResult.docs.length; i++) {
          const doc = variationResult.docs[i];
          var data = doc.data()
          this.mapQueueVariation[doc.id] = data["variationname"]
          this.queueVariationList.push(doc)
        }
      }
    }).catch(err =>{
      console.log(err)
    })
    loading.close()
  }

  validateSubmition(): boolean{
    var participantSelected = this.selection.selected.length != 0
    var deliverySetSelected = this.selectedDeliverySet != null
    var variationSelected = this.selectedQueueVariation != null

    if(this.selectedArena["type"] == "queue"){
      if(this.queueVariationList.length == 0){
        return participantSelected && deliverySetSelected
      }
      else{
        return participantSelected && deliverySetSelected && variationSelected
      }
    }
    else{
      return participantSelected && deliverySetSelected
    }
  }

  async initiateEventProduct(){
    if(!this.validateSubmition()){
      return
    }

    const selectedProduct = [...this.selection.selected]
    const total = selectedProduct.length
    const chunkSize = this.INITIATE_CHUNK_SIZE
    const delayMs = this.INITIATE_CHUNK_DELAY_MS

    const chunks: any[][] = []
    for(let i = 0; i < total; i += chunkSize){
      chunks.push(selectedProduct.slice(i, i + chunkSize))
    }

    const loading = this.dialog.open(LoadingProgressComponent, {
      disableClose: true,
      autoFocus: false,
      data: { msg: `Initiating 0 / ${total} participants...` }
    })

    const succeeded: any[] = []
    const failed: { product: any, error: string }[] = []

    for(let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++){
      const chunk = chunks[chunkIdx]
      const processed = succeeded.length + failed.length
      loading.componentInstance.dialogData.msg =
        `Initiating chunk ${chunkIdx + 1} of ${chunks.length} — ${processed} / ${total} done`

      try {
        const batch = writeBatch(this.firestore)
        for(let i = 0; i < chunk.length; i++){
          const productElement = chunk[i]

          // Update Event Participation Request
          let participationID = null
          let eventparticipationData: any = {}
          if(this.mapProfileParticipation[productElement["profileid"]]){
            participationID = this.mapProfileParticipation[productElement["profileid"]]["docid"]
            eventparticipationData = {
              eventref: this.selectedArena["eventref"],
              productref: this.selectedArena["productref"],
              status: "approved",
              profileid: productElement["profileid"],
              participantproductid: productElement["docid"],
              arenaeventid: this.selectedArena["docid"],
              initiatedfrom: 'web',
            }
          }
          else{
            participationID = doc(collection(this.firestore, 'event participation request')).id
            eventparticipationData = {
              docid: participationID,
              doccreateddate: serverTimestamp(),
              eventref: this.selectedArena["eventref"],
              productref: this.selectedArena["productref"],
              status: "approved",
              profileid: productElement["profileid"],
              participantproductid: productElement["docid"],
              arenaeventid: this.selectedArena["docid"],
              initiatedfrom: 'web',
            }
          }
          const eventparticipationRef = doc(this.firestore, "event participation request", participationID)
          batch.set(eventparticipationRef, eventparticipationData, {merge: true})

          // Update Participants Product
          const participantproductData: any = {
            eventref: this.selectedArena["eventref"],
            arenaeventid: this.selectedArena["docid"],
            status: "initiated",
            eventparticipationid: eventparticipationRef.id,
            deliverytype: this.selectedDeliverySet,
            "statusdate.initiated": serverTimestamp()
          }
          if(this.selectedArena["type"] == "queue"){
            participantproductData["queuevariationid"] = this.selectedQueueVariation
          }
          batch.update(doc(this.firestore, 'participantsproduct', productElement["docid"]), participantproductData)
        }

        await batch.commit()
        succeeded.push(...chunk)
        console.log(`Chunk ${chunkIdx + 1}/${chunks.length} committed (${chunk.length} products)`)
      }
      catch(err: any){
        const errMsg = err?.message || String(err)
        console.log(`Chunk ${chunkIdx + 1}/${chunks.length} failed:`, err)
        for(const product of chunk){
          failed.push({ product, error: errMsg })
        }
      }

      if(chunkIdx < chunks.length - 1){
        const done = succeeded.length + failed.length
        loading.componentInstance.dialogData.msg =
          `Waiting ${delayMs / 1000}s before next chunk... (${done} / ${total} done)`
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    loading.close()

    const summaryData = {
      total,
      successCount: succeeded.length,
      failedCount: failed.length,
      failedList: failed.map(f => ({
        name: (this.mapProfile[f.product["profileid"]] ?? {})["name"] || f.product["profileid"],
        error: f.error
      }))
    }

    if(this.initiationSummaryDialog){
      this.dialog.open(this.initiationSummaryDialog, {
        width: '520px',
        disableClose: true,
        autoFocus: false,
        data: summaryData
      })
    }
    else{
      console.warn("initiationSummaryDialog template not found — falling back to alert")
      const failedNames = summaryData.failedList.map(f => `- ${f.name}: ${f.error}`).join("\n")
      const msg = `Initiation Summary\n\nTotal: ${summaryData.total}\nSuccess: ${summaryData.successCount}\nFailed: ${summaryData.failedCount}` +
        (failedNames ? `\n\nFailed:\n${failedNames}` : "")
      alert(msg)
    }

    if(failed.length === 0){
      this.selectedArena = null
      this.resetValue()
    }
  }

  viewParticipantName(profileList:Array<any>):string{
    return profileList.map(e => (this.mapProfile[e] ?? {})["name"]).join(", ")
  }

  applyFilter(value){
    this.filterValue = value;
    this.tableDatasource.filter = value;
    this.searchResult = this.getUnassignedFromSearch();

  }

  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.tableDatasource.data.length;
    return numSelected === numRows;
  }

  masterToggle() {
    this.isAllSelected() ? this.selection.clear() : this.tableDatasource.data.forEach(row => this.selection.select(row));
  }

  downloadSampleExcel() {
    var map = {
      "name": 'Antano&Harini',
      "email": 'antanoharini@soexcellence.com'
    }
    
    const worksheet = XLSX.utils.json_to_sheet([map]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample');
    XLSX.writeFile(workbook, 'Sample.xlsx');
  }

  compareFnc(c1:any, c2:any): boolean {
    return c1 && c2 ? c1.docid === c2.docid : c1 === c2;
  }
  selectedFiles: File[] = [];

  importParticipant() {
    this.alreadyInQueue = [];
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xls,.xlsx';
    fileInput.addEventListener('change', (event: any) => {
      const files: FileList = event.target.files;
      if (files && files.length) {
        const file = files[0];
        if (file.size > this.maxFileSize) {
          this.snackbar.open(`File ${file.name} is too large. Maximum size is 10MB.`, 'OK', {
            duration: 5000,
          });
          return;
        }

        const loading = this.dialog.open(LoadingProgressComponent, {
          disableClose: true,
          autoFocus: false,
          data: { msg: "Importing participants..." }
        });

        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          this.missingParticipants = [];
          const excelParticipants: { name: string, email: string }[] = [];

          jsonData.forEach((row: any[], index) => {
            if (index > 0 && row[0] && row[1]) {
              const name = row[0].toString().trim();
              const email = row[1].toString().trim().toLowerCase();
              if (name && email) {
                excelParticipants.push({ name, email });
              }
            }
          });

          const tableEmailMap = new Map<string, any>();
          this.participantProductList.forEach(p => {
            const email = p.email ? p.email.toString().trim().toLowerCase() : '';
            if (email) tableEmailMap.set(email, p);
          });

          const activeEmailSet = new Set(this.activeArray.map(e => e.toLowerCase()));
          const willBeAdded: ImportPreviewParticipant[] = [];
          const alreadyInQueue: ImportPreviewParticipant[] = [];
          const noProduct: ImportPreviewParticipant[] = [];
          const seenEmails = new Set<string>();

          excelParticipants.forEach(person => {
            if (seenEmails.has(person.email)) return;
            seenEmails.add(person.email);

            if (activeEmailSet.has(person.email)) {
              alreadyInQueue.push({ name: person.name, email: person.email });
            } else if (!tableEmailMap.has(person.email)) {
              noProduct.push({ name: person.name, email: person.email });
            } else {
              willBeAdded.push({ name: person.name, email: person.email });
            }
          });
          this.lastImportedParticipants = excelParticipants;
          this.importPreviewData = {
            totalRows: excelParticipants.length,
            willBeAdded,
            alreadyInQueue,
            noProduct
          };
          loading.close();
          const dialogRef = this.dialog.open(this.importPreviewDialog, {
            width: '580px',
            maxHeight: '90vh',
            disableClose: true,
            autoFocus: false
          });
          this.expandedSections = {
            willBeAdded: false,
            alreadyInQueue: false,
            noProduct: false
          };
          this.noProductSelection.clear();
          dialogRef.afterClosed().subscribe((confirmed: boolean) => {
            if (!confirmed) return;
            // Apply selection
            this.selection.clear();
            let matchCount = 0;
            const selectedEmails = new Set<string>();

            this.participantProductList.forEach(participant => {
              const participantEmail = participant.email? participant.email.toString().trim().toLowerCase(): '';
              if (participantEmail &&willBeAdded.some(p => p.email === participantEmail) &&!selectedEmails.has(participantEmail)) {
                this.selection.select(participant);
                selectedEmails.add(participantEmail);
                matchCount++;
              }
            });
            this.missingParticipants = noProduct;

            if (matchCount > 0) {
              this.snackbar.open(`Selected ${matchCount} participants`, 'OK', { duration: 3000 });
            }
          });
        };
        reader.onerror = () => {
          loading.close();
          this.snackbar.open('Error reading file', 'OK', { duration: 5000 });
        };
        reader.readAsArrayBuffer(file);
      }
    });
    fileInput.click();
  }
  
  exportMissingParticipants() {
    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.missingParticipants);
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Missing Participants');
    const fileName = 'Missing_Participants.xlsx';
    XLSX.writeFile(workbook, fileName);
  }

  assignProduct() {
    const selected = this.noProductSelection.selected;
    if (selected.length === 0) return;

    const selectedParticipants = selected.map(email => ({
      profileid: this.mapEmailData[email]?.['profileid'],
      name: this.mapEmailData[email]?.['name'],
      email: email
    })).filter(p => p.profileid);

    this.dialog.open(BulkAddProductsComponent, {
        data: { participants: selectedParticipants, productrefId: this.selectedArena['productref'].id },
        width: '70vw',
        disableClose: true
      }).afterClosed().subscribe(async () => {
      if (!this.selectedArena) return;

      const savedDeliverySet = this.selectedDeliverySet;
      const savedQueueVariation = this.selectedQueueVariation;

      await this.onArenaEventSelect(this.selectedArena);

      this.selectedDeliverySet = savedDeliverySet;
      this.selectedQueueVariation = savedQueueVariation;

      const tableEmailMap = new Map<string, any>();
      this.participantProductList.forEach(p => {
        const email = p.email?.toString().trim().toLowerCase();
        if (email) tableEmailMap.set(email, p);
      });

      const activeEmailSet = new Set(this.activeArray.map(e => e.toLowerCase()));
      const willBeAdded: ImportPreviewParticipant[] = [];
      const alreadyInQueue: ImportPreviewParticipant[] = [];
      const noProduct: ImportPreviewParticipant[] = [];

      this.lastImportedParticipants.forEach(person => {
        if (activeEmailSet.has(person.email)) {
          alreadyInQueue.push(person);
        } else if (!tableEmailMap.has(person.email)) {
          noProduct.push(person);
        } else {
          willBeAdded.push(person);
        }
      });

      this.importPreviewData = {
        totalRows: this.lastImportedParticipants.length,
        willBeAdded,
        alreadyInQueue,
        noProduct
      };

      this.noProductSelection.clear();
      this.expandedSections = { willBeAdded: false, alreadyInQueue: false, noProduct: false };
      this.dialog.closeAll();
      this.dialog.open(this.importPreviewDialog, {
        width: '580px',
        maxHeight: '90vh',
        disableClose: true,
        autoFocus: false
      }).afterClosed().subscribe((confirmed: boolean) => {
        if (!confirmed) return;

        this.selection.clear();
        const selectedEmails = new Set<string>();
        let matchCount = 0;

        this.participantProductList.forEach(participant => {
          const email = participant.email?.toString().trim().toLowerCase();
          if (email && willBeAdded.some(p => p.email === email) && !selectedEmails.has(email)) {
            this.selection.select(participant);
            selectedEmails.add(email);
            matchCount++;
          }
        });

        this.missingParticipants = noProduct;
        if (matchCount > 0) {
          this.snackbar.open(`Selected ${matchCount} participants`, 'OK', { duration: 3000 });
        }
      });
    });
  }
  toggleAllNoProduct(checked: boolean) {
    if (checked) {
      this.importPreviewData.noProduct.forEach(p => this.noProductSelection.select(p.email));
    } else {
      this.noProductSelection.clear();
    }
  }
  
  getUnassignedFromSearch(): { unassigned: any[], alreadyInQueue: any[] } {
    if (!this.filterValue) return { unassigned: [], alreadyInQueue: [] };
    const search = this.filterValue.trim().toLowerCase();
    const activeEmailSet = new Set(this.activeArray.map(e => e.toLowerCase()));

    const notInTable = Object.values(this.mapEmailData).filter((p: any) => {
      const name = p.name?.toLowerCase() ?? '';
      const email = p.email?.toLowerCase() ?? '';
      return (name.includes(search) || email.includes(search)) &&
        !this.participantProductList.some(pp => pp.email?.toLowerCase() === email);
    });

    const unassigned = notInTable.filter((p: any) => !activeEmailSet.has(p.email?.toLowerCase() ?? ''));
    const alreadyInQueue = notInTable.filter((p: any) => activeEmailSet.has(p.email?.toLowerCase() ?? ''));

    return { unassigned, alreadyInQueue };
  }

  assignProductFromSearch(participants: any[]) {
    const selectedParticipants = participants.map(p => ({
      profileid: p.profileid,
      name: p.name,
      email: p.email
    })).filter(p => p.profileid);

    if (selectedParticipants.length === 0) return;

    this.dialog.open(BulkAddProductsComponent, {
      data: { participants: selectedParticipants, productrefId: this.selectedArena['productref'].id },
      width: '70vw',
      disableClose: true
    }).afterClosed().subscribe(async () => {
    if (!this.selectedArena) return;
    const savedDeliverySet = this.selectedDeliverySet;
    const savedQueueVariation = this.selectedQueueVariation;
    await this.onArenaEventSelect(this.selectedArena);
    this.selectedDeliverySet = savedDeliverySet;
    this.selectedQueueVariation = savedQueueVariation;
    this.filterValue = '';
    this.tableDatasource.filter = '';
  });
  }

  returnEvent(){
    return this.eventsList.filter(e => e['name'].toLowerCase().trim().includes(this.searchQueue.toLowerCase().trim()))
  }

  async onEventSelect(){
    this.arenaSubscription.next()
    this.arenaSubscription.complete()
    this.arenaSubscription = new Subject<void>()
    this.selectedArena = null

    await getDocs(query(collection(this.firestore, "arena events"),where('eventref', '==',this.selectedEvent['docref']))).then(value =>{
      this.arenaEventList = value.docs.map(e => e.data()).filter(e => !e['delete'] || e['delete'] != true).sort((a,b)=>b['enddate']-a['enddate'])
    });

    var arenaEventId = this.arenaEventList.map(e => e["docid"])

    if(arenaEventId.length != 0){
      collectionSnapshots(query(collection(this.firestore, 'event participation request'), where('arenaeventid', 'in', arenaEventId))).pipe( // where('status', 'in', ['requested'])
        takeUntil(this.metaSubscription),
        takeUntil(this.arenaSubscription)
      ).subscribe(eprdocs => {
        var mapRequestData = {}
        for (let i = 0; i < eprdocs.length; i++) {
          const requestData = eprdocs[i].data();
          var responseStatus = requestData["status"] ?? "pending"
          var arenaeventID = requestData["arenaeventid"]

          mapRequestData[arenaeventID] = mapRequestData[arenaeventID] ?? {}

          // Group All
          mapRequestData[arenaeventID]["all"] = mapRequestData[arenaeventID]["all"] ?? []
          mapRequestData[arenaeventID]["all"].push(requestData)

          // Group By Status
          mapRequestData[arenaeventID][responseStatus] = mapRequestData[arenaeventID][responseStatus] ?? []
          mapRequestData[arenaeventID][responseStatus].push(requestData)
        }
        this.eventParticipationRequestMap = mapRequestData
        /*
        if (eprdocs.length > 0) {
          const map: { [key: string]: any[] } = {};

          for (const eprDoc of eprdocs) {
            const eprData = eprDoc.data();
            const arenaEventId = eprData['arenaeventid'];

            if (!map[arenaEventId]) {
              map[arenaEventId] = [];
            }

            map[arenaEventId].push(eprData);
          }

          this.eventParticipationRequestMap = map;
        }
        console.log(this.eventParticipationRequestMap)
        */
      });
    }
  }

 
  openBottomSheet(list: any[]) {
    console.log("open bottom sheet", list);
    
    // Clear previous selection
    this.bottomSheetSelection.clear();
    
    // Store participant details with profileId
    this.bottomSheetParticipants = list.map(profileId => ({
      profileId: profileId,
      name: this.mapProfile[profileId]?.name || 'Unknown',
      email: this.mapProfile[profileId]?.email || 'No email'
    }));
    
    console.log("participantDetails", this.bottomSheetParticipants);
    
    this.bottomSheet.open(this.participantSheet, { 
      data: this.bottomSheetParticipants
    });
  }

  closeSheet() {
    const selectedParticipants = this.bottomSheetSelection.selected;
    console.log('Selected participants:', selectedParticipants);
    
    // You can do something with selected participants here
    if (selectedParticipants.length > 0) {
      this.snackbar.open(`${selectedParticipants.length} participant(s) selected`, 'OK', {
        duration: 3000
      });
    }
    
    this.bottomSheet.dismiss();
  }

  isAllBottomSheetSelected(): boolean {
    const numSelected = this.bottomSheetSelection.selected.length;
    const numRows = this.bottomSheetParticipants.length;
    return numSelected === numRows && numRows > 0;
  }

  masterToggleBottomSheet() {
    if (this.isAllBottomSheetSelected()) {
      this.bottomSheetSelection.clear();
    } else {
      this.bottomSheetParticipants.forEach(participant => 
        this.bottomSheetSelection.select(participant.profileId)
      );
    }
  }

  toggleBottomSheetSelection(profileId: string) {
    this.bottomSheetSelection.toggle(profileId);
  }

  isBottomSheetSelected(profileId: string): boolean {
    return this.bottomSheetSelection.isSelected(profileId);
  }

  async sendWhatsApp() {
    const selectedParticipants = this.bottomSheetSelection.selected;

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(WatiInputComponent,{
      data : selectedParticipants,
      width : "70vw",
      height : "80vh",
      disableClose:true
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        if(result == 'success') {
          this.guard.openSnackBar("Wati Message Sent Successfully", "OK",600);
          if(result['status'] == 'sendtoparticipants'){
            let url:string;

            if(environment.firebase.projectId == 'starlabs-test'){
              url = "https://us-central1-starlabs-test.cloudfunctions.net/sendWhatsAppBroadcast";
            }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
              url = ""
            } 

            const docRef = doc(collection(this.firestore , 'wati archive'), result['archiveid']);
            await updateDoc(docRef, {
              templatestatus: "created",
              templatevalidated: true,
            }).then(() => {
              console.log("Wati Archive Document Created");
            }).catch((error) => {
              console.log("Error Creating Wati Archive");
            });

            const response = await this.http.post(url, { archiveid: result['archiveid'] }).toPromise();
            console.log("Response : ",response)

          }
        } else if(result == 'failed') {
          this.guard.openSnackBar("Sending Wati Message Failed", "OK",600);
        }
      }
    });
  }

  async sendEmail() {
    const selectedParticipants =  this.bottomSheetSelection.selected;
    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(EmailInputComponent,{
      data : selectedParticipants,
      minWidth : "600px",
      disableClose:true
    });
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      if(result != null && result != undefined){
        console.log(result);
        
        const docRef = doc(collection(this.firestore,"email archive"),result['docid']);
        if(result['status'] == 'queued' || result['status'] == 'send'){
          await setDoc(docRef,result,{merge:true}).then(() => {
            this.guard.openSnackBar("Email Sent", "OK",600);
          }).catch(err => {
            console.log(err);
            this.guard.openSnackBar("Error Sending Email", "OK",600);
          });
        }else if (result['status'] == 'validated'){
          let url:string;
          if(environment.firebase.projectId == 'starlabs-test'){
            url = "https://us-central1-starlabs-test.cloudfunctions.net/sendBatchEmail";
          }else if (environment.firebase.projectId == 'fir-sample-aae4a'){
            url = "https://us-central1-fir-sample-aae4a.cloudfunctions.net/sendBatchEmail"
          }
          console.log("EMAIL :", url);
          let data = result;
          data['archiveid'] = result['docid'];
          this.http.post(url, JSON.stringify(data),{
            responseType: 'text',
            headers: new HttpHeaders().set('Content-Type', 'application/json'),
          }).subscribe({
            next: (response) => {
              console.log('response', response);
            },
            error: (err) => {
              console.log(err);
              console.log("Error: " + err);
            }
          });
        }

      }
    })
  }

  async sendNotification() {
    const selectedParticipants =  this.bottomSheetSelection.selected;

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    let dialogRef = this.dialog.open(AhNotificationComponent,{
      width : "60vw",
      maxHeight: "90vh",
      disableClose:true,
      autoFocus: false,
    })
    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(async result => {
      console.log(result,'send app notificationssss');
      if(result != null && result != undefined){
        var userID = [];
        var profileID = [];
        console.log(selectedParticipants,"this.selection.selected");
        // var unsentProfiles = [];
        // for (let i = 0; i < selectedParticipants.length; i++) {
        //   const selected = selectedParticipants[i];
        //   profileID.push(selected)
        //   // var profiledata = this.mapProfile[selected["profileid"]]
        //   // if(profiledata["user_ref"] != null) {
        //   //   userID.push(profiledata["user_ref"].id);
        //   //   profileID.push(selected['profileid']);
        //   // }

        //   // if(profiledata["user_ref"] == null) {
        //   //   unsentProfiles.push(profiledata);
        //   // }
        // }

        var notificationimage = null
        if(result["notificationimage"] != null){
          const filepath = "Notification Images/" + new Date().toISOString() + result["notificationimage"].name;
          try {
            const storageRef = ref(this.storage,filepath)
            const uploadResult = await uploadBytes(storageRef,result["notificationimage"])
            notificationimage = await getDownloadURL(uploadResult.ref)
          } catch (error) {
            console.log("file upload error",error);
          }
        }
        console.log(profileID,"profileIDprofileIDprofileIDprofileID");
        this.guard.saveNotificationRecord({
          title: result["title"],
          message: result["message"],
          subtitle: result["subtitle"] ?? null,
          notificationtype: "ahupdate",
          notificationimage: notificationimage,
          sticky: result["sticky"],
          logged: true, 
          landingpage: result["landingpage"],
          profileid: selectedParticipants,
        }).then(()=>{
          console.log( notificationimage)
          alert("A&H Update sent to App user " + selectedParticipants.length.toString())
        })
      }
    })
  }

  viewArenaParticipants(arena: any, event: Event) {
    event.stopPropagation();

    const participants = this.eventParticipationRequestMap[arena['docid']]?.['all'] || [];

    if (participants.length === 0) {
      this.snackbar.open('No participants found for this event', 'OK', { duration: 3000 });
      return;
    }

    const participantDetails = participants.map(p => ({
      profileId: p.profileid,
      name: this.mapProfile[p.profileid]?.name || 'Unknown',
      email: this.mapProfile[p.profileid]?.email || 'No email',
      status: p.status || 'pending'
    }));

    this.bottomSheetParticipants = participantDetails;
    this.bottomSheetSelection.clear();

    this.bottomSheet.open(this.participantSheet, {
      data: participantDetails
    });
  }

  exportArenaParticipants(arena: any, event: Event) {
    event.stopPropagation();

    const participants = this.eventParticipationRequestMap[arena['docid']]?.['all'] || [];

    if (participants.length === 0) {
      this.snackbar.open('No participants to export', 'OK', { duration: 3000 });
      return;
    }
    const exportData = participants.map(p => ({
      'Name': this.mapProfile[p.profileid]?.name || 'Unknown',
      'Email': this.mapProfile[p.profileid]?.email || 'No email',
      'PH_NO': this.mapProfile[p.profileid]?.number || 'N/A',
      'Active Journey' : this.mapJourney[this.mapParticipantMetaData[p.profileid]?.activejourney || ''] ?? 'N/A',
      'Total Purchase Value' : this.mapParticipantMetaData[p.profileid]?.pp_totalpurchasevalue ?? 'N/A',
      'Total Paid' : this.mapParticipantMetaData[p.profileid]?.pp_totalpaid ?? 'N/A',
      'Due' : this.mapParticipantMetaData[p.profileid]?.pp_totalpurchasevalue - this.mapParticipantMetaData[p.profileid]?.pp_totalpaid,
      'Financial Status' : this.mapParticipantMetaData[p.profileid]?.financialstatus ?? 'N/A',
      'Subscription End' : this.formatDate(this.mapParticipantMetaData[p.profileid]?.subscriptionend ),
      'Status': p.status || 'pending',
      'Customer Status': this.mapParticipantMetaData[p.profileid]?.customerstatus || 'N/A',
      'Eligibilty' : this.getParticipantEligibitly(p.profileid)
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Participants');

    const productName = this.mapProduct[arena['productref'].id] || 'Arena';
    const fileName = `${productName}_Participants_${new Date().toISOString().split('T')[0]}.xlsx`;

    XLSX.writeFile(workbook, fileName);

    this.snackbar.open(`Exported ${participants.length} participants`, 'OK', { duration: 3000 });
  } 

  formatDate(date : any){
    
    if (date?.toDate) {
      return date.toDate().toISOString();
    } else if(date?.toISOString){
      return date.toISOString()
    }
    return 'N/A';
  }

  getParticipantEligibitly(pid : string){
    if(![null , undefined , ''].includes(pid) && this.selectedArena){
      if(this.eventRequestedNonEligibleProfile.includes(pid)){
        return 'No';
      } else if(this.eventRequestedEligibleProfile.includes(pid)){
        return 'Yes';
      }
    } 
    return 'N/A'
  }
}
