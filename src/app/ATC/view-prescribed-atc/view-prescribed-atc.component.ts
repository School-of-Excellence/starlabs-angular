import { CommonModule, DatePipe } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { AuthguardService } from '../../authguard.service';
import { AtcReview, AtcReviewLogService } from '../shared/atc-review-log.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { collection, writeBatch, collectionChanges, collectionData, CollectionReference, collectionSnapshots, doc, docSnapshots, Firestore, and, getDoc, getDocs, limit, or, orderBy, Query, query, QueryDocumentSnapshot, QueryFieldFilterConstraint, QueryLimitConstraint, QueryOrderByConstraint, updateDoc, where, DocumentSnapshot, QueryConstraint, QueryFilterConstraint, DocumentReference, getFirestore, documentId, setDoc, deleteDoc, serverTimestamp } from '@angular/fire/firestore';
import { BehaviorSubject, combineLatestWith, debounceTime, firstValueFrom, from, map, Subject, Subscription, switchMap, takeUntil } from 'rxjs';
import { SelectValidatorComponent } from '../select-validator/select-validator.component';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import * as XLSX from 'xlsx';
import { FormOverlayViewComponent } from '../../Participants Profile Management/form-overlay-view/form-overlay-view.component';

@Component({
  selector: 'app-view-prescribed-atc',
  imports: [
    CommonModule,
    MatProgressBarModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    NgxMatSelectSearchModule,
    MatSelectModule,
    MatPaginatorModule,
    MatListModule,
    MatRadioModule,
    MatDatepickerModule,
    FormOverlayViewComponent
  ],
  templateUrl: './view-prescribed-atc.component.html',
  styleUrl: './view-prescribed-atc.component.css'
})
export class ViewPrescribedATCComponent {
  @ViewChild('paginator') paginator: MatPaginator;
  @ViewChild('formOverlay') formOverlay: FormOverlayViewComponent;

  // Loading states
  loading = new BehaviorSubject<boolean>(false);

  // Pagination
  pageIndex = 0
  pageSize = 25

  // Component lifecycle management
  private metaSubscription = new Subject<void>();
  private atcAlphaSubscription = new Subject<void>();

  // User profile data
  profileID: string;
  profileRoles = {};
  superRoles = false;

  // Filters
  filterText = "";

  selectedQueue: any[] = [];
  selectedActivity: string = null;

  validationFilter: string | null = null;

  // ATC count per participant filter
  atcCountOperator: 'lt' | 'gt' | 'eq' | null = null;
  atcCountValue: number | null = null;

  // List data
  prescriberList: Array<any> = [];
  participantList: Array<any> = [];
  queueList: Array<any> = [];
  mentoringActivityList: Array<any> = [];
  selectedProducts: string[] = [];
  selectedPrescribers: string[] = [];
  selectedParticipants: string[] = [];
  selectedMentors: string[] = [];

  // ATC data management
  reportATC: QueryDocumentSnapshot<any>[] = [];
  sourceReportATC: QueryDocumentSnapshot<any>[] = [];

  // Adjustment & Procedures
  mapATCtranscription = {};
  mapTranscriptionSubscription = new Map<String, Array<Subscription>>();

  // Maps for lookup data
  profileMap = {};
  procedureMap = {};
  // recommendedMap = {};
  mapBigActivity = {};
  mapATCclips = {};
  mapAtcVersionDoc = {};
  mapAtcVersionLoad = {}; // atc path → promise that resolves once its earlier versions are in mapAtcVersionDoc
  mapProducts = {};
  reportSummary: any = {};

  // ATC Notes
  mapATCnotes = {};
  mapNotesSubscription = {}

  // Metadata
  // recommendlist = [];
  assignerList = [];
  mentorProfileid = [];
  // assignedNeedsValidation = "procedure_recommend/ijjb1lUT8Q9p3rl4Ht3J";
  assignedToActivity = [];
  adjustmentAwarenessDetail: any = {};

  // Update Transcription
  updateAdjustmentPath = null
  updateProcedurePath = null
  newAwarenessValue = {
    awarenessdetail: null,
    potentialyears: null
  }
  newProcedureValue = {
    mandatory: false,
    status: null,
    lastactivity: null,
    bigactivity: {}
  }

  // Bulk change agent — keyed `${atcId}_${activityDocId}` (page-only, never saved)
  bulkAgentSelection = {} // selected profile paths per opened ATC × assigned_to activity
  bulkAgentFilter = {} // separate search text per bulk dropdown
  bulkLoadedAdjustments = new Set<string>() // adjustment paths whose procedures have arrived at least once

  atcModelList:any[] = []
  // ATC forms (plan 2026-10-28) — worked out once here, the template only reads these maps
  mapFormsCount = {}   // atc id → { done, total } for validated ATCs whose model has forms
  mapFormRows = {}     // atc id → form rows of an opened, validated ATC
  mapFormView = {}     // atc id → { specialist rows, participant rows, summary line } for the Forms card
  mapForm = {}         // delivery form id → { name, deleted } (only the forms of opened ATCs), null when the doc is gone
  mapFormRequests = {} // atc id → atc_form_requests docs of that ATC and its earlier versions (live while opened)
  startDate!: Date;
  endDate!: Date;
  updateProductPath = null
  newProductValue: string | null = null

  firestoreDefault = getFirestore() // Default Firestore
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore

  constructor(
    // public firestore: Firestore,
    public router: Router,
    public guard: AuthguardService,
    public matdialog: MatDialog,
    public datepipe: DatePipe
  ) {
    this.guard.getProfileMap().then(e => {
      this.profileMap = e.docdata;
    });
  }

  ngOnInit(): void {
    this.loading.next(true);
    // Initialize user roles and access
    this.initializeRolesAndAccess();
  }

  ngOnDestroy(): void {
    // Signal all subscriptions to unsubscribe
    this.clearAtcAlphaSubscription();
    this.metaSubscription.next();
    this.metaSubscription.complete();
    this.clearAdjustmentSubscription();
    this.clearNotesSubscription()
  }

  clearAtcAlphaSubscription() {
    this.atcAlphaSubscription.next()
    this.atcAlphaSubscription.complete()
  }

  clearAdjustmentSubscription() {
    this.mapTranscriptionSubscription.forEach(key => {
      key.forEach(sub => sub.unsubscribe())
    })
    this.mapTranscriptionSubscription.clear()
  }

  clearNotesSubscription() {
    Object.keys(this.mapNotesSubscription).forEach(key => {
      this.mapNotesSubscription[key]?.unsubscribe()
      this.mapNotesSubscription[key] = null
    })
  }

  clearUpdateEdit() {
    this.updateAdjustmentPath = null
    this.updateProcedurePath = null
    this.updateProductPath = null
    this.newProductValue = null
    this.newAwarenessValue = {
      awarenessdetail: null,
      potentialyears: null
    }
    this.newProcedureValue = {
      mandatory: false,
      status: null,
      lastactivity: null,
      bigactivity: {}
    }
  }

  // Role initialization
  private initializeRolesAndAccess(): void {
    this.guard.getRoles().then(roles => {
      this.profileID = roles.profile_ref.id;
      this.profileRoles = roles;
      this.superRoles = this.profileRoles["ah"] || this.profileRoles["admin"] || this.profileRoles["developer"] || this.profileRoles["mentor"];
      // if (!this.superRoles && !this.profileRoles["eis"]) {
      //   alert("The Access to this screen is restricted");
      //   this.router.navigateByUrl("/");
      //   return;
      // }
      // else {
        this.loadReferenceData(); // Load reference data
        this.setupATCQueries(); // Load Initial ATC
      // }
    }).catch(err => {
      console.error("Error getting roles:", err);
      this.loading.next(false);
    });
  }

