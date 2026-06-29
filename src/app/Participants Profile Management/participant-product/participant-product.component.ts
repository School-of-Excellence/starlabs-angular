import { Component, OnInit, ViewChild } from '@angular/core';
import { collection, collectionData, doc, Firestore, getDocs, orderBy, query, setDoc, where } from '@angular/fire/firestore';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { AuthguardService } from '../../authguard.service';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import * as XLSX from 'xlsx';
import { MatButtonModule } from "@angular/material/button";
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Timestamp } from '@angular/fire/firestore';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';


@Component({
  selector: 'app-participant-product',
  imports: [
    ProfilePictureComponent,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatSelectModule,
    ClipboardModule,
    NgxMatSelectSearchModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule
],
  templateUrl: './participant-product.component.html',
  styleUrl: './participant-product.component.css'
})
export class ParticipantProductComponent {
  uPandBigJourney = []
  dropdownFilterText = ""
  productList = []
  profileList = []
  mapJourney = {}
  mapProduct = {}
  mapParticipantProducts = {}
  mapProfile = {}
  displayedColumns = ["name", "product", "status", "initiated", "ongoing", "completed", "cancelled", "shifted", "mode", "nextmode", "days", "deliverymode", "deliveryplanning"]
  dataSource = new MatTableDataSource();
  @ViewChild(MatPaginator) paginator : MatPaginator;
  @ViewChild(MatSort) sort : MatSort;

  subscription = new Subject<void>()
  filterProductSubscription = new Subject<void>()
  selectedProfile = null
  selectedProduct = null

  // Tester
  testingRole = false
  testDate = null

  allParticipantsData = [];

  selectedMissingProduct = null
  mapMissingProduct:any = null
  queueSlotBookingProduct = []
  unlimitedproducts = [];
  showSpecialProductFilter = false
  editingCell = { row: null, column: null }; 
  tempDateValue: Date | null = null;

  // unlimitedProductsData: Array<{productId: string, productName: string, missingCount: number, missingParticipants: any[]}> = [];
  // showingUnlimitedProductParticipants = false;
  // currentUnlimitedProductFilter = '';

  get loading(){
    return this.dialog.open(LoadingProgressComponent,{data:{msg:'Please wait processing ...'},disableClose:true})
  }

  constructor(public guard: AuthguardService, public firestore: Firestore, public dialog: MatDialog, public clipboard: Clipboard) {
    let loadingref = this.loading
    guard.getRoles().then(async roles=>{
      this.testingRole = roles["tester"] ?? false
      // if(roles["developer"]){
        await guard.getParticipantMetaMap().then(value => {
          this.mapProfile = value.docdata
          this.profileList = value.list
        })
        // await guard.getProductMap().then(value => this.mapProduct = value)

        await getDocs(query(collection(firestore, 'products'),orderBy('product','asc'))).then((productsdocs)=>{
          if(productsdocs.docs.length > 0){
            for (let i = 0; i < productsdocs.docs.length; i++) {
              const productDoc = productsdocs.docs[i];
              var productData = productDoc.data()
              this.productList.push(productData)
              this.mapProduct[productDoc.id] = productData['product'];
              if(productData['unlimited'] == true){
                this.unlimitedproducts.push(productDoc.id)
              }

              if(productData['checkforqueue'] == true){
                this.queueSlotBookingProduct.push(productDoc.id)
              }
            }
          }
        });

        await getDocs(query(collection(firestore, 'journey'))).then((journeydocs)=>{
          if(journeydocs.docs.length > 0){
            for (let i = 0; i < journeydocs.docs.length; i++) {
              const journeyDoc = journeydocs.docs[i];
              var journeyData = journeyDoc.data()
              this.mapJourney[journeyDoc.id] = journeyData["journey"]
              if(["uP!", "LYL", "CPM", "B!G"].includes(journeyData["atcmodel"])){
                this.uPandBigJourney.push(journeyDoc.id)
              }
            }
          }
        });

        var tobeCheckProduct = [...this.unlimitedproducts, ... this.queueSlotBookingProduct].map(e => doc(firestore, "products", e))
        console.log("Products to Check", this.unlimitedproducts, this.queueSlotBookingProduct)
        if(tobeCheckProduct.length != 0){
          collectionData(query(collection(firestore,"participantsproduct"), where("productref", "in", tobeCheckProduct))).pipe(takeUntil(this.subscription)).subscribe(list=>{
            console.log("Total Missing product to check", list.length)
            if(list.length != 0){
              var mapProfileProduct = {}
              for (let i = 0; i < list.length; i++) {
                const productData = list[i];
                if(this.mapProfile[productData["profileid"]]){
                  productData["name"] = this.mapProfile[productData["profileid"]]["name"] ?? ""
                  productData["product"] = this.mapProduct[productData["productref"].id]
                  productData["participantmode"] = this.mapProfile[productData["profileid"]]["participantmode"]
                  mapProfileProduct[productData["profileid"]] = mapProfileProduct[productData["profileid"]] ?? []
                  mapProfileProduct[productData["profileid"]].push(productData)
                }
              }
              this.checkProductAvailability(mapProfileProduct)
            }
            loadingref.close()
          });
        }
    })
  }

