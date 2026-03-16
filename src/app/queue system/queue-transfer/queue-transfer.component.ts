import { Component, OnInit,ViewChild} from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, orderBy, query, setDoc, where } from '@angular/fire/firestore';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { SelectionModel } from '@angular/cdk/collections';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { Subject, takeUntil } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';


@Component({
  selector: 'app-queue-transfer',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    CommonModule,
    MatCheckboxModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatMenuModule,

  ],
  templateUrl: './queue-transfer.component.html',
  styleUrl: './queue-transfer.component.css'
})
export class QueueTransferComponent {
  displayedColumns: string[] = ['select','profile_name', 'profile_id', 'productname', 'currentstage', 'variationid','transferproducteligibility','logs'];
  dataSource = new MatTableDataSource<any>();
  selection = new SelectionModel<any>(true, []);
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  private subscriptionHandle = new Subject<void>()
  
  queueGenerationList:any[]=[]
  mapJourney = {}
  productList:any[] = []

  queueTransfer = {
    queuefrom:null,
    queueto:null,
    productto:null,
    selectedparticipants:[],
    variationid:null,
    deliverytype:null
  }
  selectedQueue:string | null = null
  transferQueueParticipant:any [] = []
  mapParticipantDashboardData = {}
  mapSelectedQueueLog = {}
  mapQueueVariation = {}
  mapProduct = {}
  mapUnconsumedProducts = {}
  mapArenaEventToSelectedProduct = {}
  deliveryOptionList = []
  constructor(private firestore: Firestore,private dialog : MatDialog){
    getDocs(query(collection(this.firestore,"queue generation"), orderBy("queueenddate", "desc"))).then(async snap => {
      this.queueGenerationList = snap.docs.map(e => e.data())
    })
    getDocs(collection(this.firestore,"journey")).then(snap => {
      for (let i = 0; i < snap.docs.length; i++) {
        const element = snap.docs[i].data();
        this.mapJourney[element['id']] = element['journey']
      } 
    })
    getDocs(collection(this.firestore,"products")).then(snap => {
      let productList = snap.docs.map(e => e.data())
      for (let i = 0; i < productList.length; i++) {
        const element = productList[i];
        this.mapProduct[element['id']] = element['product']
      }
    })
    collectionData(collection(this.firestore,"participantdashboard"), {idField: 'id'}).pipe(takeUntil(this.subscriptionHandle)).subscribe(snap => {
      for (let i = 0; i < snap.length; i++) {
        const element = snap[i];
        this.mapParticipantDashboardData[element['profileid']] = element
      }
      console.log("participantdashboarddata",this.mapParticipantDashboardData);
      
    })
    getDocs(collection(this.firestore,"queue variation")).then(variationSnap => {
      for (let i = 0; i < variationSnap.docs.length; i++) {
        const variationElement = variationSnap.docs[i].data();
        this.mapQueueVariation[variationElement['queueref'].id] = this.mapQueueVariation[variationElement['queueref'].id] || {}
        this.mapQueueVariation[variationElement['queueref'].id][variationSnap.docs[i].id] = variationElement['variationname'] || null
      }
    })
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(){
    this.dataSource.data = this.transferQueueParticipant
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

   /** Whether the number of selected elements matches the total number of rows. */
   isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.dataSource.data);    
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?:any): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.position + 1}`;
  }

  onQueueTransferChange(){
    console.log(this.queueTransfer);
    if(this.queueTransfer.queuefrom != this.selectedQueue || this.selectedQueue === null){
      this.selectedQueue = this.queueTransfer.queuefrom
      this.transferQueueParticipant = []
      this.ngAfterViewInit()
      let queueRef = doc(this.firestore,"queue generation",this.queueTransfer.queuefrom)
      getDocs(query(collection(this.firestore,"queue_token") ,where("queueref","==",queueRef),where("stagestatus","==","Approved"),where("tokenstatus","==","Active"))).then(async queueSnap => {
        this.transferQueueParticipant = queueSnap.docs.map(e => {
          let element = e.data()
          if(element['currentstage'] != 'completed'){
            return element
          }
          return null
        })
        this.ngAfterViewInit()
        //getting product details
          this.mapUnconsumedProducts = {}
          console.log("this.transferQueueParticipant.length",this.transferQueueParticipant.length);
          for (let i = 0; i < this.transferQueueParticipant.length; i=i+10){
            const profileidlist = this.transferQueueParticipant.slice(i,i+10).map(e => e['profile_id']);
            await getDocs(query(collection(this.firestore,"participantsproduct"), where("profileid","in",profileidlist),orderBy("sequenceorder","asc"))).then(ppSnap => {
              for (let j = 0; j < ppSnap.docs.length; j++) {
                const element = ppSnap.docs[j].data();
                this.mapUnconsumedProducts[element['profileid']] = this.mapUnconsumedProducts[element['profileid']] || []
                if(element['status'] === null){
                  this.mapUnconsumedProducts[element['profileid']].push(element)
                }
              }
              
              //
                for (let k = 0; k < this.transferQueueParticipant.length; k++) {
                  this.transferQueueParticipant[k]['transferproducteligibility'] = this.queueTransfer.productto == null ? 'Transferred To Same product' : 
                  ( this.mapUnconsumedProducts[this.transferQueueParticipant[k]['profile_id']] != undefined ? 
                    this.mapUnconsumedProducts[this.transferQueueParticipant[k]['profile_id']].map((e:any) => e['productref'].id).includes(this.queueTransfer.productto) ? 'Exist' : 'Not Available' : 
                    'Not Available')
                }
                this.ngAfterViewInit()
              //
            })
          }
        //
      })
      getDocs(query(collection(this.firestore,"queue stage log"), where("queueref","==",queueRef),orderBy("logdate","asc"))).then(logSnap => {
        this.mapSelectedQueueLog = {}
        for (let i = 0; i < logSnap.docs.length; i++) {
          const logElement = logSnap.docs[i].data();
          this.mapSelectedQueueLog[logElement['profile_id']] = this.mapSelectedQueueLog[logElement['profile_id']] || []
          this.mapSelectedQueueLog[logElement['profile_id']].push(logElement)
        }
      })
    }
    for (let k = 0; k < this.transferQueueParticipant.length; k++) {
      this.transferQueueParticipant[k]['transferproducteligibility'] = this.queueTransfer.productto == null ? 'Transferred To Same product' : 
      ( this.mapUnconsumedProducts[this.transferQueueParticipant[k]['profile_id']] != undefined ? 
        this.mapUnconsumedProducts[this.transferQueueParticipant[k]['profile_id']].map((e:any) => e['productref'].id).includes(this.queueTransfer.productto) ? 'Exist' : 'Not Available' : 
        'Not Available')
    }
    this.ngAfterViewInit()
    if(this.queueTransfer.productto != null){
      let productRef = doc(this.firestore,"products",this.queueTransfer.productto)
      getDocs(query(collection(this.firestore,"productToDeliverySequence"), where('product',"==",productRef))).then(pdsSnap => {
        this.deliveryOptionList = pdsSnap.docs.map(e => e.data())[0]['deliveryoptions']
      })
    }
  }

  onSelect(row,i){
    this.queueTransfer.selectedparticipants = this.selection.selected
  }

  onQueueToChange() {
    if (this.queueTransfer.queueto != null) {
      let queueRef = doc(this.firestore, "queue generation", this.queueTransfer.queueto);

      getDocs(query(collection(this.firestore, "arena events"), where("eventref", "==", queueRef))).then(eventSnap => {

        // Temp map first
        const tempMap: any = {};

        eventSnap.docs.forEach(doc => {
          const element = doc.data();
          if (element['delete'] != true) {
            tempMap[element['productref'].id] = element;
          }
        });

        // Assign to main map
        this.mapArenaEventToSelectedProduct = tempMap;

        // Get product list from temp map keys
        this.productList = Object.keys(tempMap);
      });
    }
  }

  filterQueue():any[]{
    return this.queueGenerationList.filter(e => {
      if(e['docid'] != this.selectedQueue){
        if(e['queueenddate'].toDate() > new Date()){
          return e
        }
      }
    })
  }

  onValidation():boolean{
    let validation = true
    for (const key in this.queueTransfer) {
      if(!['selectedparticipants','variationid'].includes(key)){
        if([null,undefined].includes(this.queueTransfer[key])){
          validation = false
        }
      }
      if(key === 'deliverytype' && this.queueTransfer[key] != null){
        let checkDeliveryTypeExist = this.deliveryOptionList.filter(e => e['deliverytype'] === this.queueTransfer[key])
        if(checkDeliveryTypeExist.length === 0){
          validation = false
          alert("selected delivery type not exist")
        }
      }
    }
    return validation
  }

  onSubmit(){
    if(this.onValidation() ){
      console.log(this.queueTransfer);

      //another method
      let loadingref = this.dialog.open(LoadingProgressComponent,{
        data:{
          msg:"Submitting Please wait............"
        }
      })
      let mapParticipantProduct = {}
      for (let i = 0; i < this.queueTransfer.selectedparticipants.length; i++) {
        const transferTokenParticipant = this.queueTransfer.selectedparticipants[i];
        mapParticipantProduct[transferTokenParticipant['profile_id']] = this.mapUnconsumedProducts[transferTokenParticipant['profile_id']].filter((e:any) => e['productref'].id === this.queueTransfer.productto)[0]['docid']
      }
      this.queueTransfer['mapParticipantProduct'] = mapParticipantProduct
      this.queueTransfer['productname'] = this.mapProduct[this.queueTransfer.productto]
      this.queueTransfer['arenaeventid'] = this.mapArenaEventToSelectedProduct[this.queueTransfer.productto]['docid']
      this.queueTransfer['createdon'] = new Date();
      let id = doc(collection(this.firestore, 'queue participant transfer')).id
      setDoc(doc(this.firestore,"queue participant transfer",id) ,this.queueTransfer).then(() => {
        console.log("document created");
        this.queueTransfer = {
          queuefrom:this.queueTransfer.queuefrom,
          queueto:this.queueTransfer.queueto,
          productto:this.queueTransfer.productto,
          selectedparticipants:[],
          variationid:null,
          deliverytype:null
        }
        this.selection.clear()
        loadingref.close()
      })      
    }else{
      alert("Please Select the required field")
    }
  }
}