  // Load reference data from firestore
  private loadReferenceData(): void {
    // Load procedure recommendations
    // this.firestore.collection("procedure_recommend", ref => ref.orderBy("name")).snapshotChanges().pipe(takeUntil(this.metaSubscription)).subscribe(names => {
    //   const list = [];
    //   names.forEach(type => {
    //     list.push(type.payload.doc);
    //     this.recommendedMap[type.payload.doc.ref.path] = type.payload.doc.data()["name"];
    //   });
    //   this.recommendlist = list;
    // });

    // Load user roles
    var roleCollection = collection(this.firestoreDefault, "users_roles")
    var roleQuery = query(roleCollection, orderBy("name"))
    collectionData(roleQuery).pipe(takeUntil(this.metaSubscription)).subscribe(userRoles => {
      const assignerList = [];
      const prescriberList = [];
      const mentorList = [];
      const nameList = [];

      for (let j = 0; j < userRoles.length; j++) {
        const role: any = userRoles[j];
        this.profileMap[role["profile_ref"].id] = { ...this.profileMap[role["profile_ref"].id], ...role };
        nameList.push({
          name: role["name"],
          profileid: role["profile_ref"].id
        });
        if (role["changeagent"] || role["eis"] || role["ah"] || role["admin"]) {
          assignerList.push({
            authorname: role["name"],
            authorpath: role["profile_ref"]["path"],
          });
        }
        if (role["ah"] || role["admin"] || role["eis"]) {
          prescriberList.push({
            authorname: role["name"],
            authorpath: role["profile_ref"]["path"],
          });
        }
        if (role["mentor"] === true) {
          mentorList.push(role["profile_ref"]["id"]);
        }
      }
      this.participantList = nameList;
      this.assignerList = assignerList;
      this.prescriberList = prescriberList;
      this.mentorProfileid = mentorList;
    });

    // Load procedures
    var procedureCollection = collection(this.firestoreDefault, "procedures")
    collectionChanges(procedureCollection).pipe(takeUntil(this.metaSubscription)).subscribe(procedures => {
      procedures.forEach(doc => {
        this.procedureMap[doc.doc.ref.path] = doc.doc.data()['name'];
      });
    });

    // Load big activity
    var bigactivityCollection = collection(this.firestoreDefault, "bigactivity")
    collectionData(bigactivityCollection).pipe(takeUntil(this.metaSubscription)).subscribe(activity => {
      const assigned = [];
      const activityDoc = [];
      activity.forEach(e => {
        if(e['atcproperty'] == 'mentoring') {
          activityDoc.push(e);
        }
        this.mapBigActivity[e["docid"]] = e["activity"];
        if (e["atcproperty"] == "assigned_to") {
          assigned.push(e);
        }
      });
      this.assignedToActivity = assigned;
      this.mentoringActivityList = activityDoc;
    });

    // Load adjustment awareness data
    var awarnessDoc = doc(this.firestoreDefault, "classify/adjustment_awareness")
    getDoc(awarnessDoc).then(snap => {
      if (snap.exists()) {
        this.adjustmentAwarenessDetail = snap.data();
      }
    });

    // Load queue data
    var queueRef = query(collection(this.firestoreDefault, "queue generation"), orderBy("queueenddate", "desc"))
    getDocs(queueRef).then(snap => {
      if(snap.docs.length != 0){
        this.queueList = snap.docs.map(e => e.data())
      }
    })

    // Load Products
    var productRef = collection(this.firestoreDefault, "products");
    getDocs(productRef).then(snap => {
      if (snap.docs.length) {
        this.mapProducts = Object.fromEntries(
          snap.docs.map(doc => [doc.id, doc.data()])
        );
      }
    });

    //atcmodel
    const atcModelRef = collection(this.firestoreDefault,"atc model")
    getDocs(atcModelRef).then(snap => {
      if(snap.docs.length != 0){
        this.atcModelList = snap.docs.map(e => e.data())
        this.buildFormsCount()
      }
    })
  }

  // Set up ATC queries based on user role
  setupATCQueries(): void {
    this.clearPreviousPage(this.pageIndex)
    this.clearUpdateEdit()
    this.clearAtcAlphaSubscription()
    this.clearAdjustmentSubscription()
    this.clearNotesSubscription()
    this.atcAlphaSubscription = new Subject<void>();
    this.loading.next(true);
    this.reportATC = [];
    this.pageIndex = 0;
    this.paginator.firstPage();
    if (!this.superRoles) {
      this.selectedPrescribers.push(`profile_data/${this.profileID}`);
    }

    var alphaCollection: CollectionReference = collection(this.firestoreATC, "atc_alpha")
    var toValidateCollection: CollectionReference = collection(this.firestoreATC, "atc_to_validate")
    let filters: QueryFilterConstraint[] = [
      where("isdelete", "==", false),
      where("type", "==", "online")
    ];

    let queryList: QueryConstraint[] = [
      orderBy("prescription_date", "desc")
    ];

    if (this.selectedPrescribers.length > 0) {
      const prescriberRefs = this.selectedPrescribers.map(p =>
        doc(this.firestoreATC, p)
      );
      filters.push(
        where("author", "array-contains-any", prescriberRefs)
      );
    }

    if (this.selectedParticipants.length > 0) {
      filters.push(where("profileid", "in", this.selectedParticipants));
    }

    if (this.startDate && this.endDate) {
      filters.push(
        where("prescription_date", ">=", new Date(this.startDate)),
        where("prescription_date", "<=", new Date(this.endDate))
      );
    }

    if (this.selectedMentors && this.selectedMentors.length > 0) {
      // const mentorRefs = this.selectedMentors.map((m: string) =>
      //   doc(this.firestoreDefault, m)
      // );

      const mentorFilters = this.mentoringActivityList.map(activity =>
        where(`bigactivity.${activity.docid}`, "array-contains-any", this.selectedMentors)
      );

      filters.push(or(...mentorFilters));
    }

    if (this.selectedProducts && this.selectedProducts.length > 0) {
      filters.push(where("product", "in", this.selectedProducts));
    }

    queryList.unshift(and(...filters) as unknown as QueryConstraint);

    // var queryList: QueryConstraint[] = [
    //   where("isdelete", "==", false),
    //   where("type", "==", "online"),
    //   orderBy("prescription_date", "desc")
    // ]
    // if (this.selectedPrescriber != null) {
    //   queryList.push(where("author", "array-contains", doc(this.firestoreDefault, this.selectedPrescriber)))
    // }
    // if (this.selectedParticipant != null) {
    //   queryList.push(where("profileid", "==", this.selectedParticipant))
    // }
    // if(this.startDate != null && this.endDate != null) {
    //   queryList.push(where("prescription_date", ">=", new Date(this.startDate)), where("prescription_date", "<=", new Date(this.endDate)))
    // }
    // if (this.selectedMentor) {
    //   const filters: QueryFilterConstraint[] =
    //     this.mentoringActivityList.map(activity =>
    //       where(`bigactivity.${activity.docid}`, "array-contains", this.selectedMentor)
    //     );

    //   queryList.push(or(...filters) as any);
    // }
    // if (this.selectedProduct != null) {
    //   queryList.push(where("product", "==", this.selectedProduct))
    // }
    if (this.selectedParticipants.length == 0 && this.selectedPrescribers.length == 0 && this.selectedProducts.length == 0 && this.selectedQueue.length == 0 && this.selectedMentors.length == 0) {
      queryList.push(limit(400))
    }

    var alphaQuery: Query = query(alphaCollection, ...queryList)
    // For toValidateQuery, add the status filter to the filters array
    let toValidateFilters = [...filters, where("status", "==", "atc given")];
    let toValidateQueryList: QueryConstraint[] = [
      and(...toValidateFilters) as unknown as QueryConstraint,
      orderBy("prescription_date", "desc")
    ];

    if (this.selectedParticipants.length == 0 && this.selectedPrescribers.length == 0 && this.selectedProducts.length == 0 && this.selectedQueue.length == 0 && this.selectedMentors.length == 0) {
      toValidateQueryList.push(limit(400))
    }

    var toValidateQuery: Query = query(toValidateCollection, ...toValidateQueryList)
    this.subscribeToATCCollections(alphaQuery, toValidateQuery);
  }

  // Subscribe to ATC collections and handle real-time updates
  private subscribeToATCCollections(alphaQuery: Query, toValidateQuery: Query): void {
    console.log(alphaQuery)
    console.log(toValidateQuery)

    var alphaSnapshot = collectionSnapshots(alphaQuery)
    var toValidateSnapshot = collectionSnapshots(toValidateQuery)

    alphaSnapshot.pipe(
      combineLatestWith(toValidateSnapshot), // Combine Other Subscription
      takeUntil(this.atcAlphaSubscription), // Subscribe until destroyed
      debounceTime(300), // Debounce to handle multiple rapid updates
      map(([alphaDocs, validateDocs]) => {
        console.log(alphaDocs.map(e => e.data()), "alphadocs data");
        console.log(validateDocs, "validateDocs")

        const merged = [...alphaDocs, ...validateDocs].sort(
          (a, b) => b.data()["prescription_date"].toDate() - a.data()["prescription_date"].toDate()
        );
        return merged;
      })
    ).subscribe({
      next: mergedDocs => {
        console.log("Subscribed to Combine Query", mergedDocs.length)
        var existingReport = new Map()
        mergedDocs.forEach(snapshot => {
          const id = snapshot.id;
          const data = snapshot.data();
          if (!data["isdelete"]) {
            existingReport.set(id, snapshot); // Update or add the item
          } else if (existingReport.has(id)) {
            existingReport.delete(id); // Remove the item if it exists and is now deleted
          }
        });
        this.reportATC = Array.from(existingReport.values());
        this.sourceReportATC = Array.from(existingReport.values());
        this.applyValidationFilter();

        const unvalidated = this.sourceReportATC.filter((doc: any) => doc.data()['status'] === 'atc given').length;
        const validated = this.sourceReportATC.filter((doc: any) => doc.data()['status'] !== 'atc given').length;
        const total = this.sourceReportATC.length;

        const totalAdjustment = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totaladjustment'] || 0), 0);
        const totalAdjustmentPending = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totaladjustmentpending'] || 0), 0);
        const totalAdjustmentCompleted = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totaladjustmentcompleted'] || 0), 0);

        const totalProcedure = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totalprocedure'] || 0), 0);
        const totalProcedurePending = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totalprocedurepending'] || 0), 0);
        const totalProcedureCompleted = this.sourceReportATC.reduce((sum, doc: any) => sum + (doc.data()['totalprocedurecompleted'] || 0), 0);

        // EI Solution reviews (not deleted) across the listed ATCs
        const totalReviews = this.sourceReportATC.reduce((sum, doc: any) => sum + (this.reviewLog.isEISolution(doc.data()['product']) ? this.reviewLog.activeCount(doc.data()['reviewlog']) : 0), 0);
        this.reportSummary = {
          total,
          totalReviews,
          validated,
          unvalidated,
          totalAdjustment,
          totalAdjustmentPending,
          totalAdjustmentCompleted,
          totalProcedure,
          totalProcedurePending,
          totalProcedureCompleted
        };
        this.buildFormsCount()
        this.rebuildOpenedFormRows()
        // this.getProfileData()
        this.checkATCversion()
        this.loading.next(false);
      },
      error: err => {
        console.log("Error in Combine Query", err)
      },
      complete: () => {
        console.log("Subscription Completed")
      }
    })
  }