  ngOnInit(): void {}

  onProfileSelect(){
    console.log("Selected Profile", this.selectedProfile)
    this.selectedProduct = null
    this.filterProduct()
  }

  onProductSelect(){
    console.log("Selected Product", this.selectedProduct)
    this.selectedProfile = null
    this.filterProduct()
  }

  clearProductFilter(){
    this.selectedProfile = null
    this.selectedProduct = null
    this.filterProduct()
  }

  filterProduct(){
    this.hideSpecialProduct()
    this.filterProductSubscription.next()
    this.filterProductSubscription.complete()
    this.filterProductSubscription = new Subject<void>()

    var collectionRef = collection(this.firestore,"participantsproduct")
    var queryList = []
    if(this.selectedProduct){
      queryList.push(where("productref", "==", doc(this.firestore, "products", this.selectedProduct)))
    }
    if(this.selectedProfile){
      queryList.push(where("profileid", "==", this.selectedProfile))
    }
    var queryRef = query(collectionRef, ...queryList)

    // Reset Filter
    if(queryList.length == 0){
      this.allParticipantsData = [];

      if(!this.showSpecialProductFilter){
        this.dataSource.data = []
        this.dataSource.paginator = this.paginator
        this.dataSource.sort = this.sort
      }
      return;
    }

    collectionData(queryRef, { idField: 'id' }).pipe(
      takeUntil(this.subscription),
      takeUntil(this.filterProductSubscription)
    ).subscribe(list=>{
      console.log("Filtered Total product", list.length)
      var data = [];
      for (let i = 0; i < list.length; i++) {
        const productData = list[i];
        if(this.mapProfile[productData["profileid"]]){
          productData["name"] = this.mapProfile[productData["profileid"]]["name"] ?? ""
          productData["product"] = this.mapProduct[productData["productref"].id]
          productData["participantmode"] = this.mapProfile[productData["profileid"]]["participantmode"]
          data.push(productData)
        }
      }
      
      data.sort((a, b) => a["name"].localeCompare(b["name"]))
      
      this.allParticipantsData = data;

      if(!this.showSpecialProductFilter){
        this.dataSource.data = data
        this.dataSource.paginator = this.paginator
        this.dataSource.sort = this.sort
      }
    });
  }

