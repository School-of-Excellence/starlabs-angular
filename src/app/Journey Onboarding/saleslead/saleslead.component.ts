import { HttpClient } from '@angular/common/http';
import { Component, NgZone, ViewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { UpdateDialogComponent } from '../../DialogBox/update-dialog/update-dialog.component';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { Router, RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import { collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { CreateWatsonProfileComponent } from '../create-watson-profile/create-watson-profile.component';
import { MatInputModule } from '@angular/material/input';
import { getApp } from '@angular/fire/app';

@Component({
  selector: 'app-saleslead',
  imports: [
    MatIconModule,
    MatFormFieldModule,
    CommonModule,
    MatButtonModule,
    MatSelectModule,
    FormsModule,
    MatDatepickerModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatInputModule,
    RouterModule
  ],
  templateUrl: './saleslead.component.html',
  styleUrl: './saleslead.component.css'
})
export class SalesleadComponent {

  // packagedesignList = []
  listOfSalesLeadsDoc: any = []
  journeyList = [];
  originalData: any[] = [];
  tableHeader = ["name", "purchasedate", "journey", "addons", "bonus", "date", "journeytype", "salesperson", "initialpayment", "approve", "reject", "cancel"];
  tableData: MatTableDataSource<any> = new MatTableDataSource();
  @ViewChild(MatSort) matsort: MatSort
  @ViewChild(MatPaginator) paginator: MatPaginator
  mapJourney: any = {}
  mapJourneyProduct: any = {}
  mapPackageName: any = {}
  mapProduct: any = {}
  mapProductminimumamount = {}
  mapPackage = {}
  get loading() {
    return this.dialog.open(LoadingProgressComponent, { data: { msg: "Processing Please Wait..." }, disableClose: true })
  }

  selectedJourney: string = '';
  selectedJourneyType: string = '';
  selectedStatus: string = '';
  journeyOptions: any[] = [];

  journeyTypeCounts = {
    new: 0,
    upgrade: 0,
    downgrade: 0,
    cancelled: 0,
    addons: 0
  };
  private subscription = new Subject<void>();
  dateRangeForm;
  //watson database variable
  watsonDatabase;
  constructor(public snackbar: MatSnackBar, public formbuilder: FormBuilder, public guard: AuthguardService, public router: Router, public firestore: Firestore, public dialog: MatDialog, public http: HttpClient, private ngZone: NgZone) {
    this.dateRangeForm = this.formbuilder.group({
      start: [null],
      end: [null],
      addedstart: [null],
      addedend: [null]
    });
    guard.getRoles().then(async roles => {
      guard.initializeWatson().then(() => {
        this.watsonDatabase = getFirestore(getApp("watson"))
      })

      // if (roles.admin || roles.ah || roles.integrator) {
        const salesleadsRef = collection(this.firestore, "salesleads")
        const salesleadsQuery = query(salesleadsRef, orderBy('date', 'desc'))
        collectionSnapshots(salesleadsQuery).pipe(takeUntil(this.subscription)).subscribe(async leadsnap => {
          this.listOfSalesLeadsDoc = leadsnap.map(doc => {
            let id = doc.id
            let element = doc.data();
            element['id'] = id
            return element
          });
          this.originalData = [...this.listOfSalesLeadsDoc];
          this.ngAfterViewInit()
          this.updateJourneyTypeCounts();
        });

        guard.getJourneyMap().then(jrny => this.mapJourney = jrny);
        guard.getProductMap().then(e => this.mapProduct = e);
        guard.getJourneyToProductMap().then(e => this.mapJourneyProduct = e);
        guard.getPackageMap().then(e => this.mapPackage = e);

        await getDocs(collection(this.firestore, "package")).then(snap => {
          for (let i = 0; i < snap.docs.length; i++) {
            const packageelement = snap.docs[i].data();
            this.mapPackageName[packageelement['package'].toLowerCase().replace(/\s/g, "")] = packageelement['docid']
          }
        });

        await getDocs(query(collection(this.firestore, "products"), orderBy("product"))).then(product => {
          for (let i = 0; i < product.docs.length; i++) {
            const doc = product.docs[i];
            const data = doc.data()
            this.mapProductminimumamount[doc.id] = data
          }
        });

        await getDocs(query(collection(this.firestore, "journey"), orderBy("journey"))).then(journey => {
          this.journeyList = [];
          for (let i = 0; i < journey.docs.length; i++) {
            const doc = journey.docs[i];
            const data = doc.data();
            this.journeyList.push({
              "value": doc.id,
              "label": data['journey']
            });
          }
        });

      // }
      // else {
      //   router.navigateByUrl('/');
      // }
    })
  }

  ngOnInit() {
  }

  ngOnDestroy(): void {
    this.subscription.next();
    this.subscription.complete();
  }
  nonNullCheck(value: any): boolean {
    return value !== null && value !== undefined;
  }

  typecheck(value: any): string {
    return typeof value;
  }

  // Filter functions
  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.tableData.filter = filterValue.trim().toLowerCase();

    if (this.tableData.paginator) {
      this.tableData.paginator.firstPage();
    }

    // Update dashboard counts based on filtered data
    this.updateJourneyTypeCounts();
  }

  applyFilters() {
    // Start with the original data
    let filteredData = [...this.originalData];

    // Apply journey filter
    if (this.selectedJourney) {
      filteredData = filteredData.filter(row => row.journey === this.selectedJourney);
    }

    // Apply journey type filter
    if (this.selectedJourneyType) {
      filteredData = filteredData.filter(row => row.journeytype === this.selectedJourneyType);
    }

    // Apply status filter
    if (this.selectedStatus) {
      if (this.selectedStatus === 'approved') {
        filteredData = filteredData.filter(row => row.status?.toLowerCase().trim() === 'approved' 
          // ||  row.initialpaymentapproved === true
        );
      } else if (this.selectedStatus === 'pending') {
        filteredData = filteredData.filter(row =>
          (row.status === null || row.status === undefined)
          //  &&(row.initialpaymentapproved === undefined || row.initialpaymentapproved === null)
        );
      } else if (this.selectedStatus === 'rejected') {
        filteredData = filteredData.filter(row =>
          row.status?.toLowerCase().trim() === 'rejected' && (row.status != null || row.status != undefined)
          // || row.initialpaymentapproved === false
        );
      }
    }

    // Apply date range filter
    const purchasestartDate = this.dateRangeForm.get('start')?.value;
    const purchaseendDate = this.dateRangeForm.get('end')?.value;

    if (purchasestartDate || purchaseendDate) {
      filteredData = filteredData.filter(row => {
        if (!row.purchasedate) return false;

        let purchaseDate: Date;
        if (typeof row.purchasedate === 'string') {
          purchaseDate = new Date(row.purchasedate);
        } else {
          purchaseDate = row.purchasedate.toDate();
        }

        if (purchasestartDate && purchaseendDate) {
          // Add one day to end date to include the end date in results
          const adjustedEndDate = new Date(purchaseendDate);
          adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
          return purchaseDate >= purchasestartDate && purchaseDate < adjustedEndDate;
        } else if (purchasestartDate) {
          return purchaseDate >= purchasestartDate;
        } else if (purchaseendDate) {
          // Add one day to end date to include the end date in results
          const adjustedEndDate = new Date(purchaseendDate);
          adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
          return purchaseDate < adjustedEndDate;
        }

        return true;
      });
    }

    // Apply date range filter
    const addedstartDate = this.dateRangeForm.get('addedstart')?.value;
    const addedendDate = this.dateRangeForm.get('addedend')?.value;

    if (addedstartDate || addedendDate) {
      filteredData = filteredData.filter(row => {
        if (!row.purchasedate) return false;

        let date: Date;
        if (typeof row.purchasedate === 'string') {
          date = new Date(row.purchasedate);
        } else {
          date = row.purchasedate.toDate();
        }

        if (addedstartDate && addedendDate) {
          // Add one day to end date to include the end date in results
          const adjustedEndDate = new Date(addedendDate);
          adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
          return date >= addedstartDate && date < adjustedEndDate;
        } else if (addedstartDate) {
          return date >= addedstartDate;
        } else if (addedendDate) {
          // Add one day to end date to include the end date in results
          const adjustedEndDate = new Date(addedendDate);
          adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
          return date < adjustedEndDate;
        }

        return true;
      });
    }

    this.tableData.data = filteredData;

    // Update dashboard counts based on filtered data
    this.updateJourneyTypeCounts();

    // Reset to first page
    if (this.tableData.paginator) {
      this.tableData.paginator.firstPage();
    }
  }

  resetFilters() {
    this.selectedJourney = '';
    this.selectedJourneyType = '';
    this.selectedStatus = '';
    this.dateRangeForm.reset();

    // Reset search input
    const inputElement = document.querySelector('input[matInput]') as HTMLInputElement;
    if (inputElement) {
      inputElement.value = '';
    }

    this.tableData.filter = '';
    this.tableData.data = this.originalData;

    if (this.tableData.paginator) {
      this.tableData.paginator.firstPage();
    }
    this.updateJourneyTypeCounts();
  }

  // Dashboard functions
  updateJourneyTypeCounts() {
    // Reset all counts
    this.journeyTypeCounts = {
      new: 0,
      upgrade: 0,
      downgrade: 0,
      cancelled: 0,
      addons: 0
    };

    // Count each journey type from current filtered data, not originalData
    const currentData = this.tableData.filteredData.length > 0 ? this.tableData.filteredData : this.tableData.data;

    currentData.forEach(row => {
      if (row.journeytype) {
        switch (row.journeytype) {
          case 'new':
            this.journeyTypeCounts.new += 1;
            break;
          case 'upgrade':
            this.journeyTypeCounts.upgrade += 1;
            break;
          case 'downgrade':
            this.journeyTypeCounts.downgrade += 1;
            break;
          case 'cancelled':
            this.journeyTypeCounts.cancelled += 1;
            break;
          case 'addons':
            this.journeyTypeCounts.addons += 1;
            break;
        }
      }
    });
  }

  getJourneyTypeCount(type: string): number {
    switch (type) {
      case 'new':
        return this.journeyTypeCounts.new;
      case 'upgrade':
        return this.journeyTypeCounts.upgrade;
      case 'downgrade':
        return this.journeyTypeCounts.downgrade;
      case 'cancelled':
        return this.journeyTypeCounts.cancelled;
      case 'addons':
        return this.journeyTypeCounts.addons;
      default:
        return 0;
    }
  }

  getPercentage(type: string): number {
    const total = this.tableData.filteredData?.length || this.tableData.data.length;
    if (total === 0) return 0;

    let count = 0;
    switch (type) {
      case 'new':
        count = this.journeyTypeCounts.new;
        break;
      case 'upgrade':
        count = this.journeyTypeCounts.upgrade;
        break;
      case 'addons':
        count = this.journeyTypeCounts.addons;
        break;
      case 'downgrade':
        count = this.journeyTypeCounts.downgrade;
        break;
      case 'cancelled':
        count = this.journeyTypeCounts.cancelled;
        break;
      default:
        return 0;
    }
    return Math.round((count / total) * 100);
  }

  getFilteredPercentage(): number {
    const filteredCount = this.tableData.filteredData?.length || this.tableData.data.length;
    const totalCount = this.originalData.length;

    if (totalCount === 0) return 0;
    return Math.round((filteredCount / totalCount) * 100);
  }

  // Export to Excel
  exportToExcel() {
    const data = this.tableData.data.map(row => {
      const journey = row.journey ? this.mapJourney[row.journey] : '';
      const addons = row.addons ? row.addons.map((addon: string) => this.mapProduct[addon]).join(', ') : '';
      const bonus = row.bonus ? row.bonus.map((bonus: string) => this.mapProduct[bonus]).join(', ') : '';

      let purchaseDate = '';
      if (row.purchasedate) {
        if (typeof row.purchasedate === 'string') {
          purchaseDate = row.purchasedate.substring(0, 10);
        } else {
          const formatter = new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          purchaseDate = formatter.format(row.purchasedate.toDate());
        }
      }

      let date = '';
      if (row.date) {
        date = row.date.toDate().toLocaleDateString();
      }

      let status = 'Pending';
      if (row.status) {
        status = row.status;
      } 
      // else if (row.initialpaymentapproved === true) {
      //   status = 'Approved';
      // } else if (row.initialpaymentapproved === false) {
      //   status = 'Not Approved';
      // }

      return {
        'Name': row.name,
        'Email': row.email,
        'Phone': row.phonenumber,
        'Purchase Date': purchaseDate,
        'Sales Person': row.salespersonname ?? 'NA',
        'Journey': journey,
        'Addons': addons,
        'Bonus': bonus,
        'Date': date,
        'Journey Type': row.journeytype ? row.journeytype.toUpperCase() : '',
        'Status': status,
        'Sales Notes': row.notes ?? ''
      };
    });

    // Create worksheet
    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);

    // Set column widths
    const wscols = [
      { wch: 20 }, // Name
      { wch: 30 }, // Email
      { wch: 15 }, // Phone
      { wch: 15 }, // Purchase Date
      { wch: 20 }, // Journey
      { wch: 30 }, // Addons
      { wch: 30 }, // Bonus
      { wch: 15 }, // Date
      { wch: 15 }, // Journey Type
      { wch: 15 }  // Status
    ];
    worksheet['!cols'] = wscols;

    // Create workbook
    const workbook: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Leads');

    // Generate Excel file
    const excelBuffer: any = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

    // Save to file
    const data_blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Create download link
    const url = window.URL.createObjectURL(data_blob);
    const link = document.createElement('a');
    link.href = url;

    // Get current date for filename
    const today = new Date();
    const date = today.toISOString().substring(0, 10);

    link.download = `Sales_Leads_${date}.xlsx`;
    link.click();

    // Clean up
    window.URL.revokeObjectURL(url);
  }

  ngAfterViewInit() {
    this.tableData.data = this.listOfSalesLeadsDoc
    this.tableData.sort = this.matsort
    this.tableData.paginator = this.paginator
  }

  async validateReview(salesleadData) {

    let loadingref = this.loading
    await this.reviewLead(salesleadData);
    loadingref.close();

  }

  async reviewLead(salesleadData) {
    console.log(salesleadData)
    var watsonReview = this.dialog.open(CreateWatsonProfileComponent, {
      maxHeight: "90vh",
      maxWidth: "90vw",
      panelClass: "custom-dialog-container",
      disableClose: true,
      autoFocus: false,
      data: {
        saleData: salesleadData,
        journeyproductmap: this.mapJourneyProduct,
        productmap: this.mapProduct,
        packagemap: this.mapPackage,
        journeymap: this.mapJourney,
        mappackagename: this.mapPackageName,
        mapproductminimumamount: this.mapProductminimumamount
      },
    });

    watsonReview.afterClosed().subscribe(async result => {
      console.log(result)
      if (result != null) {

        const loadingDialog = this.dialog.open(LoadingProgressComponent, { data: { msg: "Processing Please Wait..." }, disableClose: true });

        let sendData = {
          status: 'Approved',
          watsonparticipantid: salesleadData['watsonparticipantid'],
          salesleadsref: salesleadData['docid'],
          purchasedate: result['purchasedate']
        }

        // Watson Code
        if (salesleadData['journeytype'] == 'new' || salesleadData['journeytype'] == 'upgrade' || salesleadData['journeytype'] == 'addons') {

          if (result != null && result['ppData'].length != 0) {
            await this.guard.updateDeliverySequence(result['profileid'], result['ppData']).then(() => {
              console.log('updateDeliverySequence successfully triggered');
            });
          }

          sendData['docid'] = salesleadData['canceldocid'] == null ? salesleadData['docid'] : salesleadData['canceldocid'],
          sendData['status'] = 'Approved',
          sendData['journeytype'] = salesleadData['journeytype'],
          sendData['journeyproductpurchaseid'] = ['new', 'addons'].includes(salesleadData['journeytype']) ? salesleadData['journeyproductpurchaseid'] : salesleadData['upgradetojourneyproductpurchaseid'];
          sendData['participantjourneyproductid'] = ['new', 'addons'].includes(salesleadData['journeytype']) ? salesleadData['participantjourneyproductid'] : salesleadData['upgradetoparticipantjourneyproductid'];
          sendData['upgradetodocid'] = salesleadData['upgradetodocid']
          sendData['upgradefromdocid'] = salesleadData['upgradefromdocid']
          sendData['salesleadsref'] = salesleadData['docid']

          if (![null, undefined, ''].includes(result['initialpaymentbalance'])) {
            sendData['initialpaymentbalance'] = result['initialpaymentbalance']
          }

          if (![null, undefined, ''].includes(result['pendingbalanceamount'])) {
            sendData['pendingbalanceamount'] = result['pendingbalanceamount']
          }

          if (salesleadData['journeytype'] == 'new' || salesleadData['journeytype'] == 'upgrade') {
            sendData['journeystatus'] = 'currentjourney'
          } else if (salesleadData['jounreytype'] == 'addons') {
            sendData['journeystatus'] = 'addons'
          } else {
            sendData['journeystatus'] = salesleadData['journeytype']
          }

        } else if (salesleadData['journeytype'] == 'downgrade') {

          await getDoc(doc(collection(this.firestore, 'participantjourneyproduct'), salesleadData['downgradefromparticipantjourneyproductid'])).then(async (pjpDoc) => {

            if (pjpDoc.exists()) {

              sendData['journeytype'] = 'downgrade',
              sendData['docid'] = salesleadData['downgradetodocid']

              sendData['downgradefromdocid'] = salesleadData['downgradefromdocid'],
              sendData['downgradetodocid'] = salesleadData['downgradetodocid'],

              sendData['downgradefromwatsonpurchaseid'] = salesleadData['downgradefromwatsonpurchaseid'],
              sendData['downgradefromjourneyproductpurchaseid'] = salesleadData['downgradefromjourneyproductpurchaseid'],
              sendData['downgradefromparticipantjourneyproductid'] = salesleadData['downgradefromparticipantjourneyproductid'],

              sendData['downgradetowatsonpurchaseid'] = salesleadData['downgradetowatsonpurchaseid'],
              sendData['downgradetojourneyproductpurchaseid'] = salesleadData['downgradetojourneyproductpurchaseid'],
              sendData['downgradetoparticipantjourneyproductid'] = salesleadData['downgradetoparticipantjourneyproductid']

            } else {
              if (result != null) {
                await this.guard.updateDeliverySequence(result['profileid'], result['ppData']).then(() => {
                  console.log('updateDeliverySequence successfully triggered');
                });
              }

              sendData['journeystatus'] = 'downgrade',
              sendData['journeytype'] = 'downgrade',
              sendData['docid'] = salesleadData['downgradetodocid'],
              sendData['downgradefromdocid'] = salesleadData['downgradefromdocid'],
              sendData['downgradetodocid'] = salesleadData['downgradetodocid'],

              sendData['downgradefromwatsonpurchaseid'] = salesleadData['downgradefromwatsonpurchaseid'],
              sendData['downgradefromjourneyproductpurchaseid'] = salesleadData['downgradefromjourneyproductpurchaseid'],
              sendData['downgradefromparticipantjourneyproductid'] = salesleadData['downgradefromparticipantjourneyproductid'],

              sendData['downgradetowatsonpurchaseid'] = salesleadData['downgradetowatsonpurchaseid'],
              sendData['downgradetojourneyproductpurchaseid'] = salesleadData['downgradetojourneyproductpurchaseid'],
              sendData['downgradetoparticipantjourneyproductid'] = salesleadData['downgradetoparticipantjourneyproductid']

            }
          });

        } else if (salesleadData['journeytype'] == 'cancelled') {

          sendData['docid'] = salesleadData['canceldocid'],
          sendData['journeytype'] = 'cancelled',
          sendData['journeystatus'] = 'cancelled',
          sendData['watsonpurchaseid'] = salesleadData['watsonpurchaseid'],
          sendData['journeyproductpurchaseid'] = salesleadData['journeyproductpurchaseid']
          sendData['participantjourneyproductid'] = salesleadData['participantjourneyproductid']

        }

        await updateDoc(doc(this.firestore, "salesleads", salesleadData['id']), {
          status: "Approved",
          initialpaymentbalance: [null, undefined, ''].includes(result['initialpaymentbalance']) ? null : result['initialpaymentbalance'],
          pendingbalanceamount: [null, undefined, ''].includes(result['pendingbalanceamount']) ? null : result['pendingbalanceamount'],
          statusupdateddate: new Date()
        }).then(() => {
          console.log("Sale Approve successfully");
          this.guard.openSnackBar('Sale Approve successfully', "OK",600);
        }).catch((error) => {
          console.error('Error while approving sale ', error);
          this.guard.openSnackBar('Error while approving sale ' + error, "OK",600);
        })

        let url: string;
        if (environment.firebase.projectId === "starlabs-test") {
          url = "https://us-central1-salescrm-test-19.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
        } else {
          url = "https://us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData);
        }

        this.http.get(url).subscribe((res) => {
          console.log("Response", res)
          loadingDialog.close();
        })

        this.ngZone.run(() => {
          loadingDialog.close();
        });

      }
      else {
        this.guard.openSnackBar("No Action Taken", "OK",600)
      }
    });

  }

  // async updateExistingPurchaseDowngrade(result, salesleadData) {

  //   //downgrading from status change
  //   await updateDoc(doc(this.firestore, "participantjourneyproduct", salesleadData['downgradefromparticipantjourneyproductid']), {
  //     journeystatus: "downgraded"
  //   }).then(() => {
  //     console.log("participantjourneyproduct downgrade status updated successfully");
  //   }).catch((error) => {
  //     console.log('participantjourneyproduct downgrade status error', error);
  //   });

  //   //changing journey status in participantjourney product
  //   await getDoc(doc(this.firestore, "participantjourneyproduct", salesleadData['downgradetoparticipantjourneyproductid'])).then(async (pjpDoc) => {

  //     if (pjpDoc.data()['journeystatus'] == 'upgraded') {
  //       const docRef = pjpDoc.ref
  //       await updateDoc(docRef, {
  //         journeystatus: "ongoing"
  //       }).then(() => {
  //         console.log("participantjourneyproduct downgrade status updated successfully");
  //       }).catch((error) => {
  //         console.log('participantjourneyproduct downgrade status error', error);
  //       });

  //     } else {
  //       console.log('participantjourneyproduct journey status is not upgrade so we cant update..');
  //     }
  //   });

  //   let ParticipantPurchasesRef = doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['downgradefromwatsonpurchaseid'])
  //   let purchaseBeforeUpdateData = (await getDoc(ParticipantPurchasesRef)).data()
  //   purchaseBeforeUpdateData['lastupdate'] = new Date()
  //   purchaseBeforeUpdateData['downgradeoweus'] = salesleadData['oweus']

  //   await setDoc(doc(this.watsonDatabase, "ParticipantPurchases_history", purchaseBeforeUpdateData['id']), purchaseBeforeUpdateData).then(() => {
  //     console.log("ParticipantPurchase Log Updated Successfully");
  //   }).catch((error) => {
  //     console.log("Oops Somenthing went wrong while updating participant Purchase");
  //   });

  //   let purchaseDate = salesleadData['installmentstartdate'].toDate();
  //   let nextMonthLastDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 2, 0).getDate();
  //   let date = nextMonthLastDate < purchaseDate.getDate() ? nextMonthLastDate : purchaseDate.getDate();
  //   let fromPurchaseDateToNextMonth = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, date);

  //   // updating the journey status in participantpurchase watson
  //   await updateDoc(doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['downgradefromwatsonpurchaseid']), {
  //     purchasestatus: 'downgrade',
  //     lastupdate: new Date(),
  //     purchasecancelamount: salesleadData['oweus'],
  //     paymentday: salesleadData.dueday,
  //     installmentamount: salesleadData.installmentsData[0]['installmentamount'],
  //     installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //     salesperson: salesleadData.salespersonname,
  //     purchaseupdate_ts: new Date(),
  //     installmentsData: salesleadData.installmentsData,
  //   }).then(() => {
  //     console.log('watson purchase cancelled successfully');
  //   }).catch((error) => {
  //     console.log(error, 'error while cancelling participant purchase');
  //   });

  //   // changing the jorney status in participantpurchase watson
  //   await updateDoc(doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['downgradetowatsonpurchaseid']), {
  //     purchasestatus: 'active',
  //     lastupdate: new Date(),
  //   }).then(() => {
  //     console.log('watson purchase cancelled successfully');
  //   }).catch((error) => {
  //     console.log(error, 'error while cancelling participant purchase');
  //   });

  //   // starlabs salesleads doc update
  //   await updateDoc(doc(this.firestore, "salesleads", salesleadData['id']), {
  //     status: "Approved",
  //     statusupdateddate: new Date(),
  //     // statusupdateddate : new Date(#rangePicker), TODO

  //   }).then(() => {

  //     //send data to salesCRM
  //     let url: string;
  //     var sendData = {}
  //     sendData['status'] = 'Approved',
  //       sendData['journeytype'] = 'downgrade',
  //       sendData['docid'] = salesleadData['downgradetodocid']

  //     sendData['downgradefromdocid'] = salesleadData['downgradefromdocid'],
  //       sendData['downgradetodocid'] = salesleadData['downgradetodocid'],

  //       sendData['downgradefromwatsonpurchaseid'] = salesleadData['downgradefromwatsonpurchaseid'],
  //       sendData['downgradefromjourneyproductpurchaseid'] = salesleadData['downgradefromjourneyproductpurchaseid'],
  //       sendData['downgradefromparticipantjourneyproductid'] = salesleadData['downgradefromparticipantjourneyproductid'],

  //       sendData['watsonparticipantid'] = salesleadData['watsonparticipantid'],

  //       sendData['downgradetowatsonpurchaseid'] = salesleadData['downgradetowatsonpurchaseid'],
  //       sendData['downgradetojourneyproductpurchaseid'] = salesleadData['downgradetojourneyproductpurchaseid'],
  //       sendData['downgradetoparticipantjourneyproductid'] = salesleadData['downgradetoparticipantjourneyproductid']

  //     sendData['salesleadsref'] = salesleadData['docid']

  //     if (environment.firebase.projectId === "starlabs-test") {
  //       url = "https://us-central1-salescrm-test-19.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //     } else {
  //       url = "https://us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //     }
  //     this.http.get(url).toPromise().then(res => {
  //       console.log(res);
  //     });
  //   });
  // }

  // async updateNewPurchaseDowngrade(result, salesleadData) {

  //   // fetching the profile data
  //   var profile;
  //   await getDoc(doc(this.firestore, "profile_data", salesleadData['profileid'])).then((profileDoc) => {
  //     profile = profileDoc.data();
  //   });

  //   let batch = writeBatch(this.watsonDatabase)
  //   let participantid = salesleadData['watsonparticipantid']
  //   let purchaseid = salesleadData['downgradetowatsonpurchaseid']
  //   let paymentid = doc(collection(this.watsonDatabase, 'ParticipantPayments')).id
  //   let purchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", purchaseid)
  //   let paymentref = doc(this.watsonDatabase, "ParticipantPayments", paymentid)

  //   let purchaseDate = new Date(salesleadData.purchasedate.toDate())
  //   let installmentstartmonth = new Date(salesleadData.installmentstartdate.toDate());
  //   let nextMonthLastDate = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth() + 2, 0).getDate()
  //   let date = nextMonthLastDate < installmentstartmonth.getDate() ? nextMonthLastDate : installmentstartmonth.getDate()
  //   // let fromPurchaseDateToNextMonth = new Date(installmentstartmonth.getFullYear(),installmentstartmonth.getMonth(),date)
  //   let fromPurchaseDateToNextMonth = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth() + 1, date)

  //   // creating purchase in watsoncancel
  //   batch.set(purchaseRef, {
  //     participantid: participantid,
  //     fee: result['totalpurchasevalue'],
  //     gst: Math.ceil(result['totalpurchasevalue'] * .18),
  //     gross: result['totalpurchasevalue'] + Math.ceil(result['totalpurchasevalue'] * .18),
  //     initialpayment: salesleadData.initialpayment,
  //     // product: result['purchaselabel']['packagelabel'],
  //     product: result['purchaselabel'],
  //     // packagedesignid: result['purchaselabel']['docid'],
  //     purchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //     purchasedate_ts: salesleadData.purchasedate.toDate(),
  //     id: purchaseid,
  //     installmentamount: salesleadData.installmentamount,
  //     installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //     paymentday: salesleadData.dueday,
  //     status: salesleadData.journeytenure <= 1 ? "Fully Paid" : "due",
  //     salesperson: salesleadData.salespersonname,
  //     originalfee: salesleadData['originalfee'], // result['purchaselabel']['originalpurchaseamount'] != null || result['purchaselabel']['originalpurchaseamount'] != undefined ? result['purchaselabel']['originalpurchaseamount'] : null
  //     purchasestatus: 'active',
  //     purchasetype: 'journey',
  //     installmentsData: salesleadData.installmentsData,
  //     downgradepurchase: true,
  //     paymentid: salesleadData['paymentid'],
  //     salenotes: salesleadData['notes'],
  //   });

  //   // creating payment in watson
  //   batch.set(paymentref, {
  //     date: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //     receipt: salesleadData.initialpayment,
  //     fee: Math.ceil(salesleadData.initialpayment / 1.18),
  //     gst: salesleadData.initialpayment - Math.ceil(salesleadData.initialpayment / 1.18),
  //     participantid: participantid,
  //     id: paymentid,
  //     fluid: false,
  //     paymentdate: salesleadData.purchasedate.toDate(),
  //     paymentid: salesleadData['paymentid'],
  //     type: 'tokenpayment',
  //     p_type: 'newpayment',
  //     newpaymentamount: salesleadData.initialpayment
  //   });

  //   await batch.commit();

  //   // updating journey status in participantpurchase watson
  //   await updateDoc(doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['downgradefromwatsonpurchaseid']), {
  //     purchasestatus: 'downgrade',
  //     lastupdate: new Date(),
  //     salesperson: salesleadData.salespersonname,
  //     cancelled: true,
  //     purchasecanceldate: new Date()
  //   }).then(() => {
  //     console.log('watson purchase cancelled successfully');
  //   }).catch((error) => {
  //     console.log(error, 'error while cancelling participant purchase');
  //   });

  //   //status changing for the downgrading journey
  //   await updateDoc(doc(this.firestore, "participantjourneyproduct", salesleadData['downgradefromparticipantjourneyproductid']), {
  //     journeystatus: "downgraded"
  //   }).then(() => {
  //     console.log("participantjourneyproduct downgrade status updated successfully");
  //   }).catch((error) => {
  //     console.log('participantjourneyproduct downgrade status error', error);
  //   });

  //   for (const key in salesleadData) {
  //     if (['journey', 'addons'].includes(key)) {

  //       if (salesleadData['journey'] != null || salesleadData['addons'].length != 0) {
  //         if ((key === 'journey' && salesleadData['journey'] != null) || (key === 'addons' && salesleadData['addons'].length != 0)) {
  //           //jpp - journey product purchase
  //           //pjpId - participant journey product

  //           let jppid = salesleadData['downgradetojourneyproductpurchaseid']
  //           let pjpId = salesleadData['downgradetoparticipantjourneyproductid']
  //           let journeyRef = key === 'journey' && salesleadData['journey'] != null ? doc(this.firestore, "journey", salesleadData['journey']) : null
  //           //creating participant products and productreflist
  //           let participantProducts = []
  //           let journeyProductRefList = []
  //           let journeyPackageRef = null

  //           if (key === 'journey' && salesleadData['journey'] != null) {
  //             console.log(salesleadData['journey']);
  //             console.log(this.mapJourney[salesleadData['journey']].toLowerCase().replace(/\s/g, ""));
  //             console.log(this.mapPackageName[this.mapJourney[salesleadData['journey']].toLowerCase().replace(/\s/g, "")]);

  //             journeyPackageRef = doc(collection(this.firestore, "package"), this.mapPackageName[this.mapJourney[salesleadData['journey']].toLowerCase().replace(/\s/g, "")])

  //             //creating journey product list for journey
  //             for (let i = 0; i < this.mapJourneyProduct[salesleadData.journey].length; i++) {
  //               const productElementRef = this.mapJourneyProduct[salesleadData.journey][i];
  //               const pJpRef = doc(collection(this.firestore, 'participantsproduct'));
  //               participantProducts.push({
  //                 participantproductid: pJpRef.id,
  //                 productref: productElementRef,
  //                 packageref: journeyPackageRef
  //               })
  //               journeyProductRefList.push(productElementRef)
  //             }
  //           }
  //           if (key === 'addons' && salesleadData['addons'].length != 0) {
  //             let addonsPackageRef = doc(this.firestore, "package", this.mapPackageName[key])
  //             //creating journey product list for addons
  //             for (let i = 0; i < salesleadData['addons'].length; i++) {
  //               const addonsProduct = salesleadData['addons'][i];
  //               const addonsProductRef = doc(this.firestore, "products", addonsProduct);
  //               const pJpRef = doc(collection(this.firestore, 'participantsproduct'));
  //               participantProducts.push({
  //                 participantproductid: pJpRef.id,
  //                 productref: addonsProductRef,
  //                 packageref: addonsPackageRef
  //               });
  //               journeyProductRefList.push(addonsProductRef)
  //             }
  //           }
  //           if (salesleadData['bonus'].length != 0) {
  //             let bonusPackageRef = doc(this.firestore, "package", this.mapPackageName['bonus'])

  //             //creating journey product list for bonus
  //             for (let i = 0; i < salesleadData['bonus'].length; i++) {
  //               const bonusProduct = salesleadData['bonus'][i];
  //               const bonusProductRef = doc(this.firestore, "products", bonusProduct);
  //               const pJpRef = doc(collection(this.firestore, 'participantsproduct'));
  //               participantProducts.push({
  //                 participantproductid: pJpRef.id,
  //                 productref: bonusProductRef,
  //                 packageref: bonusPackageRef
  //               })
  //               journeyProductRefList.push(bonusProductRef)
  //             }

  //           }
  //           // add journeyproductpurchase
  //           await setDoc(doc(this.firestore, "journeyproductpurchase", jppid), {
  //             docid: jppid,
  //             journeyref: journeyRef,
  //             participantjourneyproductref: doc(this.firestore, "participantjourneyproduct", pjpId),
  //             productref: journeyProductRefList,
  //             profileid: profile["profileid"],
  //             purchasetype: journeyRef != null ? 'journey' : 'product',
  //             watsonpurchaseid: salesleadData['downgradetowatsonpurchaseid'],
  //             watsonpurchaselabel: salesleadData['purchaselabel'],
  //             // packagedesignid: result['purchaselabel']['docid'],
  //           }).then(async () => {

  //             var data = {
  //               profileid: profile["profileid"],
  //               paymentcommitment: 'nach',
  //               paymentcommitmentupdateddate: new Date(),
  //               currentemi: salesleadData.installmentamount,
  //             }

  //             if (!['', null, undefined].includes(salesleadData['billingemail'])) {
  //               data['billingemail'] = salesleadData['billingemail']
  //             }

  //             if (!['', null, undefined].includes(salesleadData['billingaddress'])) {
  //               data['billingaddress'] = salesleadData['billingaddress']
  //             }

  //             if (!['', null, undefined].includes(salesleadData['gstno'])) {
  //               data['gstno'] = salesleadData['gstno']
  //             }

  //             //updaing profile id in watson
  //             await updateDoc(doc(this.watsonDatabase, "Participants", salesleadData['watsonparticipantid']), data)
  //             console.log("profileid updated in participant collection");

  //             // updating recent purchase date in watson
  //             await updateDoc(doc(this.firestore, "profile_data", profile['profileid']), {
  //               recentpurchasedate: salesleadData.purchasedate.toDate()
  //             });
  //             console.log("recent purhase date updated in profile");
  //             console.log("journeyproductpurchase document created");

  //             // add participantjourneyproduct
  //             await setDoc(doc(this.firestore, "participantjourneyproduct", pjpId), {
  //               docid: pjpId,
  //               journeyref: journeyRef,
  //               journeystatus: null,
  //               participantproducts: participantProducts,
  //               productref: journeyProductRefList,
  //               profileid: profile["profileid"],
  //               purchaseref: doc(this.firestore, "journeyproductpurchase", jppid),
  //               subscriptionend: result['subscriptionend'],
  //               subscriptionstart: result['subscriptionstart'],
  //               purchasedate: salesleadData['purchasedate'],
  //               salesperson: salesleadData['salespersonname'],
  //               presalesperson: salesleadData['presalesperson'],
  //               salesnote: salesleadData['notes'],
  //               journeytype: salesleadData['journeytype'],
  //               salesleadsref: doc(this.firestore, "salesleads", salesleadData['docid']),
  //               onboarded: false
  //             }).then(async () => {
  //               console.log("participantjourneyproduct document created");
  //               //sequence order checking
  //               let sequenceOrder = 0
  //               var ppData = []
  //               await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", profile["profileid"]))).then(async snap => {
  //                 sequenceOrder = snap.docs.length
  //                 for (let j = 0; j < snap.docs.length; j++) {
  //                   const element = snap.docs[j].data();
  //                   ppData.push({
  //                     docid: element["docid"],
  //                     productref: element["productref"].id
  //                   })
  //                 }
  //               });

  //               // add participantsproduct
  //               for (let i = 0; i < participantProducts.length; i++) {
  //                 const ppelement = participantProducts[i];
  //                 var map = {};
  //                 var minimumpayment = parseInt(this.mapProductminimumamount[ppelement['productref'].id]['minimumrequiredamount']) ?? 0
  //                 await setDoc(doc(this.firestore, "participantsproduct", ppelement['participantproductid']), {
  //                   docid: ppelement['participantproductid'],
  //                   journeyref: journeyRef,
  //                   productref: ppelement['productref'],
  //                   packageref: ppelement['packageref'],
  //                   status: null,
  //                   sequenceorder: i + sequenceOrder,
  //                   profileid: profile["profileid"],
  //                   minimumpayment: minimumpayment
  //                 }).then(() => {
  //                   console.log("participantsproduct document created", i);
  //                 }).catch(err => { console.log(err, i, "error on participantproduct created"); })//participantsproduct

  //                 map['docid'] = ppelement['participantproductid']
  //                 map['productref'] = ppelement['productref'].id

  //                 ppData.push(map);
  //               }

  //               await this.guard.updateDeliverySequence(profile['profileid'], ppData).then(() => {
  //                 console.log('updateDeliverySequence successfully triggered');
  //               });

  //               //updating the status in sales leads collection
  //               await updateDoc(doc(this.firestore, "salesleads", salesleadData['id']), {
  //                 status: "Approved",
  //                 statusupdateddate: new Date(),
  //               }).then(() => {

  //                 //sending data to salescrm
  //                 let url: string;
  //                 var sendData = {}
  //                 sendData['status'] = 'Approved',
  //                   sendData['journeystatus'] = 'downgrade',
  //                   sendData['journeytype'] = 'downgrade',
  //                   sendData['docid'] = salesleadData['downgradetodocid'],
  //                   sendData['downgradefromdocid'] = salesleadData['downgradefromdocid'],
  //                   sendData['downgradetodocid'] = salesleadData['downgradetodocid'],
  //                   sendData['watsonparticipantid'] = salesleadData['watsonparticipantid'],

  //                   sendData['downgradefromwatsonpurchaseid'] = salesleadData['downgradefromwatsonpurchaseid'],
  //                   sendData['downgradefromjourneyproductpurchaseid'] = salesleadData['downgradefromjourneyproductpurchaseid'],
  //                   sendData['downgradefromparticipantjourneyproductid'] = salesleadData['downgradefromparticipantjourneyproductid'],

  //                   sendData['downgradetowatsonpurchaseid'] = salesleadData['downgradetowatsonpurchaseid'],
  //                   sendData['downgradetojourneyproductpurchaseid'] = salesleadData['downgradetojourneyproductpurchaseid'],
  //                   sendData['downgradetoparticipantjourneyproductid'] = salesleadData['downgradetoparticipantjourneyproductid']

  //                 sendData['salesleadsref'] = salesleadData['docid']

  //                 if (environment.firebase.projectId === "starlabs-test") {
  //                   url = "https://us-central1-salescrm-test-19.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //                 } else {
  //                   url = "https://us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //                 }
  //                 this.http.get(url).toPromise().then(res => {
  //                   // console.log(res);
  //                 })
  //               });
  //             }).catch(err => { console.log(err); })//participantjourneyproduct
  //           }).catch(err => { console.log(err); })//journeyproductpurchase
  //           // add  journey end
  //         }
  //       }
  //     }
  //   }
  // }

  // async updateWatsonDatabase(salesleadData, result): Promise<any> {
  //   var purchasedata = {}
  //   let purchaseDate = new Date(salesleadData.purchasedate.toDate())
  //   let fromPurchaseDateToNextMonth;
  //   if (salesleadData.installmentstartdate != null) {
  //     let installmentstartmonth = new Date(salesleadData.installmentstartdate.toDate())
  //     let nextMonthLastDate = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth() + 2, 0).getDate()
  //     let date = nextMonthLastDate < installmentstartmonth.getDate() ? nextMonthLastDate : installmentstartmonth.getDate()
  //     // let fromPurchaseDateToNextMonth = new Date(installmentstartmonth.getFullYear(),installmentstartmonth.getMonth()+1,date)
  //     fromPurchaseDateToNextMonth = new Date(installmentstartmonth.getFullYear(), installmentstartmonth.getMonth(), date)
  //   }

  //   //if the journey type is new
  //   if (salesleadData['journeytype'] === 'new') {
  //     let batch = writeBatch(this.watsonDatabase);
  //     let participantid = salesleadData['watsonparticipantid'];
  //     let purchaseid = salesleadData['watsonpurchaseid'];
  //     let paymentid = doc(collection(this.watsonDatabase, 'ParticipantPayments')).id
  //     let participantRef;
  //     let purchaseRef;
  //     let paymentref;

  //     // await firebaseapp.app("watson").firestore().collection("Participants").where("email","==",salesleadData.email.toLowerCase().trim()).get().then((participant)=>{
  //     //   if(participant.docs.length != 0){
  //     //     participantid = participant.docs[0].id
  //     //     participantRef = firebaseapp.app("watson").firestore().collection("Participants").doc(participant.docs[0].id);
  //     //     purchaseRef = firebaseapp.app("watson").firestore().collection("ParticipantPurchases").doc(purchaseid);
  //     //     paymentref = firebaseapp.app("watson").firestore().collection("ParticipantPayments").doc(paymentid);
  //     //   }else{
  //     participantRef = doc(this.watsonDatabase, "Participants", participantid);
  //     purchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", purchaseid);
  //     paymentref = doc(this.watsonDatabase, "ParticipantPayments", paymentid);
  //     //   }
  //     // });

  //     purchasedata["purchaseid"] = purchaseRef.id
  //     purchasedata["participantid"] = participantid
  //     // purchasedata["purchaselabel"] = result['purchaselabel']['packagelabel']
  //     purchasedata["purchaselabel"] = result['purchaselabel']

  //     //creating a participant in watson
  //     batch.set(participantRef, {
  //       id: participantid,
  //       firstname: this.formatName(salesleadData.firstname),
  //       lastname: salesleadData.lastname,
  //       name: this.formatName(salesleadData.name),
  //       email: salesleadData.email.toLocaleLowerCase(),
  //       phone: salesleadData.phonenumber,
  //       countrycode: typeof (salesleadData.countrycode) != 'string' ? salesleadData.countrycode.toString() : salesleadData.countrycode ?? '+91',
  //       firstpurchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       // recentpurchase: result['purchaselabel']['packagelabel'],
  //       recentpurchase: result['purchaselabel'],
  //       pp_totalpurchasevalue: result['totalpurchasevalue'],
  //       pp_totalpaid: Math.ceil(salesleadData.initialpayment / 1.18),
  //       pp_balance: result['totalpurchasevalue'] - Math.ceil(salesleadData.initialpayment / 1.18),
  //       pp_frequency: "monthly",
  //       pp_installmentamount: salesleadData.installmentamount,
  //       currentemi: salesleadData.installmentamount,
  //       pp_installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //       pp_installmentspaid: 0,
  //       pp_paymentday: salesleadData.dueday,
  //       pp_lastpayment: salesleadData.purchasedate,
  //       lastpaymentdate: salesleadData.purchasedate.toDate(),
  //       pp_installmentsdue: Math.ceil((Math.ceil(result['totalpurchasevalue'] / 1.18) - salesleadData.initialpayment) / salesleadData.installmentamount),
  //       pp_status: salesleadData.journeytenure <= 1 ? "Fully Paid" : "due",
  //       customerstatus: "regular",
  //       recentpurchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       paymentcommitment: 'nach',
  //       paymentcommitmentupdateddate: new Date(),
  //       nachrecieved: false,
  //       billingemail: salesleadData['billingemail'],
  //       billingaddress: salesleadData['billingaddress'],
  //       gstno: salesleadData['gstno'],
  //       archive: false,
  //     }, { merge: true });

  //     //creating a purchase in watson
  //     batch.set(purchaseRef, {
  //       participantid: participantid,
  //       fee: result['totalpurchasevalue'],
  //       gst: Math.ceil(result['totalpurchasevalue'] * .18),
  //       gross: parseInt(result['totalpurchasevalue']) + Math.ceil(result['totalpurchasevalue'] * .18),
  //       initialpayment: salesleadData.initialpayment,
  //       // product: result['purchaselabel']['packagelabel'],
  //       product: result['purchaselabel'],
  //       // packagedesignid: result['purchaselabel']['docid'],
  //       purchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       purchasedate_ts: salesleadData.purchasedate.toDate(),
  //       id: purchaseid,
  //       installmentamount: salesleadData.installmentamount,
  //       installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //       paymentday: salesleadData.dueday,
  //       status: salesleadData.journeytenure <= 1 ? "Fully Paid" : "due",
  //       salesperson: salesleadData.salespersonname,
  //       originalfee: salesleadData['originalfee'], // result['purchaselabel']['originalpurchaseamount'] != null || result['purchaselabel']['originalpurchaseamount'] != undefined ? result['purchaselabel']['originalpurchaseamount'] : null
  //       purchasestatus: 'active',
  //       purchasetype: 'journey',
  //       installmentsData: salesleadData.installmentsData,
  //       paymentid: salesleadData['paymentid'],
  //       salenotes: salesleadData['notes']
  //     }, { merge: true });

  //     let participantdata = null;
  //     getDoc(participantRef).then((participant) => {
  //       if (participant.exists()) {
  //         participantdata = participant.data();
  //       }
  //     })

  //     //creating a payment in watson
  //     if (salesleadData.initialpayment > 0) {
  //       batch.set(paymentref, {
  //         date: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //         receipt: salesleadData.initialpayment,
  //         fee: Math.ceil(salesleadData.initialpayment / 1.18),
  //         gst: salesleadData.initialpayment - Math.ceil(salesleadData.initialpayment / 1.18),
  //         participantid: participantid,
  //         id: paymentid,
  //         paymentid: salesleadData['paymentid'],
  //         fluid: false,
  //         paymentdate: salesleadData.purchasedate.toDate(),
  //         updateddate: new Date(),
  //         type: 'tokenpayment',
  //         p_type: 'newpayment',
  //         newpaymentamount: salesleadData.initialpayment,
  //         scheduleamount: 0,
  //         additionalamount: 0,
  //         invoicesent: false,
  //         gstno: [null, undefined, ""].includes(participantdata) ? null : participantdata['gstno'],
  //         billingname: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingname'],
  //         billingaddress: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingaddress'],
  //         billingemail: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingemail'],
  //       })
  //     }
  //     console.log("batch", batch);
  //     try {
  //       await batch.commit();
  //       console.log("Watson Data Created Successfully");
  //     } catch (error) {
  //       console.log("Error Creating Watson Data", error);
  //     }
  //   }
  //   //if the journey type is upgrade
  //   else if (salesleadData['journeytype'] === "upgrade") {
  //     let batch = writeBatch(this.watsonDatabase)
  //     let participantid = salesleadData['watsonparticipantid']
  //     let purchaseid = salesleadData['upgradetowatsonpurchaseid']
  //     let paymentid = doc(collection(this.watsonDatabase, 'ParticipantPayments')).id
  //     let participantRef = doc(this.watsonDatabase, "Participants", participantid)
  //     let purchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", purchaseid)
  //     let paymentref = doc(this.watsonDatabase, "ParticipantPayments", paymentid)
  //     purchasedata["purchaseid"] = purchaseRef.id
  //     purchasedata["participantid"] = participantid
  //     // purchasedata["purchaselabel"] = result['purchaselabel']['packagelabel']
  //     purchasedata["purchaselabel"] = result['purchaselabel']

  //     // Updating last Purchase status
  //     // await firebaseapp.app("watson").firestore().collection("ParticipantPurchases").where("participantid","==",participantid).where("status","==","due").orderBy("purchasedate_ts","desc").get().then(async(participantPurchaeDoc)=>{
  //     await updateDoc(doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['upgradefromwatsonpurchaseid']), {
  //       purchasestatus: "upgrade"
  //     }).then(() => {
  //       console.log('last purchase status updated successfully');
  //     }).catch((error) => {
  //       console.log('Oops error while updating last purchase', error);
  //     });
  //     // });

  //     var data = {
  //       pp_status: result['selectedParticipant']['pp_status'] === 'Fully Paid' ? (salesleadData.journeytenure <= 1 ? "Fully Paid" : "due") : result['selectedParticipant']['pp_status'],
  //       pp_installmentamount: salesleadData.installmentamount,
  //       currentemi: salesleadData.installmentamount,
  //       // recentpurchase: result['purchaselabel']['packagelabel'],
  //       recentpurchase: result['purchaselabel'],
  //       recentpurchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       paymentcommitment: 'nach',
  //       paymentcommitmentupdateddate: new Date(),
  //       nachrecieved: false,
  //     }

  //     // if(!['',null,undefined].includes(salesleadData['billingemail'])){
  //     //   data['billingemail'] = salesleadData['billingemail']
  //     // }

  //     // if(!['',null,undefined].includes(salesleadData['billingaddress'])){
  //     //   data['billingaddress'] = salesleadData['billingaddress']
  //     // }

  //     // if(!['',null,undefined].includes(salesleadData['gstno'])){
  //     //   data['gstno'] = salesleadData['gstno']
  //     // }

  //     // updating participant data
  //     batch.set(participantRef, data, { merge: true });

  //     //creating purchase in watson
  //     batch.set(purchaseRef, {
  //       participantid: participantid,
  //       fee: result['totalpurchasevalue'],
  //       gst: Math.ceil(result['totalpurchasevalue'] * .18),
  //       gross: result['totalpurchasevalue'] + Math.ceil(result['totalpurchasevalue'] * .18),
  //       initialpayment: salesleadData.initialpayment,
  //       // product: result['purchaselabel']['packagelabel'],
  //       product: result['purchaselabel'],
  //       // packagedesignid: result['purchaselabel']['docid'],
  //       purchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       purchasedate_ts: salesleadData.purchasedate.toDate(),
  //       id: purchaseid,
  //       installmentamount: salesleadData.installmentamount,
  //       installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //       paymentday: salesleadData.dueday,
  //       status: result['selectedParticipant']['pp_status'] === 'Fully Paid' ? (salesleadData.journeytenure <= 1 ? "Fully Paid" : "due") : result['selectedParticipant']['pp_status'],
  //       salesperson: salesleadData.salespersonname,
  //       originalfee: salesleadData['originalfee'], // result['purchaselabel']['originalpurchaseamount'] != null || result['purchaselabel']['originalpurchaseamount'] != undefined ? result['purchaselabel']['originalpurchaseamount'] : null
  //       purchasestatus: 'active',
  //       purchasetype: 'journey',
  //       carryover: salesleadData['carryover'],
  //       installmentsData: salesleadData.installmentsData,
  //       paymentid: salesleadData['paymentid'],
  //       salenotes: salesleadData['notes']
  //     });

  //     let participantdata = null;
  //     getDoc(participantRef).then((participant) => {
  //       if (participant.exists()) {
  //         participantdata = participant.data()
  //       }
  //     })

  //     //creating payment in watson
  //     if (salesleadData.initialpayment > 0) {
  //       batch.set(paymentref, {
  //         date: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //         receipt: salesleadData.initialpayment,
  //         fee: Math.ceil(salesleadData.initialpayment / 1.18),
  //         gst: salesleadData.initialpayment - Math.ceil(salesleadData.initialpayment / 1.18),
  //         participantid: participantid,
  //         paymentid: salesleadData['paymentid'],
  //         id: paymentid,
  //         fluid: false,
  //         paymentdate: salesleadData.purchasedate.toDate(),
  //         updateddate: new Date(),
  //         type: 'tokenpayment',
  //         p_type: 'newpayment',
  //         newpaymentamount: salesleadData.initialpayment,
  //         scheduleamount: 0,
  //         additionalamount: 0,
  //         invoicesent: false,
  //         gstno: [null, undefined, ""].includes(participantdata) ? null : participantdata['gstno'],
  //         billingname: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingname'],
  //         billingaddress: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingaddress'],
  //         billingemail: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingemail'],
  //       });
  //     }

  //     await batch.commit();

  //   }
  //   //if the journey type is addons
  //   else if (salesleadData['journeytype'] === "addons") {

  //     var profile;

  //     //fetching the profile data
  //     await getDoc(doc(this.firestore, "profile_data", salesleadData['profileid'])).then((profileDoc) => {
  //       profile = profileDoc.data();
  //     });

  //     //fetching the participant id from watson
  //     var participantid;
  //     const ParticipantsRef = collection(this.watsonDatabase, "Participants")
  //     const participantQuery = query(ParticipantsRef, where("email", "==", salesleadData['email'].toLowerCase().trim()))
  //     await getDocs(participantQuery).then((partcipantDoc) => {
  //       participantid = partcipantDoc.docs[0].data()['id']
  //     })

  //     let batch = writeBatch(this.watsonDatabase)
  //     let purchaseid = salesleadData['watsonpurchaseid'];
  //     let paymentid = doc(collection(this.watsonDatabase, 'ParticipantPayments')).id
  //     let purchaseRef = doc(this.watsonDatabase, "ParticipantPurchases", purchaseid)
  //     let paymentref = doc(this.watsonDatabase, "ParticipantPayments", paymentid)
  //     let participantRef = doc(this.watsonDatabase, "Participants", participantid)


  //     let PurchaseLabel = decodeURIComponent(salesleadData['purchaselabel']);
  //     purchasedata["purchaseid"] = purchaseRef.id
  //     purchasedata["participantid"] = participantid
  //     // purchasedata["purchaselabel"] = result['purchaselabel']['packagelabel']
  //     purchasedata["purchaselabel"] = decodeURIComponent(salesleadData['purchaselabel']);

  //     var lastpaymentscheduledate;
  //     const PaymentScheduleRef = collection(this.watsonDatabase, "Payment Schedule")
  //     const PaymentScheduleQuery = query(PaymentScheduleRef, where("participantid", "==", participantid), orderBy("date", "desc"))
  //     getDocs(PaymentScheduleQuery).then((partcipantDoc) => {
  //       if (partcipantDoc.docs.length != 0) {
  //         lastpaymentscheduledate = partcipantDoc.docs[0].data()['date'].toDate();
  //       } else {
  //         alert('Oops!,No payment Schedule Found in Watson')
  //       }
  //     })

  //     let purchaseDate = salesleadData['installmentatend'] == true ? lastpaymentscheduledate : salesleadData['installmentstartdate'].toDate();
  //     let nextMonthLastDate = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 2, 0).getDate();
  //     let date = nextMonthLastDate < purchaseDate.getDate() ? nextMonthLastDate : purchaseDate.getDate();
  //     let fromPurchaseDateToNextMonth = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, date);

  //     //creating purchase in watson
  //     batch.set(purchaseRef, {
  //       participantid: participantid,
  //       fee: salesleadData['totalpurchasevalue'],
  //       gst: Math.ceil(salesleadData['totalpurchasevalue'] * .18),
  //       gross: result['totalpurchasevalue'] + Math.ceil(result['totalpurchasevalue'] * .18),
  //       initialpayment: salesleadData['initialpayment'],
  //       // product: result['purchaselabel']['packagelabel'],
  //       product: PurchaseLabel,
  //       // packagedesignid: result['purchaselabel']['docid'],
  //       purchasedate: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //       purchasedate_ts: salesleadData.purchasedate.toDate(),
  //       id: purchaseid,
  //       installmentamount: salesleadData['installmentamount'],
  //       installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //       paymentday: salesleadData.dueday,
  //       status: salesleadData.journeytenure <= 1 ? "Fully Paid" : "due",
  //       salesperson: salesleadData.salespersonname,
  //       originalfee: salesleadData['originalfee'], // result['purchaselabel']['originalpurchaseamount'] != null || result['purchaselabel']['originalpurchaseamount'] != undefined ? result['purchaselabel']['originalpurchaseamount'] : null
  //       purchasestatus: 'addons',
  //       purchasetype: 'product',
  //       installmentatend: salesleadData.installmentatend,
  //       installmentsData: salesleadData.installmentsData,
  //       paymentid: salesleadData['paymentid'],
  //       salenotes: salesleadData['notes']
  //     });

  //     let participantdata = null;
  //     getDoc(participantRef).then((participant) => {
  //       if (participant.exists()) {
  //         participantdata = participant.data()
  //       }
  //     })

  //     //creating payment in watson
  //     if (salesleadData.initialpayment > 0) {
  //       batch.set(paymentref, {
  //         date: salesleadData.purchasedate.toDate().toISOString().substring(0, 10),
  //         receipt: salesleadData.initialpayment,
  //         fee: Math.ceil(salesleadData.initialpayment / 1.18),
  //         gst: salesleadData.initialpayment - Math.ceil(salesleadData.initialpayment / 1.18),
  //         participantid: participantid,
  //         id: paymentid,
  //         fluid: false,
  //         paymentid: salesleadData['paymentid'],
  //         paymentdate: salesleadData.purchasedate.toDate(),
  //         updateddate: new Date(),
  //         type: 'tokenpayment',
  //         p_type: 'newpayment',
  //         newpaymentamount: salesleadData.initialpayment,
  //         scheduleamount: 0,
  //         additionalamount: 0,
  //         invoicesent: false,
  //         gstno: [null, undefined, ""].includes(participantdata) ? null : participantdata['gstno'],
  //         billingname: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingname'],
  //         billingaddress: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingaddress'],
  //         billingemail: [null, undefined, ""].includes(participantdata) ? null : participantdata['billingemail'],
  //       });
  //     }

  //     await batch.commit();
  //   }
  //   else if (salesleadData['journeytype'] === "cancelled") {

  //     //update watson purchase for when purchase is cancelled
  //     purchasedata["purchaseid"] = salesleadData['watsonpurchaseid']
  //     purchasedata["participantid"] = salesleadData['watsonparticipantid']
  //     purchasedata["purchaselabel"] = salesleadData['purchaselabel']

  //     let ParticipantPurchasesRef = doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['watsonpurchaseid'])
  //     let purchaseBeforeUpdateData = (await getDoc(ParticipantPurchasesRef)).data()
  //     purchaseBeforeUpdateData['lastupdate'] = new Date()
  //     await setDoc(doc(this.watsonDatabase, "ParticipantPurchases_history", purchaseBeforeUpdateData['id']), purchaseBeforeUpdateData).then(() => {
  //       console.log("ParticipantPurchase Log Updated Successfully");
  //     }).catch((error) => {
  //       console.log("Oops Somenthing went wrong while updating participant Purchase");
  //     });

  //     //updating journey status and cancel status in waston
  //     await updateDoc(doc(this.watsonDatabase, "ParticipantPurchases", salesleadData['watsonpurchaseid']), {
  //       cancelled: true,
  //       purchasestatus: 'cancelled',
  //       purchasecancelamount: salesleadData.totalpurchasevalue,
  //       lastupdate: new Date(),
  //       installmentsData: salesleadData.installmentsData,
  //       installmentamount: salesleadData.installmentsData[0]['installmentamount'],
  //       installmentstartmonth: fromPurchaseDateToNextMonth.toISOString().substring(0, 7),
  //       salenotes: salesleadData['notes'],
  //       purchasecanceldate: new Date()
  //     }).then(() => {
  //       console.log('watson purchase cancelled successfully');
  //     }).catch((error) => {
  //       console.log(error, 'error while cancelling participant purchase');
  //     });

  //   }
  //   return purchasedata
  // }

  // async updateProfilePurchase(salesleadData, result, purchaseData) {
  //   let profileId = salesleadData['profileid']
  //   let profile = {};
  //   // Create Starlabs Profile if not exists
  //   if (salesleadData['journeytype'] === 'new' && salesleadData['journey'] != null) {
  //     await getDocs(query(collection(this.firestore, "profile_data"), where('email', '==', salesleadData.email.toLowerCase()))).then(async profilesnap => {
  //       if (profilesnap.empty) {
  //         // let profileId = this.firestore.createId();
  //         let roleId = doc(collection(this.firestore, 'users_roles')).id
  //         profile = {
  //           name: this.formatName(salesleadData.name),
  //           countrycode: typeof (salesleadData.countrycode) != 'string' ? salesleadData.countrycode.toString() : salesleadData.countrycode ?? '+91',
  //           number: salesleadData.phonenumber,
  //           profile: null,
  //           email: salesleadData.email,
  //           recentpurchase: null,
  //           user_ref: null,
  //           created: new Date(),
  //           enable: true,
  //           block: false,
  //           profileid: profileId,
  //           role_ref: doc(this.firestore, "users_roles", roleId)
  //         }
  //         // creating profile roles 
  //         await setDoc(doc(this.firestore, "profile_data", profileId), profile).then(async () => {
  //           await setDoc(doc(this.firestore, "users_roles", roleId), {
  //             name: this.formatName(salesleadData.name),
  //             profile_ref: doc(this.firestore, "profile_data", profileId),
  //             admin: false,
  //             changeagent: false,
  //             eitfellowship: false,
  //             eitapprentice: false,
  //             eitcoordinator: false,
  //             eventcoordinator: false,
  //             participant: true,
  //             transcriber: false,
  //             verifier: false,
  //             chatxadmin: false,
  //             supportdesk: false,
  //           }).then(() => {
  //             console.log("users_roles document created")
  //           }).catch(err => {
  //             console.log(err, "error on creating users_roles document")
  //           })// users_roles
  //         }).catch(err => {
  //           console.log(err, "error on creating profiledata document")
  //         })// profile_data
  //       }
  //       else {
  //         profile = profilesnap.docs[0].data()
  //         // alert("Given email already exist");
  //       }
  //     })
  //   }
  //   // Update Purchase
  //   if (![null, undefined].includes(profile)) {
  //     console.log('Update Purchase');

  //     for (const key in salesleadData) {
  //       if (['journey', 'addons'].includes(key)) {

  //         if (salesleadData['journey'] != null || salesleadData['addons'].length != 0) {
  //           if ((key === 'journey' && salesleadData['journey'] != null) || (key === 'addons' && salesleadData['addons'].length != 0)) {
  //             //jpp - journey product purchase
  //             //pjpId - participant journey product
  //             let jppid;
  //             let pjpId;
  //             if (salesleadData['journeytype'] == 'new' || salesleadData['journeytype'] == 'addons') {
  //               jppid = salesleadData['journeyproductpurchaseid'];
  //               pjpId = salesleadData['participantjourneyproductid'];
  //             } else if (salesleadData['journeytype'] == 'upgrade') {
  //               jppid = salesleadData['upgradetojourneyproductpurchaseid'];
  //               pjpId = salesleadData['upgradetoparticipantjourneyproductid'];
  //             }
  //             let journeyRef = key === 'journey' && salesleadData['journey'] != null ? doc(this.firestore, "journey", salesleadData['journey']) : null
  //             //creating participant products and productreflist
  //             let participantProducts = []
  //             let journeyProductRefList = []
  //             let journeyPackageRef = null
  //             if (key === 'journey' && salesleadData['journey'] != null) {
  //               journeyPackageRef = doc(this.firestore, "package", this.mapPackageName[this.mapJourney[salesleadData['journey']].toLowerCase().replace(/\s/g, "")])
  //               for (let i = 0; i < this.mapJourneyProduct[salesleadData.journey].length; i++) {
  //                 const productElementRef = this.mapJourneyProduct[salesleadData.journey][i];
  //                 participantProducts.push({
  //                   participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
  //                   productref: productElementRef,
  //                   packageref: journeyPackageRef
  //                 })
  //                 journeyProductRefList.push(productElementRef)
  //               }
  //             }
  //             if (key === 'addons' && salesleadData['addons'].length != 0) {
  //               let addonsPackageRef = doc(this.firestore, "package", this.mapPackageName[key])
  //               for (let i = 0; i < salesleadData['addons'].length; i++) {
  //                 const addonsProduct = salesleadData['addons'][i];
  //                 const addonsProductRef = doc(this.firestore, "products", addonsProduct)
  //                 participantProducts.push({
  //                   participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
  //                   productref: addonsProductRef,
  //                   packageref: addonsPackageRef
  //                 });
  //                 journeyProductRefList.push(addonsProductRef)
  //               }
  //             }
  //             if (salesleadData['bonus'].length != 0) {
  //               let bonusPackageRef = [null, undefined].includes(this.mapPackageName['bonus']) ? null : doc(this.firestore, "package", this.mapPackageName['bonus'])
  //               for (let i = 0; i < salesleadData['bonus'].length; i++) {
  //                 const bonusProduct = salesleadData['bonus'][i];
  //                 const bonusProductRef = doc(this.firestore, "products", bonusProduct)
  //                 participantProducts.push({
  //                   participantproductid: doc(collection(this.firestore, 'participantjourneyproduct')).id,
  //                   productref: bonusProductRef,
  //                   packageref: bonusPackageRef
  //                 })
  //                 journeyProductRefList.push(bonusProductRef)
  //               }
  //             }
  //             // add journeyproductpurchase
  //             await setDoc(doc(this.firestore, "journeyproductpurchase", jppid), {
  //               docid: jppid,
  //               journeyref: journeyRef,
  //               participantjourneyproductref: doc(this.firestore, "participantjourneyproduct", pjpId),
  //               productref: journeyProductRefList,
  //               profileid: profile["profileid"],
  //               purchasetype: journeyRef != null ? 'journey' : 'product',
  //               watsonpurchaseid: purchaseData['purchaseid'],
  //               watsonpurchaselabel: purchaseData['purchaselabel'],
  //               // packagedesignid: result['purchaselabel']['docid'],
  //             }).then(async () => {

  //               var data = {
  //                 profileid: profile["profileid"],
  //                 paymentcommitment: 'nach',
  //                 paymentcommitmentupdateddate: new Date(),
  //               }

  //               if (!['', null, undefined].includes(salesleadData['billingemail'])) {
  //                 data['billingemail'] = salesleadData['billingemail']
  //               }

  //               if (!['', null, undefined].includes(salesleadData['billingaddress'])) {
  //                 data['billingaddress'] = salesleadData['billingaddress']
  //               }

  //               if (!['', null, undefined].includes(salesleadData['gstno'])) {
  //                 data['gstno'] = salesleadData['gstno']
  //               }

  //               console.log("recent purhase date updated in profile");
  //               console.log("journeyproductpurchase document created");

  //               // add participantjourneyproduct

  //               await setDoc(doc(this.firestore, "participantjourneyproduct", pjpId), {
  //                 docid: pjpId,
  //                 journeyref: journeyRef,
  //                 journeystatus: null,
  //                 participantproducts: participantProducts,
  //                 productref: journeyProductRefList,
  //                 profileid: profile["profileid"],
  //                 purchaseref: doc(this.firestore, "journeyproductpurchase", jppid),
  //                 subscriptionend: result['subscriptionend'],
  //                 subscriptionstart: result['subscriptionstart'],
  //                 purchasedate: salesleadData['purchasedate'],
  //                 salesperson: salesleadData['salespersonname'],
  //                 presalesperson: salesleadData['presalesperson'],
  //                 salesleadsref: doc(this.firestore, "salesleads", salesleadData['docid']),
  //                 journeytype: salesleadData['journeytype'],
  //                 onboarded: false,
  //                 salenotes: salesleadData['notes']
  //               }).then(async () => {
  //                 await updateDoc(doc(this.watsonDatabase, "Participants", purchaseData['participantid']), data)
  //                 console.log("profileid updated in participant collection");
  //                 await updateDoc(doc(this.firestore, "profile_data", profile['profileid']), {
  //                   recentpurchasedate: salesleadData.purchasedate.toDate()
  //                 });
  //                 console.log("participantjourneyproduct document created");
  //                 //sequence order checking
  //                 let sequenceOrder = 0
  //                 var ppData = []
  //                 await getDocs(query(collection(this.firestore, "participantsproduct"), where("profileid", "==", profile["profileid"]), orderBy('sequenceorder', 'asc'))).then(async snap => {
  //                   sequenceOrder = snap.docs.length
  //                   for (let j = 0; j < snap.docs.length; j++) {
  //                     const element = snap.docs[j].data();
  //                     ppData.push({
  //                       docid: element["docid"],
  //                       productref: element["productref"].id
  //                     })
  //                   }
  //                 });
  //                 // add participantsproduct
  //                 for (let i = 0; i < participantProducts.length; i++) {
  //                   const ppelement = participantProducts[i];
  //                   var map = {};
  //                   var minimumpayment = parseInt(this.mapProductminimumamount[ppelement['productref'].id]['minimumrequiredamount']) ?? 0
  //                   await setDoc(doc(this.firestore, "participantsproduct", ppelement['participantproductid']), {
  //                     docid: ppelement['participantproductid'],
  //                     journeyref: journeyRef,
  //                     productref: ppelement['productref'],
  //                     packageref: ppelement['packageref'],
  //                     status: null,
  //                     sequenceorder: i + sequenceOrder,
  //                     profileid: profile["profileid"],
  //                     minimumpayment: minimumpayment
  //                   }).then(() => {
  //                     console.log("participantsproduct document created", i);
  //                   }).catch(err => {
  //                     console.log(err, i, "error on participantproduct created");
  //                   });//participantsproduct

  //                   map['docid'] = ppelement['participantproductid']
  //                   map['productref'] = ppelement['productref'].id

  //                   ppData.push(map);
  //                 }

  //                 await this.guard.updateDeliverySequence(profile['profileid'], ppData).then(() => {
  //                   console.log('updateDeliverySequence successfully triggered');
  //                 });
  //                 await updateDoc(doc(this.firestore, "salesleads", salesleadData['id']), {
  //                   status: "Approved",
  //                   initialpaymentbalance: [null, undefined, ''].includes(result['initialpaymentbalance']) ? null : result['initialpaymentbalance'],
  //                   pendingbalanceamount: [null, undefined, ''].includes(result['pendingbalanceamount']) ? null : result['pendingbalanceamount'],
  //                   statusupdateddate: new Date()
  //                 }).then(async () => {
  //                   console.log(result);

  //                   //sending data to salescrm
  //                   let url: string;
  //                   var sendData = {}
  //                   sendData['docid'] = salesleadData['canceldocid'] == null ? salesleadData['docid'] : salesleadData['canceldocid'],
  //                     sendData['status'] = 'Approved',
  //                     sendData['journeytype'] = salesleadData['journeytype'],
  //                     sendData['watsonparticipantid'] = purchaseData['participantid'],
  //                     sendData['watsonpurchaseid'] = purchaseData['purchaseid'],
  //                     sendData['journeyproductpurchaseid'] = jppid
  //                   sendData['participantjourneyproductid'] = pjpId
  //                   sendData['upgradetodocid'] = salesleadData['upgradetodocid']
  //                   sendData['upgradefromdocid'] = salesleadData['upgradefromdocid']
  //                   sendData['salesleadsref'] = salesleadData['docid']


  //                   if (![null, undefined, ''].includes(result['initialpaymentbalance'])) {
  //                     sendData['initialpaymentbalance'] = result['initialpaymentbalance']
  //                   }

  //                   if (![null, undefined, ''].includes(result['pendingbalanceamount'])) {
  //                     sendData['pendingbalanceamount'] = result['pendingbalanceamount']
  //                   }

  //                   if (salesleadData['journeytype'] == 'new' || salesleadData['journeytype'] == 'upgrade') {
  //                     sendData['journeystatus'] = 'currentjourney'
  //                   } else if (salesleadData['jounreytype'] == 'addons') {
  //                     sendData['journeystatus'] = 'addons'
  //                   } else {
  //                     sendData['journeystatus'] = salesleadData['journeytype']
  //                   }

  //                   if (environment.firebase.projectId === "starlabs-test") {
  //                     url = "https://us-central1-salescrm-test-19.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //                   } else {
  //                     url = "https://us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
  //                   }
  //                   await this.http.get(url).toPromise().then((res) => {
  //                   });
  //                 });
  //               }).catch(err => { console.log(err); })//participantjourneyproduct
  //             }).catch(err => { console.log(err); })//journeyproductpurchase
  //             // add  journey end
  //           }
  //         }
  //       }
  //     } // created journey || product
  //   } else {
  //     console.log("profileId empty");
  //   }
  // }

  rejectSale(selectedData) {

    var dialogRef = this.dialog.open(UpdateDialogComponent, {
      autoFocus: false,
      data: '',
      disableClose: true,
      maxHeight: "90vh"
    });

    dialogRef.afterClosed().toPromise().then(async (result) => {

      if (result != null) {
        await updateDoc(doc(this.firestore, "salesleads", selectedData['docid']), {
          status: "Rejected",
          rejectnotes: result
        }).then(() => {
          console.log('Rejected Successfully');
        }).catch((error) => {
          console.log('error', error);
        });

        let url: string

        var sendData = {}
        sendData['docid'] = selectedData['canceldocid'] == null ? selectedData['docid'] : selectedData['canceldocid'],
        sendData['status'] = 'Rejected',
        sendData['rejectnotes'] = result
        sendData['purchasedate'] = selectedData['purchasedate']

        if (environment.firebase.projectId === "starlabs-test") {
          url = "https://us-central1-salescrm-test-19.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
        } else {
          url = "https://us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads?data=" + JSON.stringify(sendData)
        }
        this.http.get(url).toPromise().then(async (res) => {
          console.log(res);

        });

      }

    });

  }


  cancelSaleCapture(selectedData) {
    console.log(selectedData)
    updateDoc(doc(this.firestore, "salesleads", selectedData['id']), {
      cancelled: true
    })
  }

  formatName(name) {
    var list = name.toString().split(' ')
    // console.log(list);
    var value = ""
    for (let i = 0; i < list.length; i++) {
      if (list[i] != "" && list[i] != "\t") {
        const element = list[i].toString().trim();
        var word = element[0].toString().toUpperCase()
        if (word.length != 0) {
          var other = element.toString().substring(1).toLowerCase()
        }
        var subname = word + other
        value = value + " " + subname
      }
    }
    return value.trim()
  }

  validateApprove(value: any): boolean {
    return this.nullCheck(value['purchasedate']) || this.nullCheck(value['totalpurchasevalue']) || this.nullCheck(value['initialpayment']) || this.nullCheck(value['installmentamount'])
  }

  nullCheck(value): boolean {
    return [null, undefined].includes(value)
  }

  // harish
  initialPayment(selectedData) {

    var users = []
    if (environment.firebase.projectId == "fir-sample-aae4a") {
      users = [
        "1NYb4aGqlhZizzXJhU7Ftl5zwTj2",
        "9df7NVWmpSRghdXnec2L79uimWb2",
        "sj4qVoFmLOcIrTgzNMEOOvBI8gJ3",
        "Hgpmo3A60YQaopUFdywl59jXNpX2",
        "2OgWzhcPlCfi8JfLQ8B9CySZM6i2",
        "CVDvaiO0kYNCezw6wodyt2bsrrt2"
      ];
    } else if (environment.firebase.projectId == "starlabs-test") {
      users = [
        "AabsqwYdW4PMZEhKUlPmKU4lF0g2", // Vignesh
        "GcYv0Y8LGsTT34hJfiQFSS2Yoy92", // Ragavendhiren
      ]
    }
    console.log(this.guard.uid);

    if (users.includes(this.guard.uid)) {
      var check = confirm("Are you sure want to Approve the Initial Paymment of " + selectedData['initialpayment']);
      if (check) {
        updateDoc(doc(this.firestore, "salesleads", selectedData['docid']), {
          initialpaymentapproved: selectedData['initialpaymentapproved'] == true ? false : true
        }).then(() => {
          console.log("Approved Initial Payment");
        }).catch((error) => {
          console.log("Error while Approving Initial Payment", error);
        });
      }
    } else {
      alert("Your Roll is not eligible for Approving Initial Payment");
    }

  }

  openWattCharge(email:string){

    let newWindow: Window | null = null;

    const watsonTest = 'https://watson-test-19.web.app/watson-landingpage/wattcharge';
    const watsonProd = 'https://watsonproduction-becde.web.app/watson-landingpage/wattcharge/';
    
    if (window.location.hostname === 'localhost') {
      let route = environment.firebase.projectId === 'fir-sample-aae4a' ? watsonProd : watsonTest;
      newWindow = window.open(route, '_blank');
    } else if (environment.firebase.projectId === 'fir-sample-aae4a') {
      newWindow = window.open(watsonProd,'_blank');
    } else if (environment.firebase.projectId === 'starlabs-test') {
      newWindow = window.open(watsonTest,'_blank');
    }

    if (newWindow) {
      newWindow.focus();
    }
  }

}