  filterByValidation(type: string | null) {
    this.validationFilter = type;
    this.applyValidationFilter();
    this.resetToFirstPage();
  }

  onCountFilterChange() {
    this.applyValidationFilter();
    this.resetToFirstPage();
  }

  applyValidationFilter() {
    let base: QueryDocumentSnapshot<any>[];
    if (this.validationFilter === 'validated') {
      base = this.sourceReportATC.filter(
        (doc: any) => doc.data()['status'] !== 'atc given'
      );
    } else if (this.validationFilter === 'unvalidated') {
      base = this.sourceReportATC.filter(
        (doc: any) => doc.data()['status'] === 'atc given'
      );
    } else {
      base = this.sourceReportATC;
    }
    this.reportATC = this.applyCountFilter(base);
  }

  // Keep only ATCs whose participant's ATC count (within the current set)
  // satisfies the selected operator/value.
  applyCountFilter(list: QueryDocumentSnapshot<any>[]): QueryDocumentSnapshot<any>[] {
    if (this.atcCountOperator == null || this.atcCountValue == null || this.atcCountValue < 0) {
      return list;
    }
    const countByParticipant: Record<string, number> = {};
    list.forEach((doc: any) => {
      const pid = doc.data()['profileid'];
      countByParticipant[pid] = (countByParticipant[pid] || 0) + 1;
    });
    return list.filter((doc: any) => {
      const count = countByParticipant[doc.data()['profileid']] || 0;
      switch (this.atcCountOperator) {
        case 'lt': return count < this.atcCountValue;
        case 'gt': return count > this.atcCountValue;
        case 'eq': return count === this.atcCountValue;
        default: return true;
      }
    });
  }

  // Human-readable list of every filter currently shaping the result set.
  getActiveFilters(): string[] {
    const filters: string[] = [];

    if (this.selectedPrescribers.length > 0) {
      const names = this.selectedPrescribers.map(p => {
        const match = this.prescriberList.find(a => a.authorpath === p);
        return match ? match.authorname : p.split('/').pop();
      });
      filters.push(`Author: ${names.join(', ')}`);
    }

    if (this.selectedProducts.length > 0) {
      filters.push(`ATC Model: ${this.selectedProducts.join(', ')}`);
    }

    if (this.selectedParticipants.length > 0) {
      const names = this.selectedParticipants.map(pid => {
        const match = this.participantList.find(p => p.profileid === pid);
        return match ? match.name : pid;
      });
      filters.push(`Participant: ${names.join(', ')}`);
    }

    if (this.selectedQueue.length > 0) {
      filters.push(`Queue: ${this.selectedQueue.map(q => q['queuename']).join(', ')}`);
    }

    if (this.selectedMentors.length > 0) {
      const names = this.selectedMentors.map(m => this.profileMap[m]?.name || m);
      filters.push(`Mentor: ${names.join(', ')}`);
    }

    if (this.startDate && this.endDate) {
      filters.push(`Date: ${this.datepipe.transform(this.startDate, 'mediumDate')} - ${this.datepipe.transform(this.endDate, 'mediumDate')}`);
    }

    if (this.validationFilter) {
      filters.push(`Validation: ${this.validationFilter === 'validated' ? 'Validated' : 'Unvalidated'}`);
    }

    if (this.atcCountOperator != null && this.atcCountValue != null) {
      const opText = this.atcCountOperator === 'lt' ? '<' : this.atcCountOperator === 'gt' ? '>' : '=';
      filters.push(`ATC count per participant ${opText} ${this.atcCountValue}`);
    }

    return filters;
  }