  checkProductAvailability(profileProduct){
    const allProfileIds = Object.keys(this.mapProfile);
    console.log("Slot Queue Product", this.queueSlotBookingProduct)
    var newMissingRecord = {}
    for (let i = 0; i < allProfileIds.length; i++) {
      const profileid = allProfileIds[i];
      var profileProductList = profileProduct[profileid] ?? []

      for (let a = 0; a < this.unlimitedproducts.length; a++) {
        const unlimitedProductID = this.unlimitedproducts[a];
        if(this.uPandBigJourney.includes((this.mapProfile[profileid] ?? {})["activejourney"])){
          var checkAvailable = profileProductList.filter(e => unlimitedProductID == e["productref"].id && [null, "initiated", "ongoing"].includes(e["status"]))
          if(checkAvailable.length == 0){
            var productData = {
              profileid: profileid,
              name: this.mapProfile[profileid]?.['name'] || '',
              participantmode: this.mapProfile[profileid]?.['participantmode'] || '',
              product: this.mapProduct[unlimitedProductID],
              productref: { id: unlimitedProductID },
              status: 'Missing',
              mode: '',
              nextmode: '',
              nextmodedate: null,
              deliverymode: '',
              deliveryplanning: ''
            }
            newMissingRecord = newMissingRecord ?? {}
            newMissingRecord[unlimitedProductID] = newMissingRecord[unlimitedProductID] ?? {productName: this.mapProduct[unlimitedProductID], missingParticipants: []}
            newMissingRecord[unlimitedProductID]["missingParticipants"].push(productData)
          }
        }
      }

      for (let a = 0; a < this.queueSlotBookingProduct.length; a++) {
        const slotProductID = this.queueSlotBookingProduct[a];
        var checkAvailable = profileProductList.filter(e => slotProductID == e["productref"].id && [null, "initiated", "ongoing"].includes(e["status"]))
        if(checkAvailable.length == 0){
          var productData = {
            profileid: profileid,
            name: this.mapProfile[profileid]?.['name'] || '',
            participantmode: this.mapProfile[profileid]?.['participantmode'] || '',
            product: this.mapProduct[slotProductID],
            productref: { id: slotProductID },
            status: 'Missing',
            mode: '',
            nextmode: '',
            nextmodedate: null,
            deliverymode: '',
            deliveryplanning: ''
          }
          newMissingRecord = newMissingRecord ?? {}
          newMissingRecord[slotProductID] = newMissingRecord[slotProductID] ?? {productName: this.mapProduct[slotProductID], missingParticipants: []}
          newMissingRecord[slotProductID]["missingParticipants"].push(productData)
        }
      }
    }
    this.mapMissingProduct = Object.keys(newMissingRecord).length != 0 ? newMissingRecord : null
  }