  // Export the currently filtered ATC list (one row per ATC) to Excel.
  exportToExcel() {
    if (!this.reportATC || this.reportATC.length === 0) {
      alert("No ATC records to export");
      return;
    }

    const nameOf = (id: any) => (id != null ? (this.profileMap[id]?.name || id) : '');

    // Collect the distinct bigactivity role columns (ATC Mentor, Diagnostics solo, etc.)
    // present across the filtered ATCs.
    const activityKeys: string[] = [];
    this.reportATC.forEach((snapshot: any) => {
      const ba = snapshot.data()['bigactivity'];
      if (ba) {
        Object.keys(ba).forEach(k => {
          if (!activityKeys.includes(k)) activityKeys.push(k);
        });
      }
    });
    const activityLabels = activityKeys.map(k => this.mapBigActivity[k] || k);

    const headers = [
      "ATC ID", "Participant",
      ...activityLabels,
      "Author(s)", "Observer(s)",
      "Prescription Date", "Product", "Status",
      "Total Adjustments", "Adj. Pending", "Adj. Completed",
      "Total Change Work", "CW Pending", "CW Completed"
    ];

    const worksheetData: any[][] = [headers];

    this.reportATC.forEach((snapshot: any) => {
      const data = snapshot.data();
      const ba = data['bigactivity'] || {};

      const activityValues = activityKeys.map(k =>
        (ba[k] || []).map((id: any) => nameOf(id)).filter((n: string) => n).join(', ')
      );

      const authors = (data['author'] || [])
        .map((ref: any) => nameOf(ref?.id)).filter((n: string) => n).join(', ');
      const observers = (data['observer'] || [])
        .map((ref: any) => nameOf(ref?.id)).filter((n: string) => n).join(', ');
      const prescriptionDate = data['prescription_date']?.toDate
        ? this.datepipe.transform(data['prescription_date'].toDate(), 'mediumDate')
        : '';
      const status = data['status'] === 'atc given' ? 'Unvalidated' : 'Validated';

      worksheetData.push([
        data['atcid'] || snapshot.id,
        nameOf(data['profileid']),
        ...activityValues,
        authors,
        observers,
        prescriptionDate,
        data['product'] || 'No Product Mentioned',
        status,
        data['totaladjustment'] || 0,
        data['totaladjustmentpending'] || 0,
        data['totaladjustmentcompleted'] || 0,
        data['totalprocedure'] || 0,
        data['totalprocedurepending'] || 0,
        data['totalprocedurecompleted'] || 0
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    const maxWidths: number[] = [];
    worksheetData.forEach(row => {
      row.forEach((cell, colIndex) => {
        const cellLength = cell != null ? String(cell).length : 10;
        maxWidths[colIndex] = Math.max(maxWidths[colIndex] || 10, cellLength);
      });
    });
    ws['!cols'] = maxWidths.map(width => ({ wch: Math.min(width + 2, 50) }));

    XLSX.utils.book_append_sheet(wb, ws, "Prescribed ATC");
    const fileName = `Prescribed_ATC_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  private resetToFirstPage() {
    this.clearPreviousPage(this.pageIndex);
    this.pageIndex = 0;
    this.paginator?.firstPage();
    this.checkATCversion();
  }

  // Filter Participant list
  filterParticipantList(): any[] {
    const filterValue = this.filterText;
    return this.participantList.filter(option =>
      option.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  // Filter Queue list
  filterQueueList(): any[] {
    const filterValue = this.filterText;
    return this.queueList.filter(option =>
      option.queuename.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  // Filter Mentor list
  filterMentorList(): any[] {
    const filterValue = this.filterText;
    return this.mentorProfileid.filter(option =>
      this.profileMap[option]?.name.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  // Filter prescriber list
  filterPrescriberList(): any[] {
    const filterValue = this.filterText;
    return this.prescriberList.filter(option =>
      option.authorname.toLowerCase().includes(filterValue.toLowerCase())
    );
  }

  resetFilter(): void {
    this.selectedParticipants = [];
    if (this.superRoles) {
      this.selectedPrescribers = [];
    }
    this.selectedProducts = [];
    this.selectedQueue = [];
    this.selectedMentors = [];
    this.startDate = null;
    this.endDate = null;
    this.atcCountOperator = null;
    this.atcCountValue = null;

    // Reload with original query
    this.setupATCQueries();
  }

  onParticipantSelect() {
    if (this.superRoles) {
      this.selectedPrescribers = []
    }
    this.setupATCQueries()
  }

  async onQueueSelect() {
    if (this.superRoles) {
      this.selectedPrescribers = [];
    }
    this.selectedProducts = [];

    if (!this.selectedQueue || this.selectedQueue.length === 0) {
      this.startDate = null;
      this.endDate = null;
      this.setupATCQueries();
      return;
    }

    // Aggregate the widest date range across all selected queues
    const startTimes = this.selectedQueue
      .map(q => q['queuestartdate']?.toDate()?.getTime())
      .filter(t => t != null);
    const endTimes = this.selectedQueue
      .map(q => q['queueenddate']?.toDate()?.getTime())
      .filter(t => t != null);
    this.startDate = startTimes.length ? new Date(Math.min(...startTimes)) : null;
    this.endDate = endTimes.length ? new Date(Math.max(...endTimes)) : null;

    // Collect the union of ATC models across all selected queues
    const atcModels: string[] = [];
    for (const queue of this.selectedQueue) {
      const queueName = queue['queuename'].trim();
      const eventsRef = collection(this.firestoreDefault, 'arena events');
      const eventsQuery = query(
        eventsRef,
        where('eventname', '==', queueName),
        where('delete', '==', false)
      );

      const eventsSnapshot = await getDocs(eventsQuery);

      const productIds: string[] = [];
      eventsSnapshot.forEach(doc => {
        const productRef: DocumentReference = doc.data()['productref'];
        if (productRef) {
          const id = typeof productRef === 'string' ? productRef : productRef.id;
          if (id && !productIds.includes(id)) {
            productIds.push(id);
          }
        }
      });

      productIds.forEach(id => {
        const product = this.mapProducts[id];
        if (product?.atcmodel && !atcModels.includes(product.atcmodel)) {
          atcModels.push(product.atcmodel);
        }
      });
    }
    this.selectedProducts = atcModels;

    this.setupATCQueries();
  }

  onMentorSelect() {
    if (this.superRoles) {
      this.selectedPrescribers = [];
    }
    this.setupATCQueries()
  }

  onDateRangeChange() {
    if (this.superRoles) {
      this.selectedPrescribers = [];
    }
    this.setupATCQueries()
  }

  onPrescriberSelect() {
    this.selectedParticipants = [];
    this.setupATCQueries()
  }

  selectAuthorName(authorpath: string) {
    this.selectedPrescribers = [authorpath]
    this.onPrescriberSelect()
  }

  selectParticipantName(profileid: string) {
    this.selectedParticipants = [profileid]
    this.onParticipantSelect()
  }

  // getProfileData() {
  //   var start = this.pageIndex * this.pageSize
  //   var end = (this.pageIndex * this.pageSize) + this.pageSize
  //   var atcSlice = this.reportATC.slice(start, end)
  //   var profileid = atcSlice.map(e => e.data()["profileid"]).filter(e => !((this.profileMap[e] || {})["profileid"]))
  //   profileid = Array.from(new Set(profileid))
  //   if (profileid.length != 0) {
  //     var profileCollection = collection(this.firestoreDefault, "profile_data")
  //     var profileQuery = query(profileCollection, where("profileid", "in", profileid))
  //     getDocs(profileQuery).then(list => {
  //       for (let i = 0; i < list.docs.length; i++) {
  //         const element = list.docs[i];
  //         var profiledata: any = element.data()
  //         this.profileMap[element.id] = { ...this.profileMap[element.id], ...profiledata };
  //       }
  //     })
  //   }
  // }

  handlePageEvent(event: PageEvent) {
    console.log("Page Event", event)
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    this.pageIndex = event.pageIndex
    this.pageSize = event.pageSize
    // this.getProfileData()
    this.checkATCversion()
    this.clearUpdateEdit()
    this.clearPreviousPage(event.previousPageIndex)
  }

  clearPreviousPage(previousIndex) {
    var start = previousIndex * this.pageSize
    var end = (previousIndex * this.pageSize) + this.pageSize
    var atcSlice = this.reportATC.slice(start, end)
    for (let i = 0; i < atcSlice.length; i++) {
      const atcDoc = atcSlice[i];
      this.closeATC(atcDoc)
    }
  }

  checkATCversion() {
    var start = this.pageIndex * this.pageSize
    var end = (this.pageIndex * this.pageSize) + this.pageSize
    var atcSlice = this.reportATC.slice(start, end)
    for (let i = 0; i < atcSlice.length; i++) {
      const atcDoc = atcSlice[i];
      var atcData = atcDoc.data()
      if (![null, undefined].includes(atcData["editedfrom"])) {
        this.getATCVersion(atcDoc.ref.path, atcData["editedfrom"])
      }
    }
  }

  async getATCVersion(path: string, editedFrom: any): Promise<void> {
    if ([null, undefined].includes(this.mapAtcVersionDoc[path])) {
      this.mapAtcVersionDoc[path] = [];
      let versionsLoaded: () => void;
      this.mapAtcVersionLoad[path] = new Promise<void>(resolve => versionsLoaded = resolve);
      let currentEditedFrom = editedFrom;

      while (currentEditedFrom) {
        try {
          const snap = await getDoc(doc(this.firestoreATC, currentEditedFrom.path));
          if (!snap || !snap.exists()) break;

          const data = snap.data();
          data['atcPath'] = snap.ref.path;
          this.mapAtcVersionDoc[path].push(data);

          currentEditedFrom = data && data['editedfrom'] ? data['editedfrom'] : null;
        } catch (error) {
          console.error("Error fetching ATC version:", error);
          break;
        }
      }
      versionsLoaded();
    }
    return this.mapAtcVersionLoad[path];
  }

  // Open version history
  openVersionAtc(atcpath: string): void {
    const url = this.router.createUrlTree(["/viewUpgradedATC/"], {
      queryParams: {
        atcpath: atcpath
      }
    });
    window.open(url.toString(), "_blank");
  }

  fetchATCnotes(atcData) {
    var noteid = atcData["notesid"]
    var mentoringid = atcData["mentoringid"]
    console.log(this.mapNotesSubscription[noteid], this.mapNotesSubscription[mentoringid])
    if (noteid && !this.mapNotesSubscription[noteid]) {
      var noteSubscription = docSnapshots(doc(this.firestoreATC, "atc_notes/" + noteid)).pipe(
        takeUntil(this.atcAlphaSubscription),
      ).subscribe(doc => {
        this.mapATCnotes[doc.id] = doc.data()
      })
      this.mapNotesSubscription[noteid] = noteSubscription
    }
    if (mentoringid && !this.mapNotesSubscription[mentoringid]) {
      var mentorSubscription = docSnapshots(doc(this.firestoreDefault, "pick_for_mentoring/" + mentoringid)).pipe(
        takeUntil(this.atcAlphaSubscription),
        debounceTime(300),
      ).subscribe(doc => {
        this.mapATCnotes[doc.id] = doc.data()
      })
      this.mapNotesSubscription[mentoringid] = mentorSubscription
    }
  }

  unSubscribeSingleTranscription(atcData) {
    if (this.mapTranscriptionSubscription.has(atcData["atcid"])) {
      this.mapTranscriptionSubscription.get(atcData["atcid"]).forEach(sub => {
        sub.unsubscribe();
      });
      this.mapTranscriptionSubscription.delete(atcData["atcid"]);
    }
    this.mapTranscriptionSubscription.set(atcData["atcid"], [])

    if (this.mapNotesSubscription[atcData["notesid"]]) {
      this.mapNotesSubscription[atcData["notesid"]]?.unsubscribe()
      this.mapNotesSubscription[atcData["notesid"]] = null
    }
    if (this.mapNotesSubscription[atcData["mentoringid"]]) {
      this.mapNotesSubscription[atcData["mentoringid"]]?.unsubscribe()
      this.mapNotesSubscription[atcData["mentoringid"]] = null
    }
  }

  closeATC(atc: QueryDocumentSnapshot<any>) {
    if (this.mapATCtranscription[atc.id]) {
      this.mapATCtranscription[atc.id]["view"] = false;
    }
    this.unSubscribeSingleTranscription(atc.data())
    console.log(this.mapATCtranscription[atc.id])
  }

  openATC(atc: QueryDocumentSnapshot<any>) {
    console.log(atc)
    var atcData = atc.data()

    // Clear Previous Subscription
    this.unSubscribeSingleTranscription(atcData)
    // forget this ATC's earlier load so the bulk box waits for fresh procedures on re-open
    var previousTranscription = this.mapATCtranscription[atc.id]?.["transcription"] ?? []
    previousTranscription.forEach(t => this.bulkLoadedAdjustments.delete(t.adjustment.ref.path))

    this.fetchATCnotes(atcData) // Load ATC Notes
    this.openAtcForms(atc) // Forms section (validated ATCs whose model has forms)

    console.log(this.mapATCtranscription[atc.id])

    this.mapATCtranscription[atc.id] = this.mapATCtranscription[atc.id] || { view: true, transcription: [] }
    this.mapATCtranscription[atc.id]["view"] = true
    var transcription = this.mapATCtranscription[atc.id]["transcription"]
    var adjSubscription = collectionSnapshots(collection(this.firestoreATC, atc.ref.path + "/corrections")).pipe(
      takeUntil(this.metaSubscription),
      debounceTime(300),
    ).subscribe(adjustmentSnapshot => {
      for (let i = 0; i < adjustmentSnapshot.length; i++) {
        const adjDoc = adjustmentSnapshot[i];
        if (transcription[i]) {
          transcription[i] = {
            adjustment: adjDoc,
            procedure: transcription[i]["procedure"] || []
          }
        }
        else {
          transcription.push({
            adjustment: adjDoc,
            procedure: []
          })
        }
        var proSubscription = collectionSnapshots(collection(this.firestoreATC, adjDoc.ref.path + "/procedures")).pipe(
          takeUntil(this.metaSubscription),
          debounceTime(300),
        ).subscribe(procedureSnapshot => {
          for (let j = 0; j < procedureSnapshot.length; j++) {
            const proDoc = procedureSnapshot[j];
            if (transcription[i]["procedure"][j]) {
              transcription[i]["procedure"][j] = proDoc
            }
            else {
              transcription[i]["procedure"].push(proDoc)
            }
          }
          this.bulkLoadedAdjustments.add(adjDoc.ref.path) // procedures of this adjustment have loaded
        })
        this.mapTranscriptionSubscription.set(atc.id, [...this.mapTranscriptionSubscription.get(atc.id), proSubscription])
      }
    })
    this.mapTranscriptionSubscription.set(atc.id, [...this.mapTranscriptionSubscription.get(atc.id), adjSubscription])
  }

  //// ATC forms (plan 2026-10-28)
  // the ATC's model forms, only when the ATC is validated (an atc_alpha doc not waiting for validation)
  validatedModelForms(atc: QueryDocumentSnapshot<any>): any[] {
    var atcData = atc.data()
    if (atc.ref.parent.id != 'atc_alpha' || atcData['status'] == 'atc given') return []
    var product = (atcData['product'] ?? '').toString().trim().toLowerCase()
    var model = this.atcModelList.find(m => (m['atcmodel'] ?? '').toString().trim().toLowerCase() == product)
    return (model?.['forms'] || []).filter(f => f?.['formid'])
  }

  // card count: how many of the model's forms have an answer on the ATC
  buildFormsCount() {
    var counts = {}
    this.sourceReportATC.forEach(atc => {
      var forms = this.validatedModelForms(atc)
      if (forms.length == 0) return
      var submitted = atc.data()['formsubmitted'] || {}
      counts[atc.id] = { done: forms.filter(f => submitted[f['formid']]).length, total: forms.length }
    })
    this.mapFormsCount = counts
  }

  // Opening a validated ATC: read its model forms that aren't in mapForm yet (document-id `in` queries, 30 ids
  // each) and listen to its form requests until the ATC is closed
  openAtcForms(atc: QueryDocumentSnapshot<any>) {
    var forms = this.validatedModelForms(atc)
    if (forms.length == 0) return
    // the live list may have a newer copy of this ATC (e.g. a form recorded since it was opened)
    var latest = () => this.sourceReportATC.find(a => a.id == atc.id) || atc
    var missing = forms.map(f => f['formid']).filter(id => this.mapForm[id] === undefined)
    var chunks = []
    for (let i = 0; i < missing.length; i += 30) chunks.push(missing.slice(i, i + 30))
    Promise.all(chunks.map(ids => getDocs(query(collection(this.firestoreDefault, 'delivery forms'), where(documentId(), 'in', ids))))).then(results => {
      missing.forEach(id => this.mapForm[id] = null) // no doc → the row is hidden
      results.forEach(snap => snap.docs.forEach(d => this.mapForm[d.id] = { name: d.data()['formname'] ?? '', deleted: d.data()['delete'] === true }))
      this.buildFormRows(latest())
    }).catch(err => console.error('Error loading ATC forms:', err))

    // requests of this ATC and its earlier versions (an edit gives the ATC a new id), once the versions are known
    var atcData = atc.data()
    var versionsLoaded = atcData['editedfrom'] ? this.getATCVersion(atc.ref.path, atcData['editedfrom']) : Promise.resolve()
    var requestSubscription = from(versionsLoaded).pipe(
      switchMap(() => {
        var atcIds = [atc.id, ...(this.mapAtcVersionDoc[atc.ref.path] || []).map(v => v['atcPath'].split('/').pop())]
        return collectionSnapshots(query(collection(this.firestoreATC, 'atc_form_requests'), where('profileid', '==', atcData['profileid']), where('atcid', 'in', atcIds)))
      }),
      takeUntil(this.metaSubscription),
    ).subscribe({
      next: requestDocs => {
        this.mapFormRequests[atc.id] = requestDocs.map(d => ({ ...d.data(), path: d.ref.path }))
        this.buildFormRows(latest())
      },
      error: err => {
        console.error('Error loading ATC form requests:', err)
        this.mapFormRequests[atc.id] = [] // still show the forms, without request statuses
        this.buildFormRows(latest())
      }
    })
    this.mapTranscriptionSubscription.set(atc.id, [...this.mapTranscriptionSubscription.get(atc.id), requestSubscription])
  }

  // Rows of an opened, validated ATC in form-name order, worked out once so the template only reads plain fields:
  // status pill (status / tone / icon), the explanation line (note) and which buttons show (can*).
  //   specialist:  To fill (Fill form) · Submitted (View answer, Edit answer)
  //   participant: Not sent (Send to participant) · Waiting for participant (Withdraw) ·
  //                Waiting for update (View answer, Withdraw) · Submitted (View answer, Ask to update)
  //   soft-deleted delivery form, not answered and not waiting → Not required, no buttons
  //   (waiting = the request's formstatus is 'sent'; the request is kept after the app submits it)
  // No extra access check: the list query already limits a non-super user to the ATCs they authored, so whoever sees
  // the ATC may act on its forms (same as the EI Review log)
  buildFormRows(atc: QueryDocumentSnapshot<any>) {
    var modelForms = this.validatedModelForms(atc)
    if (modelForms.some(f => this.mapForm[f['formid']] === undefined)) return // forms still loading
    // requests still loading: Send must not show before an existing request is known (one request per ATC + form)
    if (this.mapFormRequests[atc.id] === undefined) return
    var forms = modelForms.filter(f => this.mapForm[f['formid']]) // a delivery form doc that's gone isn't listed
    if (forms.length == 0) return // no forms → no Forms card
    var submitted = atc.data()['formsubmitted'] || {}
    var requests = this.mapFormRequests[atc.id] || []
    var rows = forms.map(f => {
      var formid = f['formid']
      var specialist = f['filledby'] == 'specialist'
      var answerid = submitted[formid] || null
      var request = requests.find(r => r['formid'] == formid) || null
      var pending = !!request && request['formstatus'] == 'sent'
      var form = this.mapForm[formid]
      var deleted = form.deleted && !answerid && !pending
      var sentOn = request?.['sentat']?.toDate ? this.datepipe.transform(request['sentat'].toDate(), 'd MMM y') : null
      var row: any = { formid, name: form.name, filledby: f['filledby'], answerid, request, pending, deleted,
        canView: false, canEdit: false, canFill: false, canSend: false, canResend: false, canWithdraw: false }
      if (deleted) Object.assign(row, { status: 'Not required', tone: 'off', icon: 'block', note: 'This form was deleted' })
      else if (specialist && !answerid) Object.assign(row, { status: 'To fill', tone: 'todo', icon: 'edit', note: "You haven't filled this yet", canFill: true })
      else if (specialist) Object.assign(row, { status: 'Submitted', tone: 'done', icon: 'check_circle', note: 'Filled by you', canView: true, canEdit: !form.deleted })
      else if (pending && request['answerid']) Object.assign(row, { status: 'Waiting for update', tone: 'wait', icon: 'autorenew',
        note: sentOn ? 'Sent back ' + sentOn + ' to update their answer' : 'Sent back to update their answer', canView: !!answerid, canWithdraw: true })
      else if (pending) Object.assign(row, { status: 'Waiting for participant', tone: 'wait', icon: 'schedule', note: sentOn ? 'Sent ' + sentOn : 'Sent', canWithdraw: true })
      else if (answerid) Object.assign(row, { status: 'Submitted', tone: 'done', icon: 'check_circle', note: 'Filled by the participant', canView: true, canResend: true })
      else Object.assign(row, { status: 'Not sent', tone: 'todo', icon: 'send', note: "The participant can't see it yet", canSend: true })
      return row
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    var done = rows.filter(r => r.answerid).length
    var waiting = rows.filter(r => r.pending).length
    var toFill = rows.filter(r => r.canFill).length
    this.mapFormRows[atc.id] = rows
    this.mapFormView[atc.id] = {
      specialist: rows.filter(r => r.filledby == 'specialist'),
      participant: rows.filter(r => r.filledby != 'specialist'),
      summary: [done + ' of ' + rows.length + ' submitted', waiting ? waiting + ' waiting for participant' : null, toFill ? toFill + ' for you to fill' : null]
        .filter(part => part).join(' · ')
    }
  }

  // the live list changed (e.g. a form was just recorded on the ATC): refresh the rows of the opened ATCs
  rebuildOpenedFormRows() {
    this.sourceReportATC.forEach(atc => {
      if (this.mapATCtranscription[atc.id]?.['view']) this.buildFormRows(atc)
    })
  }

  // specialist form: open it in a new tab; the form screen records the answer on the ATC and closes itself
  fillAtcForm(atc: QueryDocumentSnapshot<any>, row: any) {
    var url = this.router.serializeUrl(this.router.createUrlTree(['/formtemplate'], { queryParams: { id: row.formid, type: 'form', profileid: atc.data()['profileid'], atcid: atc.id } }))
    window.open(url, '_blank')
  }

  // submitted specialist form: open the saved answer prefilled and editable in a new tab; the form screen updates
  // that same answer (B!G edit logic) and closes itself
  editAtcForm(atc: QueryDocumentSnapshot<any>, row: any) {
    var url = this.router.serializeUrl(this.router.createUrlTree(['/formtemplate'], { queryParams: { id: row.formid, type: 'form', patchdata: 'formsByClient/' + row.answerid, profileid: atc.data()['profileid'], atcid: atc.id } }))
    window.open(url, '_blank')
  }

  // participant form: Send (no answer yet) or Resend (answerid = the answer to edit). ONE request per ATC + form for
  // the ATC's whole life (operator 2026-10-29): when the row already has a request — made on this or an earlier
  // version — the same doc is rewritten and keeps its atcid (the participant app builds the doc id from it and follows
  // the ATC to its latest version); otherwise a new doc {atcid}_{formid}. formstatus 'sent' is what the app queries;
  // this setDoc replaces the doc, so a Resend clears the 'submitted' left by the previous round.
  sendAtcForm(atc: QueryDocumentSnapshot<any>, row: any) {
    var atcData = atc.data()
    var atcid = row.request ? row.request['atcid'] : atc.id
    var request: any = { atcid, formid: row.formid, profileid: atcData['profileid'], product: atcData['product'] ?? null, sentby: this.profileID, sentat: serverTimestamp(), formstatus: 'sent' }
    if (row.answerid) request.answerid = row.answerid
    setDoc(row.request ? doc(this.firestoreATC, row.request.path) : doc(this.firestoreATC, 'atc_form_requests', atc.id + '_' + row.formid), request)
      .catch(err => { console.error('Error sending ATC form:', err); alert("Couldn't send the form. Try again.") })
  }

  // Withdraw: delete the request (the participant's card goes away and the app can no longer submit it)
  revokeAtcForm(row: any) {
    if (!confirm("Withdraw this form? The participant won't be able to submit it.")) return
    deleteDoc(doc(this.firestoreATC, row.request.path))
      .catch(err => { console.error('Error revoking ATC form:', err); alert("Couldn't revoke the form. Try again.") })
  }

  // submitted form: the participant forms screen's read-only form overlay, as it is
  viewAtcForm(atc: QueryDocumentSnapshot<any>, row: any) {
    var profileid = atc.data()['profileid']
    this.formOverlay.mapProfile = { [profileid]: (this.profileMap[profileid] || {})['name'] }
    this.formOverlay.viewFormOverlay({ formname: row.name, formid: row.formid, docid: row.answerid, profileid })
  }

  onEditATC(atc: QueryDocumentSnapshot<any>): void {
    var atcid = atc.id
    var collectionname = atc.ref.parent.id == "atc_alpha" ? "alpha" : "validation"
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['/editATC/' + atcid + "/" + collectionname])
    );
    window.open(url, '_blank');
  }

  onSelectAdjustmentEdit(adjustmentData) {
    this.newAwarenessValue = {
      awarenessdetail: {
        aware: adjustmentData["awareness"],
        value: adjustmentData["awarenessdetail"]
      },
      potentialyears: adjustmentData["potentialyears"]
    }
    console.log(this.newAwarenessValue)
  }

  updateAwarenessValue(adjustment: QueryDocumentSnapshot<any>) {
    console.log(adjustment.ref.path, this.newAwarenessValue)
    if (![null, undefined].includes(this.newAwarenessValue["awarenessdetail"]) && ![null, undefined].includes(this.newAwarenessValue["potentialyears"])) {
      updateDoc(doc(this.firestoreATC, adjustment.ref.path), {
        awarenessdetail: this.newAwarenessValue["awarenessdetail"]["value"],
        awareness: this.newAwarenessValue["awarenessdetail"]["aware"],
        potentialyears: this.newAwarenessValue["potentialyears"],
      }).catch(err => {
        console.log("Err Update", err)
      })
      this.clearUpdateEdit()
    }
  }

  onSelectProcedureEdit(procedureData) {
    var assigned = {}
    var activityKeys = Object.keys(procedureData["bigactivity"] ?? {})

    if (activityKeys.length == 0 && (procedureData["assigned_to"] ?? []).length != 0) {
      if (this.assignedToActivity.length != 0) {
        assigned[this.assignedToActivity[0]["docid"]] = procedureData["assigned_to"].map(e => e.path)
      }
    }
    else {
      activityKeys.forEach(activity => {
        assigned[activity] = procedureData["bigactivity"][activity].map(e => doc(this.firestoreDefault, "profile_data/" + e).path)
      })
    }

    this.newProcedureValue = {
      mandatory: procedureData["mandatory"],
      status: procedureData["autogeneralized"] ? "autogeneralized" : procedureData["status"] == "completed" ? "completed" : null,
      lastactivity: null,
      bigactivity: assigned
    }
    if (procedureData["last_activity"] != null) {
      this.newProcedureValue.lastactivity = this.datepipe.transform(typeof procedureData["last_activity"] == 'string' ? new Date(procedureData["last_activity"]) : procedureData["last_activity"].toDate(), "yyyy-MM-ddThh:mm")
    }

    console.log(this.newProcedureValue)

  }

  updateProcedureValue(procedure: QueryDocumentSnapshot<any>) {
    var procedureData = procedure.data()
    console.log(procedure.ref.path, this.newProcedureValue, procedureData)
    var bigactivity = {}
    var assigned = []
    Object.keys(this.newProcedureValue["bigactivity"]).forEach(activity => {
      if ((this.newProcedureValue["bigactivity"][activity] || []).length != 0) {
        bigactivity[activity] = this.newProcedureValue["bigactivity"][activity].map(e => doc(this.firestoreATC, e).id)
        assigned = [...assigned, ...this.newProcedureValue["bigactivity"][activity]]
      }
    })
    var newRecord = {
      autogeneralized: this.newProcedureValue["status"] == "autogeneralized",
      status: ["autogeneralized", "completed"].includes(this.newProcedureValue["status"]) ? "completed" : "yet to start",
      mandatory: this.newProcedureValue["mandatory"],
      bigactivity: bigactivity,
      assigned_to: assigned.map(e => doc(this.firestoreATC, e)),
      last_activity: this.newProcedureValue["lastactivity"] != null ? new Date(this.newProcedureValue["lastactivity"]) : null
    }
    console.log("Rew Record", newRecord)
    if (newRecord.status == "completed" && (newRecord.last_activity == null || isNaN(newRecord.last_activity?.getTime()))) {
      alert("Enter Valid Activity Date!")
      return
    }
    else if (newRecord.status != "completed") {
      newRecord.last_activity = null
    }
    updateDoc(doc(this.firestoreATC, procedure.ref.path), newRecord).catch(err => {
      console.log("Err Update", err)
    })
    this.clearUpdateEdit()
  }

  // ATC fully loaded = adjustments in, and every adjustment's procedures have arrived at least once
  isBulkReady(atcId: string): boolean {
    var transcription = this.mapATCtranscription[atcId]?.["transcription"] ?? []
    return transcription.length != 0 && transcription.every(t => this.bulkLoadedAdjustments.has(t.adjustment.ref.path))
  }

  // loaded procedures the bulk box may change: skips deleted adjustments, deleted and completed procedures
  bulkEligibleProcedures(atcId: string): QueryDocumentSnapshot<any>[] {
    var eligible = [];
    var transcription = this.mapATCtranscription[atcId]?.["transcription"] ?? [];
    transcription.forEach(t => {
      if (t.adjustment.data()?.["isdelete"]) return;
      (t.procedure ?? []).forEach(procedure => {
        var procedureData = procedure.data();
        if (!procedureData["isdelete"] && procedureData["status"] != "completed") eligible.push(procedure);
      });
    });
    return eligible;
  }

  // same list as the per-procedure "Assign Change Agent", filtered by this dropdown's own search text
  availableBulkAssignerList(key: string): Array<any> {
    var search = (this.bulkAgentFilter[key] ?? "").toLowerCase()
    return this.assignerList.filter(e => e.authorname.toLowerCase().includes(search))
  }

  // overwrite ONE activity's agents on every open procedure of this ATC (mirrors updateProcedureValue), in one batch
  bulkUpdateChangeAgent(atc: QueryDocumentSnapshot<any>, activity) {
    var key = atc.id + "_" + activity.docid
    var selected: string[] = this.bulkAgentSelection[key] ?? []
    if (selected.length == 0 || !this.isBulkReady(atc.id)) return
    var procedures = this.bulkEligibleProcedures(atc.id)
    var names = selected.map(path => this.assignerList.find(e => e.authorpath == path)?.authorname ?? path).join(", ")
    if (!confirm(`Update ${activity.activity} to ${names} on ${procedures.length} procedures of this ATC? This saves immediately and replaces the current ${activity.activity} on every procedure that is not deleted or completed.`)) return

    var batch = writeBatch(this.firestoreATC)
    procedures.forEach(procedure => {
      var procedureData = procedure.data()
      // current agents per activity as profile paths (same mapping as onSelectProcedureEdit, incl. legacy assigned_to)
      var agents = {}
      var activityKeys = Object.keys(procedureData["bigactivity"] ?? {})
      if (activityKeys.length == 0 && (procedureData["assigned_to"] ?? []).length != 0) {
        if (this.assignedToActivity.length != 0) {
          agents[this.assignedToActivity[0]["docid"]] = procedureData["assigned_to"].map(e => e.path)
        }
      }
      else {
        activityKeys.forEach(activityKey => {
          agents[activityKey] = (procedureData["bigactivity"][activityKey] ?? []).map(e => doc(this.firestoreDefault, "profile_data/" + e).path)
        })
      }
      agents[activity.docid] = [...selected]

      // same shape updateProcedureValue writes: bigactivity = ids per activity, assigned_to = union as refs
      var bigactivity = {}
      var assigned = []
      Object.keys(agents).forEach(activityKey => {
        if ((agents[activityKey] || []).length != 0) {
          bigactivity[activityKey] = agents[activityKey].map(e => doc(this.firestoreATC, e).id)
          assigned = [...assigned, ...agents[activityKey]]
        }
      })
      batch.update(doc(this.firestoreATC, procedure.ref.path), {
        bigactivity: bigactivity,
        assigned_to: assigned.map(e => doc(this.firestoreATC, e))
      })
    })

    batch.commit().then(() => {
      this.bulkAgentSelection[key] = []
      this.bulkAgentFilter[key] = ""
    }).catch(err => {
      console.log("Err Bulk Update", err)
      alert("Could not update the change agents. Nothing was changed — please try again.")
    })
  }

  onSelectProductEdit(atc: QueryDocumentSnapshot<any>) {
    var atcData = atc.data()
    this.newProductValue = atcData['product'] ?? null
    this.updateProductPath = atc.ref.path
  }

  async updateProductValue(atc: QueryDocumentSnapshot<any>) {
    if ([null, undefined].includes(this.newProductValue) || (this.newProductValue as string).trim().length == 0) {
      alert("Select a valid ATC Model")
      return
    }

    try {
      const batch = writeBatch(this.firestoreATC)

      // 1. Current doc
      var collectionName = atc.ref.parent.id
      batch.update(doc(this.firestoreATC, collectionName, atc.id), {
        product: this.newProductValue
      })

      // 2. Cached version chain (no new fetch)
      var oldVersions = this.mapAtcVersionDoc[atc.ref.path] || []
      for (let i = 0; i < oldVersions.length; i++) {
        var versionPath = oldVersions[i]['atcPath']
        if (versionPath) {
          batch.update(doc(this.firestoreATC, versionPath), {
            product: this.newProductValue
          })
          oldVersions[i]['product'] = this.newProductValue
        }
      }

      // 3. Only atc_alpha docs can have a twin in atc_to_validate (never the reverse)
      if (collectionName === "atc_alpha") {
        var toValidateRef = doc(this.firestoreATC, "atc_to_validate", atc.id)
        var toValidateSnap = await getDoc(toValidateRef)
        if (toValidateSnap.exists()) {
          batch.update(toValidateRef, {
            product: this.newProductValue
          })
        }
      }

      await batch.commit()
      this.clearUpdateEdit()
    } catch (err) {
      console.log("Error updating product", err)
      alert("Failed to update ATC model. Please try again.")
    }
  }

  // Compare function for complex objects
  compareMapItems(item1: any, item2: any): boolean {
    return item1 && item2 && item1.value === item2.value;
  }

  viewImage(src) {
    window.open(src, '_blank')
  }

  async markATCvalidate(atcid) {
    let dialog = this.matdialog.open(SelectValidatorComponent, {
      data: { type: "selectvalidator" },
      disableClose: true
    })
    var result = await firstValueFrom(dialog.afterClosed())
    console.log(result)
    let validators = []
    var resultList = result ?? []
    resultList.forEach((e: any) => validators.push(doc(this.firestoreATC, e.profile_ref.path)))
    updateDoc(doc(this.firestoreATC, "atc_to_validate/" + atcid), {
      status: "validated",
      validator: validators
    }).catch(err => {
      console.log(err)
    })
  }

  // TrackBy functions for performance optimization
  trackByAuthorOption(index: number, author: any): any {
    return author.authorpath;
  }

  trackByAuthorId(index: number, author: any): any {
    return author.id || author;
  }

  trackByAtcId(index: number, atc: any): any {
    return atc.id || atc.atcid;
  }

  trackByFormId(index: number, row: any): any {
    return row.formid;
  }

  trackByAdjustmentID(index: number, transcription: any): any {
    return transcription["adjustment"]?.id;
  }

  trackByProcedureId(index: number, procedure: any): any {
    return procedure.id;
  }

  // ---- 2026-10-23: template sections on a saved ATC (EI Solution ask / WiSH outcomes) ----
  // One stable array per ATC: atc.data() builds a NEW object on every change detection, so looping over
  // atc.data()['ask'] directly would hand *ngFor a new list each pass and re-render it without end (froze the page).
  private templateRowsCache: { [atcId: string]: { ask: any[], outcomes: any[] } } = {}
  templateRows(atc: any): { ask: any[], outcomes: any[] } {
    if (!this.templateRowsCache[atc.id]) {
      var data = atc.data() ?? {}
      this.templateRowsCache[atc.id] = {
        ask: Array.isArray(data['ask']) ? data['ask'] : [],
        outcomes: Array.isArray(data['outcomes']) ? data['outcomes'] : [],
      }
    }
    return this.templateRowsCache[atc.id]
  }
  trackByIndex(index: number): number {
    return index
  }

  // ---- 2026-10-24: EI Solution Review log (plan specs/plans/2026-10-24-review-log.md) ----
  reviewLog = inject(AtcReviewLogService)
  private reviewSnack = inject(MatSnackBar)
  reviewDraft: { [atcId: string]: string } = {}
  reviewError: { [atcId: string]: string | null } = {}
  reviewConfirm: { [atcId: string]: string | null } = {}
  reviewShowDeleted: { [atcId: string]: boolean } = {}
  reviewBusy: { [atcId: string]: boolean } = {}
  // per SNAPSHOT (atc.data() builds a new object every change detection — the freeze lesson); a new snapshot after an
  // add / delete is a new key, so the list refreshes by itself
  private reviewCache = new WeakMap<any, { show: boolean, rows: AtcReview[], active: number, deleted: number }>()
  private reviewEntry(atc: any) {
    var show = !!this.reviewShowDeleted[atc.id]
    var entry = this.reviewCache.get(atc)
    if (!entry || entry.show != show) {
      var log = atc.data()?.["reviewlog"]
      var active = this.reviewLog.activeCount(log)
      entry = { show: show, rows: this.reviewLog.rows(log, show), active: active, deleted: (Array.isArray(log) ? log.length : 0) - active }
      this.reviewCache.set(atc, entry)
    }
    return entry
  }
  reviewRows(atc: any): AtcReview[] { return this.reviewEntry(atc).rows }
  reviewActiveCount(atc: any): number { return this.reviewEntry(atc).active }
  reviewDeletedCount(atc: any): number { return this.reviewEntry(atc).deleted }
  isEIModel(product: any): boolean { return this.reviewLog.isEISolution(product) }
  reviewerName(profileid: string): string { return (this.profileMap[profileid] || {})["name"] ?? profileid }
  get myReviewerName(): string { return this.reviewerName(this.profileID) }
  reviewLogDate(value: any): Date | null { return this.reviewLog.toDate(value) }
  trackByReviewId(index: number, review: AtcReview): string { return review?.id ?? String(index) }
  private reviewMessage(result: string): string | null {
    return result == 'retired' ? "This ATC was updated — reload to see the latest version."
      : result == 'missing' ? "This ATC or review no longer exists — reload the page." : null
  }
  async addReview(atc: any) {
    if ((this.reviewDraft[atc.id] ?? "").trim().length == 0) { this.reviewError[atc.id] = "Write the review first."; return }
    this.reviewBusy[atc.id] = true
    try {
      var result = await this.reviewLog.add(this.firestoreATC, atc.ref.path, this.reviewDraft[atc.id], this.profileID)
      if (result == 'ok') {
        this.reviewDraft[atc.id] = ""
        this.reviewSnack.open("Review added.", "Dismiss", { duration: 3000 })
      } else {
        this.reviewError[atc.id] = this.reviewMessage(result) ?? "Write the review first."
      }
    } catch (error) {
      console.error("Could not add the review", error)
      this.reviewError[atc.id] = "Could not save the review — check your connection and try again."
    } finally {
      this.reviewBusy[atc.id] = false
    }
  }
  // undelete: straight back into the log, no confirmation (operator 2026-10-25)
  async restoreReview(atc: any, review: AtcReview) {
    this.reviewBusy[atc.id] = true
    try {
      var result = await this.reviewLog.restore(this.firestoreATC, atc.ref.path, review.id)
      if (result == 'ok') this.reviewSnack.open("Review restored.", "Dismiss", { duration: 3000 })
      else this.reviewError[atc.id] = this.reviewMessage(result)
    } catch (error) {
      console.error("Could not restore the review", error)
      this.reviewError[atc.id] = "Could not restore the review — check your connection and try again."
    } finally {
      this.reviewBusy[atc.id] = false
    }
  }
  async confirmDeleteReview(atc: any, review: AtcReview) {
    this.reviewBusy[atc.id] = true
    try {
      var result = await this.reviewLog.softDelete(this.firestoreATC, atc.ref.path, review.id, this.profileID)
      this.reviewConfirm[atc.id] = null
      if (result == 'ok') this.reviewSnack.open("Review deleted. It stays on the ATC, hidden from the log.", "Dismiss", { duration: 3000 })
      else this.reviewError[atc.id] = this.reviewMessage(result)
    } catch (error) {
      console.error("Could not delete the review", error)
      this.reviewError[atc.id] = "Could not delete the review — check your connection and try again."
    } finally {
      this.reviewBusy[atc.id] = false
    }
  }
  // prototype ATC card: the model tag colour and the initials shown when a participant has no photo
  modelTagClass(product: any): string {
    var model = (product ?? "").toString().toLowerCase()
    return model == "ei solution" ? "tag-ei" : model == "wish" ? "tag-wish" : "tag-model"
  }
  initialsOf(name: any): string {
    var words = (name ?? "").toString().replace(/@.*/, "").split(/[\s._+-]+/).filter(w => w.length != 0)
    return words.slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?"
  }
  askLabel(value: string): string {
    var labels = { self: "Self", spouse: "Spouse", family: "Family", friends: "Friends", sponsors: "Sponsors" }
    return labels[value] ?? value
  }
  outcomeNumber(index: number): string {
    return (index + 1 < 10 ? "0" : "") + (index + 1)
  }
  isWiSHModel(product: any): boolean {
    return (product ?? "").toString().toLowerCase() == "wish"
  }

  trackByActivityKey(index: number, item: any): any {
    return item.key;
  }

  // Helper method to safely convert bigactivity object to array
  getBigActivityEntries(bigActivity: any): any[] {
    if (!bigActivity || typeof bigActivity !== 'object') {
      return [];
    }

    try {
      // Convert object to key-value pairs array
      return Object.entries(bigActivity).map(([key, value]) => ({
        key,
        value: Array.isArray(value) ? value : [value]
      }));
    } catch (error) {
      console.error('Error processing bigActivity:', error);
      return [];
    }
  }

  onPrint(atc, element: HTMLElement, event: MouseEvent) {
    if(event.detail === 3 && (this.mapATCtranscription[atc.id] || {})['view'] && (this.profileRoles["admin"] || this.profileRoles["developer"])){
        if (!element) {
        console.error("Print element not found");
        return;
      }

      const printContents = element.innerHTML;

      // Open popup
      const popupWin = window.open('', '_blank', 'top=0,left=0,height=100%,width=auto');

      // Copy styles from the main document <head>
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(node => node.outerHTML)
        .join('');

      popupWin.document.open();
      popupWin.document.write(`
        <html>
          <head>
            ${styles}
          </head>
          <body onload="window.print(); window.close();">
            ${printContents}
          </body>
        </html>
      `);
      popupWin.document.close();
    }
  }

  openParticipantView(profileId: string, event: MouseEvent): void {
    event.stopPropagation();
    const url = this.router.createUrlTree(['/view-participant-atc'], {
      queryParams: { profileid: profileId }
    });
    window.open(url.toString(), '_blank');
  }
  // onPrint(atc){
  //   console.log(atc)
  //   var atcid = atc["atcid"]
  //   let printContents, popupWin;
  //   console.log(document.getElementById(`${atcid}`))
  //   printContents = document.getElementById(`${atcid}`).innerHTML;
  //   popupWin = window.open('', '_blank', 'top=0,left=0,height=100%,width=auto');
  //   popupWin.document.open();
  //   popupWin.document.write(`
  //     <html>
  //       <head></head>
  //       <style>
  //         table { page-break-inside:auto }
  //         tr    { page-break-inside:avoid; page-break-after:auto }
  //         .heading{
  //           background-color: #FFFFFF;
  //           color: black;
  //           text-align: center;
  //           padding: 15px;
  //         }
  //         .atcdetail{
  //           margin-top: 20px;
  //           padding-top: 20px;
  //           padding-bottom: 15px;
  //           padding-left: 30px;
  //           padding-right: 30px;
  //           border-radius: 10px;
  //           background-color: #FFFFFF;
  //           color: black;
  //         }

  //         .highlight{
  //           font-weight: bold;
  //           display: inline-block;
  //           margin-right: 5px;
  //           color: black;
  //         }

  //         .mainscreen{
  //           padding: 20px;
  //         }
  //         table{
  //           width: 100%;
  //           border-collapse: separate;
  //           border-spacing: 5px 0.5em;
  //         }
  //         .adjustmentbox{
  //           width: 50%;
  //           background-color: #FFFFFF;
  //           padding: 15px;
  //           box-sizing: content-box;
  //         }
  //         .procedurebox{
  //           padding: 15px;
  //           width: 50%;
  //           background-color: #FFFFFF;
  //         }
  //         td{
  //           border: 1px solid;
  //         }
  //         .title{
  //           text-align: center;
  //           color: rgb(3, 48, 63);
  //           font-weight: bold;
  //           // margin-bottom: 10px;
  //         }
  //         @media print{
  //           .heading{
  //             background-color: #FFFFFF;
  //             color: black;
  //             text-align: center;
  //             padding: 15px;
  //           }
  //           .atcdetail{
  //             margin-top: 20px;
  //             padding-top: 20px;
  //             padding-bottom: 15px;
  //             padding-left: 30px;
  //             padding-right: 30px;
  //             border-radius: 10px;
  //             background-color: #FFFFFF;
  //             color: black;
  //           }

  //           .highlight{
  //             font-weight: bold;
  //             display: inline-block;
  //             margin-right: 5px;
  //             color: black;
  //           }

  //           .mainscreen{
  //             padding: 20px;
  //           }
  //           table{
  //             width: 100%;
  //             border-collapse: separate;
  //             border-spacing: 5px 0.5em;
  //           }
  //           .adjustmentbox{
  //             width: 50%;
  //             background-color: #FFFFFF;
  //             padding: 15px;
  //             box-sizing: content-box;
  //           }
  //           .procedurebox{
  //             padding: 15px;
  //             width: 50%;
  //             background-color: #FFFFFF;
  //           }
  //           td{
  //             border: 1px solid;
  //           }
  //           .title{
  //             text-align: center;
  //             color: rgb(3, 48, 63);
  //             font-weight: bold;
  //             // margin-bottom: 10px;
  //           }
  //         }
  //       </style>
  //       <body onload="window.print();">
  //         ${printContents}
  //       </body>
  //     </html>`
  //   );
  //   popupWin.document.close();
  //   popupWin.print();
  // };
}