  showSpecialProduct(productID){
    console.log(productID)
    this.selectedProduct = null
    this.selectedProfile = null
    this.showSpecialProductFilter = true
    this.selectedMissingProduct = this.mapMissingProduct[productID]["productName"]

    this.dataSource.data = this.mapMissingProduct[productID]["missingParticipants"]
    var profileidList = this.dataSource.data.map(e => e["profileid"])
    this.clipboard.copy(profileidList.join(","))
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  hideSpecialProduct(){
    this.showSpecialProductFilter = false
    this.selectedMissingProduct = null

    this.dataSource.data = this.allParticipantsData;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
    
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  filterProfileList(){
    return this.profileList.filter(e => (e["name"] ?? "").toString().toLowerCase().trim().includes(this.dropdownFilterText.toLowerCase().trim()))
  }

  filterProductList(){
    return this.productList.filter(e => (e["product"] ?? "").toString().toLowerCase().trim().includes(this.dropdownFilterText.toLowerCase().trim()))
  }

  /*
  calculateUnlimitedProductsData(unlimitedparticipants: any, allData: any[]) {



    this.unlimitedProductsData = [];
    
    // Get all unique profile IDs from mapProfile
    const allProfileIds = Object.keys(this.mapProfile);
    
    // Create a map of profileId to their latest participant data for quick lookup
    const profileDataMap: { [key: string]: any } = {};
    for (const participant of allData) {
      const profileId = participant.profileid;
      if (profileId) {
        // Store the most recent or any participant data for this profile
        if (!profileDataMap[profileId]) {
          profileDataMap[profileId] = participant;
        }
      }
    }
    
    // For each unlimited product
    for (const productId of this.unlimitedproducts) {
      const productName = this.mapProduct[productId] || productId;
      
      const missingParticipants = allProfileIds.filter(profileId => {
        const participantProducts = unlimitedparticipants[profileId] || [];
        const hasValidProduct = participantProducts.some((p: any) => p.productref.id === productId && (p.status == null || p.status == undefined));
        console.log(hasValidProduct);
        
        return hasValidProduct;
      }).map(profileId => {
          // Get existing participant data if available
          const existingData = profileDataMap[profileId] || {};
          
          return {
            profileid: profileId,
            name: this.mapProfile[profileId]?.['name'] || '',
            participantmode: this.mapProfile[profileId]?.['participantmode'] || '',
            product: productName,
            productref: { id: productId },
            status: 'Missing',
            mode: existingData.mode || '',
            nextmode: existingData.nextmode || '',
            nextmodedate: existingData.nextmodedate || null,
            deliverymode: existingData.deliverymode || '',
            deliveryplanning: existingData.deliveryplanning || ''
          };
        })
        .filter(p => p.name !== ''); // Only include participants with names
      
      this.unlimitedProductsData.push({
        productId: productId,
        productName: productName,
        missingCount: missingParticipants.length,
        missingParticipants: missingParticipants
      });
    }
    
    console.log('Unlimited Products Data:', this.unlimitedProductsData);
  }

  showUnlimitedProductParticipants(productData: any) {
    this.showingUnlimitedProductParticipants = true;
    this.currentUnlimitedProductFilter = productData.productName;
    this.dataSource.data = productData.missingParticipants;
    
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  resetToAllParticipants() {
    this.showingUnlimitedProductParticipants = false;
    this.currentUnlimitedProductFilter = '';
    this.dataSource.data = this.allParticipantsData;
    
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
      this.dataSource.paginator = this.paginator
      this.dataSource.sort = this.sort
    }
  }
  */

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  showMore(value){
    console.log(value)
  }

  calculateDiff(sentDate) {
    var date1:any = new Date(sentDate);
    var date2:any = new Date();
    var diffDays:any = Math.floor((date1 - date2) / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  onTestDateChange(value){
    console.log(value)
    setDoc(doc(this.firestore,"/Atestdate/date"),{
      date: value
    }, {merge: true})
  }

  exportCSV(){
      // If datasource is MatTableDataSource
      const data = this.dataSource.filteredData ?? this.dataSource.data;
  
      // Convert JSON -> Sheet
      const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
  
      // Create workbook
      const wb: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'sheet1');
  
      // Export
      XLSX.writeFile(wb, `Participant_Product.csv`);
      
      // const ws:XLSX.WorkSheet = XLSX.utils.table_to_sheet(this.table.nativeElement)
      // const wb:XLSX.WorkBook = XLSX.utils.book_new();
      // XLSX.utils.book_append_sheet(wb,ws,'sheet1');
      // XLSX.writeFile(wb,'participant.csv')
    }
 
onDateChange(column: string, newDate: Date | null) {
  if (!this.editingCell?.row || !newDate) return;
  const row = this.editingCell.row;
  const timestamp = Timestamp.fromDate(
    new Date(newDate.getFullYear(),newDate.getMonth(),newDate.getDate(),12, 0, 0)
  );
  setDoc(doc(this.firestore, 'participantsproduct', row.id),{statusdate: { ...row.statusdate,[column]: timestamp }},{ merge: true }).then(() => {
    if (!row.statusdate) row.statusdate = {};
    row.statusdate[column] = timestamp;
    this.cancelEdit();
  }).catch(err => {
    this.cancelEdit();
  });
}
// Cancel editing
cancelEdit() {
  this.editingCell = { row: null, column: null };
  this.tempDateValue = null;
}
// enable editing
enableEdit(row: any, column: string) {
  this.editingCell = { row, column };
  this.tempDateValue = row.statusdate?.[column]
    ? row.statusdate[column].toDate()
    : null;
}
}