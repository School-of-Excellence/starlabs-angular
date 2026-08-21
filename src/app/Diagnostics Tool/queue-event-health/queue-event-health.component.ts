import { Component , HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, onSnapshot, collection, getDocs, query, where, doc, updateDoc, serverTimestamp,getDoc, setDoc, writeBatch, Timestamp ,orderBy } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-queue-event-health',
  imports: [CommonModule, FormsModule],
  templateUrl: './queue-event-health.component.html',
  styleUrl: './queue-event-health.component.css'
})
export class QueueEventHealthComponent {

  /* ================= UI STATE ================= */

  showDashboard = false;
  loading = false;
  error = '';
  showModeFilter = false;
  showStageFilter = false;
  selectedProduct = '';
  productOptions: any[] = [];
  invalidByReasonCount = 0;
  invalidByProductCount = 0;
  invalidByEventStatusCount = 0;
  modeSearchText = '';
  stageSearchText = '';
  atcAlphaUnsub: any;
  atcValidateUnsub: any;


  /* ================= QUEUE ================= */

  queues: any[] = [];
  filteredQueues: any[] = [];
  selectedQueueId = '';
  lastQueueId = '';
  showQueueDropdown = false;
  queueSearchText = '';
  reportLoaded = false;
  initiatedNotInQueueRecords: any[] = [];
  activeView: 'main' | 'initiated_not_in_queue' = 'main';

  /* ================= DATA ================= */

  allRecords: any[] = [];
  filteredRecords: any[] = [];
  paginatedRecords: any[] = [];
  validationFailures: any[] = [];
  tokenUnsub: any;
  ppUnsub: any;
  allTokensRecords: any[] = [];
  liveEventParticipationDocs: any[] = [];
  epUnsub: any;
  atcQueueRecords: any[] = [];
  atcvalidationfailure: any[] = [];
  allAtcRecords: any[] = [];
  liveTokens: any[] = [];
  livePpDocs: any[] = [];
  atcAllUnsub: any;
  atcAlphaRecords: any[] = [];
  atcValidateRecords: any[] = [];
  independentAtcs: any[] = [];
  independentAtcUnsub: any;
  queueStartDate: Date | null = null;
  queueEndDate: Date | null = null;
  arenaEventMap: Map<string, string> = new Map();
  atcGivenCount = 0;
  atcNotGivenCount = 0;
  atcGivenNames: any[] = [];
  atcNotGivenNames: any[] = [];
  showAtcNameList = false;
  activeAtcListType: 'given' | 'not_given' | 'no_queue' | 'partially_unvalidated' | 'fully_unvalidated' | null = null;
  atcNoQueueCount = 0;
  atcNoQueueNames: any[] = [];
  authorNameMap: Map<string, string> = new Map();
  profileAtcDetailsMap: Map<string, any[]> = new Map();
  atcModelsForQueue: string[] = [];
  atcPartiallyUnvalidatedCount = 0;
  atcPartiallyUnvalidatedNames: any[] = [];
  atcFullyUnvalidatedCount = 0;
  atcFullyUnvalidatedNames: any[] = [];
  fixingNoQueueAtcs = false;
  atcListPageSize = 10;
  atcListCurrentPage = 1;
  atcListPageSizeOptions = [10, 25, 50, 100];
  atcActiveFilter: 'product' | 'stage' | null = null;
  atcSelectedProduct = '';
  atcSelectedStage = '';

  /* ================= FILTERS ================= */

  selectedProductStatus = '';
  selectedIntegrationMode = '';
  filteredIntegrationModeOptions: string[] = [];
  filteredStageOptions: string[] = [];
  selectedStage = '';
  searchText = '';

  productStatusOptions: any[] = [];
  integrationModeOptions: any[] = [];
  stageOptions: any[] = [];
  showAttendedModal = false;
  attendedModalRecordCount = 0;
  attendedStatusSelection: 'completed' | 'shifted' = 'completed';
  attendedStatusResolver: ((status: 'completed' | 'shifted' | null) => void) | null = null;

  activeFilter: 'status' | 'mode' | 'stage' | null = null;

  activeKpiFilter:
    | 'completed'
    | 'initiated'
    | 'ongoing'
    | 'cancelled'
    | 'valid'
    | 'invalid'
    | 'active'
    | 'inactive'
    | 'shifted'
    | 'invalid_reason'
    | 'invalid_product'
    | 'invalid_event_status'
    | 'initiated_not_in_queue'
    | null = null;

  /* ================= PAGINATION ================= */

  pageSize = 10;
  currentPage = 1;
  totalPages = 1;
  pageSizeOptions = [10, 25, 50, 100];

  /* ================= KPI ================= */

  dashboard = {
    total: 0,
    completed: 0,
    initiated: 0,
    ongoing: 0,
    cancelled: 0,
    valid: 0,
    failed: 0,
    active: 0,
    inactive: 0,
    shifted:0,
    initiatedNotInQueue: 0
  };

  firestoreDefault = getFirestore()

  constructor(
    private authService: AuthguardService,
    private router: Router,
  ) {
    this.showDashboard = true;
    this.loadQueues();
  }

  /* VALIDATION — ONLY 2 CASES ARE VALID */

  validateRecord(
    productStatus: string,
    integrationMode: string,
    eventParticipationStatus: string,
    tokenStatus: string
  ): { passed: boolean; reason: string } {

    const status = (productStatus || '').toLowerCase();
    const mode = (integrationMode || '').toLowerCase();
    const epstatus = (eventParticipationStatus || '').toLowerCase();
    const tstatus = String(tokenStatus || '').trim().toLowerCase();
    const modeIsEmpty = !integrationMode || mode === 'null' || mode === '';

    // HARD FAIL → INVALID if event participation status not found
    if (!eventParticipationStatus || eventParticipationStatus === 'Not Found') {
      return { passed: false, reason: 'Invalid: event participation status not found' };
    }

    // SCENARIO 1: Initiated
    if (
      status === 'initiated' &&
      epstatus === 'approved' &&
      tstatus === 'active' &&
      ['event mode', 'early preparation mode', 'preparation mode'].includes(mode)
    ) {
      return { passed: true, reason: 'Valid: initiated' };
    }

    // SCENARIO 2: Ongoing
    if (
      status === 'ongoing' &&
      epstatus === 'approved' &&
      tstatus === 'active' &&
      mode === 'event mode'
    ) {
      return { passed: true, reason: 'Valid: ongoing' };
    }

    // SCENARIO 3: Completed
    if (
      status === 'completed' &&
      ['attended'].includes(epstatus) &&
      tstatus === 'active' &&
      [
        'integration mode',
        'performance mode',
        'extended performance mode',
        'after extended performance mode'
      ].includes(mode)
    ) {
      return { passed: true, reason: 'Valid: completed' };
    }

    // SCENARIO 4: Shifted
    if (
      status === 'shifted' &&
      epstatus === 'attended' &&
      tstatus === 'active' &&
      modeIsEmpty
    ) {
      return { passed: true, reason: 'Valid: shifted' };
    }

    // SCENARIO 5: Cancelled
    if (
      status === 'cancelled' &&
      ['unattended', 'revoked','denied'].includes(epstatus) &&
      tstatus === 'inactive' &&
      modeIsEmpty
    ) {
      return { passed: true, reason: 'Valid: cancelled' };
    }

    return {
      passed: false,
      reason: `product status is ${status || '-'}, mode is ${mode || 'N/A'}, token status is ${tstatus || '-'}`
    };
  }

  /* ================= QUEUE DROPDOWN ================= */

  openQueueDropdown() {
    this.showQueueDropdown = true;
    this.queueSearchText = '';
    this.filteredQueues = [...this.queues];
  }

  filterQueues() {
    const text = this.queueSearchText.toLowerCase();
    this.filteredQueues = this.queues.filter(q =>
      q.queuename.toLowerCase().includes(text)
    );
  }


  selectQueue(queue: any) {
    console.log('Clicked queue:', queue.queuename, queue.docid);
    this.selectedQueueId = queue.docid;
    this.queueSearchText = queue.queuename;
    this.queueStartDate = queue.queuestartdate?.toDate?.() ?? null;
    this.queueEndDate = queue.queueenddate?.toDate?.() ?? null;
    this.showQueueDropdown = false;
    this.onQueueChange();
  }

  clearQueueIfSelected() {
    if (this.selectedQueueId) {
      this.selectedQueueId = '';
      this.queueSearchText = '';
      this.filteredQueues = [...this.queues];
      this.showQueueDropdown = true;
      this.resetReport();
    }
  }

  @HostListener('document:click', ['$event'])
  handleOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // If click is inside queue selector → do nothing
    if (target.closest('.queue-select-container')) {
      return;
    }

    // Clicked outside
    this.showQueueDropdown = false;

    // If no queue selected, clear search text
    if (!this.selectedQueueId) {
      this.queueSearchText = '';
    }
  }


  calculateDashboardCounts() {
    this.dashboard.total = this.allRecords.length;
    this.dashboard.initiatedNotInQueue = this.initiatedNotInQueueRecords.length;
    this.dashboard.completed = this.allRecords.filter(
      r => r.productStatus?.toLowerCase() === 'completed'
    ).length;

    this.dashboard.initiated = this.allRecords.filter(
      r => r.productStatus?.toLowerCase() === 'initiated'
    ).length;

    this.dashboard.ongoing = this.allRecords.filter(
      r => r.productStatus?.toLowerCase() === 'ongoing'
    ).length;

    this.dashboard.cancelled = this.allRecords.filter(
      r => r.productStatus?.toLowerCase() === 'cancelled'
    ).length;

    this.dashboard.active = this.allRecords.filter(
      r => String(r.tokenStatus).trim().toLowerCase() === 'active'
    ).length;

    this.dashboard.inactive = this.allRecords.filter(
      r => String(r.tokenStatus).trim().toLowerCase() === 'inactive'
    ).length;

    this.dashboard.shifted = this.allRecords.filter(
      r => String(r.productStatus).trim().toLowerCase() === 'shifted'
    ).length;

    this.dashboard.valid = this.allRecords.filter(
      r => r.validationPassed === true
    ).length;

    this.dashboard.failed = this.allRecords.filter(
      r => r.validationPassed === false
    ).length;
  }


  /* ================= QUEUE CHANGE ================= */

  onQueueChange() {
    if (!this.selectedQueueId || this.selectedQueueId === this.lastQueueId) {
      return;
    }

    const queueId = this.selectedQueueId;
    this.lastQueueId = queueId;

    //console.log('Queue selected:', queueId);

    this.loadReport(queueId);
  }

  trackByQueueId(index: number, queue: any) {
    return queue.id;
  }

  resetReport() {
    this.reportLoaded = false;
    this.allRecords = [];
    this.filteredRecords = [];
    this.paginatedRecords = [];
    this.validationFailures = [];
    this.activeKpiFilter = null;
    this.initiatedNotInQueueRecords = [];
    this.activeView = 'main';
    this.atcGivenCount = 0;
    this.atcNotGivenCount = 0;
    this.atcGivenNames = [];
    this.atcNotGivenNames = [];
    this.showAtcNameList = false;
    this.activeAtcListType = null;
    this.atcNoQueueCount = 0;
    this.atcNoQueueNames = [];
    // this.selectedProfileId = null;
    // this.selectedProfileAtcList = [];
    this.profileAtcDetailsMap = new Map();
    this.atcValidateRecords = [];

    if (this.atcAlphaUnsub) {
      this.atcAlphaUnsub();
      this.atcAlphaUnsub = null;
    }

    if (this.atcValidateUnsub) {
      this.atcValidateUnsub();
      this.atcValidateUnsub = null;
    }

    this.dashboard = {
      total: 0,
      completed: 0,
      initiated: 0,
      ongoing: 0,
      cancelled: 0,
      valid: 0,
      failed: 0,
      active: 0,
      inactive:0,
      shifted:0,
      initiatedNotInQueue: 0
    };
  }

  async handleEventParticipationForSelectedToken(selectedToken: any) {
    try {
      if (selectedToken.validationPassed === true) {
        return;
      }

      const ppid = selectedToken.participantproductid;
      if (!ppid) {
        console.warn('PPID missing, cannot proceed');
        return;
      }

      const selectedQueueRef = doc(
        this.firestoreDefault,
        'queue generation',
        this.selectedQueueId
      );

      const productRef = selectedToken.productref;

      if (!productRef) {
        console.warn('eventref or productref missing in token');
        return;
      }

      const key = `${productRef.id}`;
      const arenaeventid = this.arenaEventMap.get(key);

      if (!arenaeventid) {
        console.warn('No arena event found for product + queue');
        return;
      }


      //Resolve arenaeventid using eventref + productref

      // const arenaQuery = query(
      //   collection(this.firestoreDefault, 'arena events'),
      //   where('productref', '==', productRef),
      //   where('eventref', '==', selectedQueueRef),
      //   where("delete", "==", false)
      // );

      // const arenaSnap = await getDocs(arenaQuery);

      // if (arenaSnap.empty) {
      //   console.warn('No arena event found for given eventref and productref');
      //   return;
      // }

      // // Assuming one arena per event + product
      // const arenaDoc = arenaSnap.docs[0];
      // const arenaeventid = arenaDoc.data()['docid'];

      /* ---------------------------------------
        Check existing event participation request
      ---------------------------------------- */
      // const epQuery = query(
      //   collection(this.firestoreDefault, 'event participation request'),
      //   where('participantproductid', '==', ppid),
      //   where('arenaeventid', '==', arenaeventid)
      // );

      // const epSnap = await getDocs(epQuery);

      // if (!epSnap.empty) {
      //   // Update timestamp
      //   await updateDoc(epSnap.docs[0].ref, {
      //     updateddate: serverTimestamp()
      //   });
      //   return;
      // }

      //Decide status

      const productStatus = String(selectedToken.productStatus).toLowerCase();
      const participationStatus =
        ['ongoing', 'completed', 'shifted'].includes(productStatus)
          ? 'approved'
          : 'denied';

      // Use the already-loaded pp doc instead of querying again —
      const pp = this.livePpDocs.find(p => p.id === ppid);
      if (!pp) {
        console.warn('Participantsproduct document not found for ppid:', ppid);
        return;
      }
      const ppRef = doc(this.firestoreDefault, 'participantsproduct', pp.id);

      //Create event participation request
      // Generate docID
      const epRef = doc(
        collection(this.firestoreDefault, 'event participation request')
      );

      const batch = writeBatch(this.firestoreDefault);
      batch.set(epRef, {
        docid: epRef.id,
        doccreateddate: serverTimestamp(),
        eventref: selectedQueueRef,
        productref: productRef,
        status: participationStatus,
        profileid: selectedToken.profileid,
        participantproductid: ppid,
        arenaeventid: arenaeventid,
        initiatedfrom: 'health'
      });

      batch.update(ppRef, {
        eventparticipationid: epRef.id,
        eventref: selectedQueueRef,
        arenaeventid: arenaeventid
      });
      await batch.commit();

      // OPTIMISTIC UPDATE (this is the key)
      this.liveEventParticipationDocs.push({
        id: epRef.id,
        docid: epRef.id,
        status: participationStatus,
        participantproductid: ppid,
        arenaeventid: arenaeventid
      });

    } catch (error) {
      console.error('Failed to handle event participation request', error);
    }
  }

  async fixInvalidToken(record: any) {
    record.fixing = true;
    try {
      await this.handleEventParticipationForSelectedToken(record);
      this.buildLiveReport();
    } finally {
      record.fixing = false;
    }
  }

  async fixAllInvalidEventStatus() {
    // Only fix SELECTED records with missing event participation
    const recordsToFix = this.filteredRecords.filter(
      r =>
        r.selected &&
        !r.validationPassed &&
        r.eventParticipationStatus === 'Not Found' &&
        !r.fixing
    );

    if (recordsToFix.length === 0) {
      return;
    }

    for (const record of recordsToFix) {
      record.fixing = true;

      try {
        await this.handleEventParticipationForSelectedToken(record);
      } catch (e) {
        console.error('Fix failed for token', record.TokenID, e);
      } finally {
        record.fixing = false;
      }
    }

    // Clear selection after fixing
    recordsToFix.forEach(r => r.selected = false);

    // Rebuild once after all fixes
    this.buildLiveReport();
  }


  calculateInvalidKpiCounts() {
  const reasons = new Set<string>();
  const products = new Set<string>();
  const eventStatuses = new Set<string>();

  for (const r of this.validationFailures) {
    if (r.validationReason) {
      reasons.add(r.validationReason);
    }

    if (r.productName) {
      products.add(r.productName);
    }

    if (r.eventParticipationStatus) {
      eventStatuses.add(r.eventParticipationStatus);
    }
  }

  this.invalidByReasonCount = this.validationFailures.filter(
    r => r.invalidGroup === 'FLOW_MISSING'
  ).length;

  this.invalidByProductCount = this.validationFailures.filter(
    r => r.invalidGroup === 'NO_PPID'
  ).length;

  this.invalidByEventStatusCount = this.validationFailures.filter(
    r => r.invalidGroup === 'NO_EVENT_PARTICIPATION'
  ).length;

}

    mergeAtcsAndRebuild() {
      this.atcQueueRecords = [
        ...this.atcAlphaRecords,
        ...this.atcValidateRecords
      ];

      this.buildLiveReport();
    }

    isWithinQueueDate(date: Date | null): boolean {
      if (!date || !this.queueStartDate || !this.queueEndDate) return false;

      return (
        date >= this.queueStartDate &&
        date <= this.queueEndDate
      );
    }

    startAtcListeners(queueRef: any) {
      if (this.atcModelsForQueue.length === 0) return;

      const firestoreAtc = getFirestore("firestore-atc");
      const startTimestamp = Timestamp.fromDate(this.queueStartDate as Date);
      const endTimestamp = Timestamp.fromDate(this.queueEndDate as Date);

      if (this.atcAlphaUnsub) this.atcAlphaUnsub();
      this.atcAlphaUnsub = onSnapshot(
        query(
          collection(firestoreAtc, 'atc_alpha'),
          where('isdelete', '==', false),
          where('product', 'in', this.atcModelsForQueue),
          where('type','==','online'),
          where('prescription_date', '>=', startTimestamp),
          where('prescription_date', '<=', endTimestamp),
          orderBy('prescription_date','desc')
        ),
        (snap) => {
          this.atcAlphaRecords = snap.docs.map(d => ({
            id: d.id,
            profileid: d.data()['profileid'],
            prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null,
            queueid: d.data()['queueid'] ?? null,
            author: d.data()['author'] ?? [],
            mentorref: d.data()['mentorref'] ?? [],
            product: d.data()['product'] ?? '-',
            source: 'atc_alpha'
          }));
          this.calculateAtcGivenCounts();
          this.calculateAtcNoQueueCounts();
          // console.log("ATC MODELS(ATC_ALPHA)",this.atcModelsForQueue);
        }
      );

      if (this.atcValidateUnsub) this.atcValidateUnsub();
      this.atcValidateUnsub = onSnapshot(
        query(
          collection(firestoreAtc, 'atc_to_validate'),
          where('isdelete', '==', false),
          where('status', '==', 'atc given'),
          where('product', 'in', this.atcModelsForQueue),
          where('type', '==', 'online'),
          where('prescription_date', '>=', startTimestamp),
          where('prescription_date', '<=', endTimestamp),
          orderBy('prescription_date', 'desc')
        ),
        (snap) => {
          this.atcValidateRecords = snap.docs.map(d => ({
            id: d.id,
            profileid: d.data()['profileid'],
            prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null,
            queueid: d.data()['queueid'] ?? null,
            author: d.data()['author'] ?? [],
            mentorref: d.data()['mentorref'] ?? [],
            product: d.data()['product'] ?? '-',
            status: d.data()['status'] ?? null,
            source: 'atc_to_validate'
          }));
          this.calculateAtcGivenCounts();
          this.calculateAtcNoQueueCounts();
          // console.log("ATC MODEL (ATC_TO_VALIDATE) :", this.atcModelsForQueue);
        }
      );
    }

  /* ================= LOAD QUEUES ================= */

  async loadQueues() {
    const snap = await getDocs(collection(this.firestoreDefault, 'queue generation'));
    this.queues = snap.docs .map(d => ({
    id: d.id, ...d.data() })) .sort((a: any, b: any) => {
      if (!a.queueenddate) return 1;
      if (!b.queueenddate) return -1;
      return b.queueenddate.toMillis() - a.queueenddate.toMillis();
    });
  }

  async buildInitiatedNotInQueueRecords() {
    // STEP 1: Find all participantproductids that have an ACTIVE token
    let activeTokenPpIds: string[] = [];

    for (let i = 0; i < this.liveTokens.length; i++) {
      const token = this.liveTokens[i];
      const status = String(token['tokenstatus']).trim().toLowerCase();
      if (status === 'active') {
        activeTokenPpIds.push(token['participantproductid']);
      }
    }

    // STEP 2: Find participantsproduct docs that are "initiated" and do NOT have an active token
    let candidates: any[] = [];
    for (let i = 0; i < this.livePpDocs.length; i++) {
      const pp = this.livePpDocs[i];
      const ppStatus = String(pp.status).toLowerCase();
      const hasActiveToken = activeTokenPpIds.includes(pp.id);
      if (ppStatus === 'initiated' && !hasActiveToken) {
        candidates.push(pp);
      }
    }

    // STEP 3: For each candidate, get participant name, product name, and EP status
    let resolved: any[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const pp = candidates[i];
      // Get participant name
      let participantName = '-';
      if (pp.profileid) {
        const profileSnap = await getDoc(doc(this.firestoreDefault, 'profile_data', pp.profileid));
        if (profileSnap.exists()) {
          participantName = profileSnap.data()['name'] ?? '-';
        }
      }

      // Get product name
      let productName = '-';
      const productRefId = pp.productref ? pp.productref.id : null;
      if (productRefId) {
        const productSnap = await getDoc(doc(this.firestoreDefault, 'products', productRefId));
        if (productSnap.exists()) {
          productName = productSnap.data()['product'] ?? '-';
        }
      }

      // Get event participation status (from data we already have, no new query)
      let epStatus = 'Not Found';
      const epId = pp.eventparticipationid ?? null;
      if (epId) {
        for (let j = 0; j < this.liveEventParticipationDocs.length; j++) {
          if (this.liveEventParticipationDocs[j].docid === epId) {
            epStatus = this.liveEventParticipationDocs[j].status;
            break;
          }
        }
      }

      // Build the record
      const record = {
        participantName: participantName,
        productName: productName,
        productStatus: pp.status ?? '-',
        epStatus: epStatus,
        tokenDocId: null,
        participantproductid: pp.id,
        eventParticipationId: epId,
        selected: false
      };

      resolved.push(record);
    }

    // STEP 4: Save the result and update dashboard count
    this.initiatedNotInQueueRecords = resolved;
    this.dashboard.initiatedNotInQueue = resolved.length;

    // STEP 5: If user is currently on this view, refresh the table
    if (this.activeView === 'initiated_not_in_queue') {
      this.filteredRecords = this.initiatedNotInQueueRecords;
      this.currentPage = 1;
      this.calculatePagination();
    }
  }

  get initiatedNotInQueueSelectedCount(): number {
    return this.initiatedNotInQueueRecords.filter(r => r.selected).length;
  }

  toggleSelectAllInitiated(event: any) {
    const checked = event.target.checked;
    this.initiatedNotInQueueRecords.forEach(r => r.selected = checked);
  }

  // async bulkMarkInitiatedUnattended() {
  //   const selectedRecords = this.initiatedNotInQueueRecords.filter(r => r.selected);

  //   if (selectedRecords.length === 0) {
  //     alert('No participants selected');
  //     return;
  //   }

  //   const confirmAction = confirm(
  //     `Are you sure you want to mark ${selectedRecords.length} participant(s) as Unattended?\n\n` +
  //     `This will:\n` +
  //     `• Set Product Status → cancelled\n` +
  //     `• Set Event Participation → unattended (if exists)\n\n` +
  //     `This action cannot be undone.`
  //   );

  //   if (!confirmAction) return;

  //   const batch = writeBatch(this.firestoreDefault);

  //   for (const record of selectedRecords) {
  //     // Update participantsproduct → cancelled
  //     if (record.ppId) {
  //       const ppRef = doc(this.firestoreDefault, 'participantsproduct', record.ppId);
  //       batch.update(ppRef, {
  //         status: 'cancelled',
  //         'statusdate.cancelled': serverTimestamp()
  //       });
  //     }

  //     // Update event participation → unattended (only if ep exists)
  //     if (record.epId) {
  //       const epRef = doc(
  //         this.firestoreDefault,
  //         'event participation request',
  //         record.epId
  //       );
  //       batch.update(epRef, {
  //         status: 'unattended'
  //       });
  //     }
  //   }

  //   await batch.commit();

  //   // Clear selection
  //   this.initiatedNotInQueueRecords.forEach(r => r.selected = false);
  // }
  /* ================= LOAD REPORT ================= */

  loadReport(queueId: string) {
    this.loading = true;
    this.resetReport();
    const queueRef = doc(this.firestoreDefault,'queue generation', queueId);
      onSnapshot(
        query(
          collection(this.firestoreDefault, 'arena events'),
          where('eventref', '==', queueRef),
          where('delete', '==', false)
        ),
        async (snap) => {
          this.arenaEventMap.clear();
          var productRefsForQueue: any[] = [];

          snap.docs.forEach(d => {
            const data = d.data();
            const productRef = data['productref'];
            const arenaEventId = data['docid'];

            if (productRef?.id && arenaEventId) {
              const key = `${productRef.id}`;
              this.arenaEventMap.set(key, arenaEventId);
              productRefsForQueue.push(productRef);
            }
          });

          // get atcmodel from each product doc, same getDoc pattern
          // used in buildInitiatedNotInQueueRecords
          this.atcModelsForQueue = [];
          for (let i = 0; i < productRefsForQueue.length; i++) {
            const productSnap = await getDoc(productRefsForQueue[i]);
            if (productSnap.exists()) {
              const atcmodel = productSnap.data()['atcmodel'];
              if (atcmodel && !this.atcModelsForQueue.includes(atcmodel)) {
                this.atcModelsForQueue.push(atcmodel);
              }
            }
          }

          this.startAtcListeners(queueRef);
        }
      );

    // Stop previous listeners
    if (this.tokenUnsub) this.tokenUnsub();
    if (this.ppUnsub) this.ppUnsub();

    try {
      // const queueRef = doc(this.firestoreDefault, 'queue generation', queueId);
      // ATC ALPHA (VALID)
      // const firestoreATC = getFirestore("firestore-atc")
      // if (this.atcAlphaUnsub) this.atcAlphaUnsub();
      // this.atcAlphaUnsub = onSnapshot(
      //   query(
      //     collection(firestoreATC, 'atc_alpha'),
      //     where('isdelete', '==', false)
      //   ),
      //   (snap) => {
      //     this.atcAlphaRecords = snap.docs.map(d => ({
      //       source: 'atc_alpha',
      //       profileid: d.data()['profileid'],
      //       queueid: d.data()['queueid'] ?? null,
      //       prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null
      //     }));

      //     this.mergeAtcsAndRebuild();
      //   }
      // );

      // // ---- ATC TO VALIDATE (LIVE) ----
      // if (this.atcValidateUnsub) this.atcValidateUnsub();

      // this.atcValidateUnsub = onSnapshot(
      //   query(
      //     collection(firestoreATC, 'atc_to_validate'),
      //     where('isdelete', '==', false)
      //   ),
      //   (snap) => {
      //     this.atcValidateRecords = snap.docs.map(d => ({
      //       source: 'atc_to_validate',
      //       profileid: d.data()['profileid'],
      //       queueid: d.data()['queueid'] ?? null,
      //       prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null
      //     }));
      //     this.mergeAtcsAndRebuild();
      //   }
      // );

      //  LIVE TOKEN LISTENER
      this.tokenUnsub = onSnapshot(
        query(
          collection(this.firestoreDefault, 'queue_token'),
          where('queueref', '==', queueRef),
          //where('tokenstatus', '==', 'Active'), where('stagestatus', '==', 'Approved')
        ),
        (tokenSnap) => {
          this.liveTokens = tokenSnap.docs.map(d => ({
            docId: d.id,
            ...d.data()
          }));
          this.buildLiveReport();
        }
      );

      //  LIVE PARTICIPANT PRODUCT LISTENER
      this.ppUnsub = onSnapshot(
        query(
          collection(this.firestoreDefault, 'participantsproduct'),
          where('eventref', '==', queueRef)
        ),
        (ppSnap) => {
          this.livePpDocs = ppSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          this.buildLiveReport();
        }
      );

      if (this.epUnsub) this.epUnsub();

      this.epUnsub = onSnapshot(
        query(
        collection(this.firestoreDefault, 'event participation request'),
        where('eventref','==',queueRef)
        ),
        (epSnap) => {
          this.liveEventParticipationDocs = epSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          this.buildLiveReport();
        }
      );


    } catch (e) {
      console.error(e);
      this.error = 'Failed to load report';
      this.loading = false;
    }
  }

  calculateAtcGivenCounts() {
    const alphaProfileIds = new Set<string>();
    const validateProfileIds = new Set<string>();

    for (const a of this.atcAlphaRecords) {
      if (a.profileid && this.isWithinQueueDate(a.prescriptionDate)) {
        alphaProfileIds.add(a.profileid);
      }
    }

    for (const a of this.atcValidateRecords) {
      if (a.profileid && this.isWithinQueueDate(a.prescriptionDate)) {
        validateProfileIds.add(a.profileid);
      }
    }

    const activeRecords = this.allRecords.filter(
      r => String(r.tokenStatus).trim().toLowerCase() === 'active'
    );

    // 1. ATC GIVEN — fetch all ATC's from atc_alpha
    const seenGiven = new Set<string>();
    this.atcGivenNames = activeRecords.filter(r => {
      if (alphaProfileIds.has(r.profileid) && !seenGiven.has(r.profileid)) {
        seenGiven.add(r.profileid);
        return true;
      } else {
        return false;
      }
    });
    this.atcGivenCount = this.atcGivenNames.length;

    // 2. ATC PARTIALLY UNVALIDATED — check any atc is validated
    const seenPartial = new Set<string>();
    this.atcPartiallyUnvalidatedNames = activeRecords.filter(r => {
      if (validateProfileIds.has(r.profileid) && alphaProfileIds.has(r.profileid) && !seenPartial.has(r.profileid)) {
        seenPartial.add(r.profileid);
        return true;
      } else {
        return false;
      }
    });
    this.atcPartiallyUnvalidatedCount = this.atcPartiallyUnvalidatedNames.length;

    // 3. ATC FULLY UNVALIDATED — ATC only fetched from atc_to_validate
    const seenFullyUnval = new Set<string>();
    this.atcFullyUnvalidatedNames = activeRecords.filter(r => {
      if (validateProfileIds.has(r.profileid) && !alphaProfileIds.has(r.profileid) && !seenFullyUnval.has(r.profileid)) {
        seenFullyUnval.add(r.profileid);
        return true;
      } else {
        return false;
      }
    });
    this.atcFullyUnvalidatedCount = this.atcFullyUnvalidatedNames.length;

    // 4. ATC NOT GIVEN — no ATC doc found in both collections
    const seenNotGiven = new Set<string>();
    this.atcNotGivenNames = activeRecords.filter(r => {
      if (!alphaProfileIds.has(r.profileid) && !validateProfileIds.has(r.profileid) && !seenNotGiven.has(r.profileid)) {
        seenNotGiven.add(r.profileid);
        return true;
      } else {
        return false;
      }
    });
    this.atcNotGivenCount = this.atcNotGivenNames.length;
  }

  calculateAtcNoQueueCounts() {
    const noQueueProfileIds = new Set<string>();

    for (const a of [...this.atcAlphaRecords, ...this.atcValidateRecords]) {
      const hasNoQueue = a.queueid === null || a.queueid === undefined || String(a.queueid).trim() === '';
      if (a.profileid && hasNoQueue && this.isWithinQueueDate(a.prescriptionDate)) {
        noQueueProfileIds.add(a.profileid);
      }
    }

    // ONLY ACTIVE TOKENS
    const activeRecords = this.allRecords.filter(
      r => String(r.tokenStatus).trim().toLowerCase() === 'active'
    );

    const seenNoQueue = new Set<string>();
    this.atcNoQueueNames = activeRecords.filter(r => {
      if (!noQueueProfileIds.has(r.profileid)) return false;
      if (seenNoQueue.has(r.profileid)) return false;
      seenNoQueue.add(r.profileid);
      return true;
    });

    this.atcNoQueueCount = this.atcNoQueueNames.length;
  }

  toggleSelectAllNoQueueAtcs(event: any) {
    const checked = event.target.checked;
    for (const entries of this.profileAtcDetailsMap.values()) {
      for (const a of entries) {
        if (a.noQueue) {
          a.selected = checked;
        }
      }
    }
  }

  async fixSelectedNoQueueAtcs() {
    if (!this.selectedQueueId) {
      alert('No queue selected');
      return;
    }

    const selectedEntries: { id: string; source: string }[] = [];

    for (const entries of this.profileAtcDetailsMap.values()) {
      for (const a of entries) {
        if (a.selected && a.noQueue) {
          selectedEntries.push({ id: a.id, source: a.source });
        }
      }
    }

    if (selectedEntries.length === 0) {
      alert('No ATCs selected');
      return;
    }

    const confirmAction = confirm(
      `Map ${selectedEntries.length} selected ATC record(s) to the current queue?`
    );
    if (!confirmAction) return;

    this.fixingNoQueueAtcs = true;

    try {
      const firestoreAtc = getFirestore('firestore-atc');
      const batch = writeBatch(firestoreAtc);

      for (const entry of selectedEntries) {
        const collectionName = entry.source === 'atc_alpha' ? 'atc_alpha' : 'atc_to_validate';
        const ref = doc(firestoreAtc, collectionName, entry.id);
        batch.update(ref, { queueid: this.selectedQueueId });
      }

      await batch.commit();

      // const idSet = new Set(selectedEntries.map(e => e.id));

      // this.atcAlphaRecords = this.atcAlphaRecords.map(a =>
      //   idSet.has(a.id) ? { ...a, queueid: this.selectedQueueId } : a
      // );

      // this.atcValidateRecords = this.atcValidateRecords.map(a =>
      //   idSet.has(a.id) ? { ...a, queueid: this.selectedQueueId } : a
      // );

      // this.atcQueueRecords = [...this.atcAlphaRecords, ...this.atcValidateRecords];

      // this.calculateAtcNoQueueCounts();
      // this.calculateAtcGivenCounts();
      // await this.buildAllProfileAtcDetails();

    } catch (e) {
      console.error('Failed to fix ATC queue mapping', e);
      alert('Failed to update selected ATC records. Please try again.');
    } finally {
      this.fixingNoQueueAtcs = false;
    }
  }

  get currentAtcList(): any[] {
    switch (this.activeAtcListType) {
      case 'given': return this.atcGivenNames;
      case 'not_given': return this.atcNotGivenNames;
      case 'partially_unvalidated': return this.atcPartiallyUnvalidatedNames;
      case 'fully_unvalidated': return this.atcFullyUnvalidatedNames;
      case 'no_queue': return this.atcNoQueueNames;
      default: return [];
    }
  }

  get atcProductOptions(): any[] {
    return Array.from(
      new Map(
        this.currentAtcList.map(r => [
          r.productName,
          {
            value: r.productName,
            count: this.currentAtcList.filter(x => x.productName === r.productName).length
          }
        ])
      ).values()
    );
  }

  get atcStageOptions(): any[] {
    return Array.from(
      new Map(
        this.currentAtcList.map(r => [
          r.tokenStage,
          {
            value: r.tokenStage,
            count: this.currentAtcList.filter(x => x.tokenStage === r.tokenStage).length
          }
        ])
      ).values()
    );
  }

  get filteredAtcList(): any[] {
    return this.currentAtcList.filter(r => {
      if (this.atcSelectedProduct && r.productName !== this.atcSelectedProduct) return false;
      if (this.atcSelectedStage && r.tokenStage !== this.atcSelectedStage) return false;
      if (this.searchText) {
        const search = this.searchText.toLowerCase();
        const searchableString = [ r.participantName, r.productName, r.tokenStage, r.TokenID ].filter(Boolean).join(' ').toLowerCase();
        if (!searchableString.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  get atcListTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredAtcList.length / this.atcListPageSize));
  }

  get paginatedAtcList(): any[] {
    const start = (this.atcListCurrentPage - 1) * this.atcListPageSize;
    return this.filteredAtcList.slice(start, start + this.atcListPageSize);
  }

  prevAtcListPage() {
    if (this.atcListCurrentPage > 1) {
      this.atcListCurrentPage--;
    }
  }

  nextAtcListPage() {
    if (this.atcListCurrentPage < this.atcListTotalPages) {
      this.atcListCurrentPage++;
    }
  }

  onAtcListPageSizeChange(event: any) {
    this.atcListPageSize = Number(event.target.value);
    this.atcListCurrentPage = 1;
  }

  toggleAtcFilter(type: 'product' | 'stage') {
    this.atcActiveFilter = this.atcActiveFilter === type ? null : type;
  }

  closeAtcFilter() {
    this.atcActiveFilter = null;
  }

  selectAtcProductFilter(value: string) {
    this.atcSelectedProduct = value;
    this.atcActiveFilter = null;
    this.atcListCurrentPage = 1;
  }

  selectAtcStageFilter(value: string) {
    this.atcSelectedStage = value;
    this.atcActiveFilter = null;
    this.atcListCurrentPage = 1;
  }

  exportAtcListCSV() {
    const rows = this.currentAtcList.map(r =>
      `${r.participantName},${r.productName},${r.TokenID},${r.tokenStage}`
    );

    const csv = [
      'Participant,Product,Token Number,Current Stage',
      ...rows
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atc_${this.activeAtcListType}_report.csv`;
    a.click();
  }

  get hasSelectedNoQueueAtcs(): boolean {
    for (const entries of this.profileAtcDetailsMap.values()) {
      for (const a of entries) {
        if (a.selected && a.noQueue) {
          return true;
        }
      }
    }
    return false;
  }

  async resolveAuthorNames(authorRefs: any[]): Promise<string> {
    if (!authorRefs || authorRefs.length === 0) return '-';
    const names = await Promise.all(authorRefs.map(async (ref) => {
      const id = ref?.id;
      if (!id) return null;
      if (this.authorNameMap.has(id)) return this.authorNameMap.get(id);
      try {
        const snap = await getDoc(doc(this.firestoreDefault, 'profile_data', id));
        const name = snap.exists() ? (snap.data()['name'] ?? id) : id;
        this.authorNameMap.set(id, name);
        return name;
      } catch {
        return id;
      }
    }));
    return names.filter(Boolean).join(', ');
  }

  async buildAllProfileAtcDetails() {
    const allProfileIds = new Set<string>([
      ...this.atcGivenNames.map(r => r.profileid),
      ...this.atcNotGivenNames.map(r => r.profileid),
      ...this.atcNoQueueNames.map(r => r.profileid),
      ...this.atcPartiallyUnvalidatedNames.map(r => r.profileid),
      ...this.atcFullyUnvalidatedNames.map(r => r.profileid)
    ]);

    for (const profileid of allProfileIds) {
      const allAtcs = [...this.atcAlphaRecords, ...this.atcValidateRecords]
        .filter((a: any) => a.profileid === profileid);

      const resolved = await Promise.all(allAtcs.map(async (a: any) => {
        const authorNames = await this.resolveAuthorNames(a.author);
        const mentorNames = await this.resolveAuthorNames(a.mentorref)
        const isValidated = a.source === 'atc_alpha' ? true : (a.status !== 'atc given');
        const noQueue = a.queueid === null || a.queueid === undefined || String(a.queueid).trim() === '';
        return {
          id: a.id,
          source: a.source,
          prescriptionDate: a.prescriptionDate,
          authorNames,
          mentorNames,
          atcmodel: a.product,
          isValidated,
          noQueue,
          selected: false
        };
      }));

      resolved.sort((x, y) => (y.prescriptionDate?.getTime() ?? 0) - (x.prescriptionDate?.getTime() ?? 0));

      this.profileAtcDetailsMap.set(profileid, resolved);
    }
  }

  buildLiveReport() {
    this.allRecords = [];
    this.validationFailures = [];
    this.allTokensRecords = [];

    for (const token of this.liveTokens) {

      const ppId = token['participantproductid'];
      const pp = ppId ? this.livePpDocs.find(p => p.id === ppId) : null;

      const eventParticipationId = pp?.eventparticipationid;

      const eventParticipation = eventParticipationId ? this.liveEventParticipationDocs.find(e => e.docid === eventParticipationId) : null;

      const eventParticipationStatus = eventParticipation?.status ?? 'Not Found';


      const modeValue = typeof pp?.mode === 'string' && pp.mode.trim() !== '' ? pp.mode : 'null';

      // ---------------- CREATE RECORD (MISSING PIECE) ----------------
      const record = {
        tokenDocId: token.docId,
        selected : false,
        eventParticipationId: eventParticipation?.id ?? null,
        participantName: token['profile_name'] ?? '-',
        participantproductid: token['participantproductid'],
        eventref: token['eventref'],
        productref: token['productref'],
        profileid: token['profile_id'],
        productName: token['participantproductid']
        ? (token['productname'] ?? '-')
        : 'No Participant Product ID found',
        TokenID: token['tokennumber'] ?? '-',
        productStatus: pp?.status ?? '-',
        integrationMode: modeValue,
        stageStatus: token['stagestatus'] ?? '-',
        tokenStage: token['currentstage'] ?? '-',
        tokenStatus: token['tokenstatus'] ?? '-',
        eventParticipationStatus,
        validationPassed: false,
        validationReason: '',
        invalidGroup: null as 'FLOW_MISSING' | 'NO_PPID' | 'NO_EVENT_PARTICIPATION' | null,
        atcValidatedCount: 0,
        atcUnvalidatedCount: 0,
        independentAtcAlphaCount: 0,
        independentAtcValidateCount: 0
      };
      // console.log('Participant Name:', token['profile_name']);

      // ALL ATCs for this profile (SOURCE OF TRUTH)
      const participantATCs = this.atcQueueRecords.filter(a =>
        a.profileid === record.profileid &&
        this.isWithinQueueDate(a.prescriptionDate)
      );

      // QUEUE ATCs
      const queueATCs = participantATCs.filter(
        a => a.queueid === this.selectedQueueId
      );

      // QUEUE COUNTS
      record.atcValidatedCount = queueATCs.filter(
        a => a.source === 'atc_alpha'
      ).length;

      record.atcUnvalidatedCount = queueATCs.filter(
        a => a.source === 'atc_to_validate'
      ).length;

      // INDEPENDENT ATCs (NO queueid)
      const independentATCs = participantATCs.filter(
        a =>
          a.queueid === null ||
          a.queueid === undefined ||
          String(a.queueid).trim() === '' &&
          this.isWithinQueueDate(a.prescriptionDate)
      );

      // INDEPENDENT COUNTS (SEPARATE)
      record.independentAtcAlphaCount = independentATCs.filter(
        a => a.source === 'atc_alpha'
      ).length;

      record.independentAtcValidateCount = independentATCs.filter(
        a => a.source === 'atc_to_validate'
      ).length;

      // console.log(
      //   'ATCs for profile',
      //   record.profileid,
      //   participantATCs
      // );

      // ---------------- RUN VALIDATION ----------------
      const validation = this.validateRecord(
        record.productStatus,
        // record.tokenStage,
        record.integrationMode,
        record.eventParticipationStatus,
        record.tokenStatus
      );

      record.validationPassed = validation.passed;

      let invalidGroup:
      | 'FLOW_MISSING'
      | 'NO_PPID'
      | 'NO_EVENT_PARTICIPATION'
      | null = null;

      if (!validation.passed) {

        // No PPID found
        if (!record.participantproductid) {
          invalidGroup = 'NO_PPID';
        }

        // No event participation status found
        else if (record.eventParticipationStatus === 'Not Found') {
          invalidGroup = 'NO_EVENT_PARTICIPATION';
        }

        // Validation flow missing (fallback invalid)
        else {
          invalidGroup = 'FLOW_MISSING';
        }
      }

      record.invalidGroup = invalidGroup;


      if (!validation.passed) {
        this.validationFailures.push(record);
      }

      this.allRecords.push(record);

      // ---------------- ALL TOKENS TABLE (SEPARATE) ----------------
      this.allTokensRecords.push({
        participantName: record.participantName,
        TokenID: token['tokennumber'] ?? '-',
        productName: record.productName,
        tokenStatus: record.tokenStatus,
        eventParticipationStatus: record.eventParticipationStatus,
        currentStage: record.tokenStage,
        mode: record.integrationMode,
        productStatus: record.productStatus,
      });
    }

    //  SAFE option building
    this.integrationModeOptions = Array.from(
      new Map(
        this.allRecords.map(r => [
          r.integrationMode,
          {
            value: r.integrationMode,
            count: this.allRecords.filter(
              x => x.integrationMode === r.integrationMode
            ).length
          }
        ])
      ).values()
    );

    this.productOptions = Array.from(
      new Map(
        this.allRecords.map(r => [
          r.productName,
          {
            value: r.productName,
            count: this.allRecords.filter(
              x => x.productName === r.productName
            ).length
          }
        ])
      ).values()
    );

    // Build Mode options with count
    this.integrationModeOptions = Array.from(
      new Map(
        this.allRecords.map(r => [
          r.integrationMode,
          {
            value: r.integrationMode,
            count: this.allRecords.filter(
              x => x.integrationMode === r.integrationMode
            ).length
          }
        ])
      ).values()
    );

    // Build Stage options with count
    this.stageOptions = Array.from(
      new Map(
        this.allRecords.map(r => [
          r.tokenStage,
          {
            value: r.tokenStage,
            count: this.allRecords.filter(
              x => x.tokenStage === r.tokenStage
            ).length
          }
        ])
      ).values()
    );
    this.buildInitiatedNotInQueueRecords();
    this.prepareDashboard();
    this.applyFilters();
    this.calculateDashboardCounts();
    this.reportLoaded = true;
    this.loading = false;
    this.calculateInvalidKpiCounts();
    this.calculateAtcGivenCounts();
    this.calculateAtcNoQueueCounts();
  }

  get selectedCount(): number {
    if (this.activeView === 'initiated_not_in_queue') {
      return this.initiatedNotInQueueRecords.filter(r => r.selected).length;
    }
    return this.allRecords.filter(r => r.selected).length;
  }

  // Mark as Unattended function
  async bulkMarkUnattended() {
    const selectedRecords = this.activeView === 'initiated_not_in_queue'
    ? this.initiatedNotInQueueRecords.filter(r => r.selected)
    : this.allRecords.filter(r => r.selected);
    if (selectedRecords.length === 0) {
      alert('No participants selected');
      return;
    }
    const confirmAction = confirm(
      `Are you sure you want to mark ${selectedRecords.length} participant(s) as Unattended?\n\n` +
      `This will:\n` +
      `• Set Token Status → inactive\n` +
      `• Set Product Status → cancelled\n` +
      `• Set Event Participation → unattended\n\n` +
      `This action cannot be undone.`
    );

    if (!confirmAction) {
      return;
    }
    const batch = writeBatch(this.firestoreDefault);
    for (const record of selectedRecords) {
      if (
        record.tokenDocId &&
        String(record.tokenStatus).toLowerCase() !== 'inactive'
      ) {
        const tokenRef = doc(
          this.firestoreDefault,
          'queue_token',
          record.tokenDocId
        );
        batch.update(tokenRef, {
          tokenstatus: 'inActive'
        });
      }
      if (
        record.participantproductid &&
        String(record.productStatus).toLowerCase() !== 'cancelled'
      ) {
        const ppRef = doc(
          this.firestoreDefault,
          'participantsproduct',
          record.participantproductid
        );
        batch.update(ppRef, {
          status: 'cancelled',
          "statusdate.cancelled": serverTimestamp()
        });
      }
      if (
        record.eventParticipationId &&
        String(record.eventParticipationStatus).toLowerCase() !== 'unattended'
      ) {
        const epRef = doc(
          this.firestoreDefault,
          'event participation request',
          record.eventParticipationId
        );
        batch.update(epRef, {
          status: 'unattended'
        });
      }
    }
    await batch.commit();
    // Clear selection
    this.allRecords.forEach(r => r.selected = false);
  }

  // Mark as Attended function
  async bulkMarkAttended() {
    const selectedRecords = this.activeView === 'initiated_not_in_queue'
      ? this.initiatedNotInQueueRecords.filter(r => r.selected)
      : this.allRecords.filter(r => r.selected);

    if (selectedRecords.length === 0) {
      alert('No participants selected');
      return;
    }

    // Show modal and wait for user to pick a status (or cancel)
    this.attendedModalRecordCount = selectedRecords.length;
    this.attendedStatusSelection = 'completed';
    this.showAttendedModal = true;

    const productStatus = await new Promise<'completed' | 'shifted' | null>(resolve => {
      this.attendedStatusResolver = resolve;
    });

    this.showAttendedModal = false;
    this.attendedStatusResolver = null;

    if (!productStatus) {
      return; // user cancelled
    }

    const batch = writeBatch(this.firestoreDefault);
    let updateCount = 0;

    for (const record of selectedRecords) {
      let recordTouched = false;
      if (record.eventParticipationId && String(record.eventParticipationStatus).toLowerCase() !== 'attended') {
        const epRef = doc(this.firestoreDefault,'event participation request',record.eventParticipationId);
        batch.update(epRef, { status: 'attended' });
        recordTouched = true;
      }
      if (record.participantproductid && String(record.productStatus).toLowerCase() !== productStatus) {
        const ppRef = doc(this.firestoreDefault,'participantsproduct',record.participantproductid);
        batch.update(ppRef, {status: productStatus,[`statusdate.${productStatus}`]: serverTimestamp()});
        recordTouched = true;
      }
      if (recordTouched) updateCount++;
    }

    if (updateCount === 0) {
      alert('Nothing to update — selected records already have this status.');
      return;
    }

    await batch.commit();
    // Clear selection
    selectedRecords.forEach(r => r.selected = false);
  }

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    this.paginatedRecords.forEach(r => r.selected = checked);
  }

  /* ================= KPI CLICK ================= */

  onAtcCountClick(type: 'given' | 'not_given' | 'no_queue' | 'partially_unvalidated' | 'fully_unvalidated') {
    this.activeAtcListType = this.activeAtcListType === type ? null : type;
    this.showAtcNameList = this.activeAtcListType !== null;
    this.atcListCurrentPage = 1;
    this.atcSelectedProduct = '';
    this.atcSelectedStage = '';
    this.atcActiveFilter = null;

    if (this.showAtcNameList) {
      this.buildAllProfileAtcDetails();
    }
  }

  onKpiClick(
    type: 'completed' | 'initiated' | 'active' | 'inactive' | 'shifted' | 'ongoing' | 'cancelled' | 'valid' | 'invalid' | 'invalid_reason' | 'invalid_product' | 'invalid_event_status' | 'initiated_not_in_queue'
  ) {
    this.showAtcNameList = false;
    this.activeAtcListType = null;
    if (type === 'initiated_not_in_queue') {
      this.activeView =
        this.activeView === 'initiated_not_in_queue' ? 'main' : 'initiated_not_in_queue';

      if (this.activeView === 'initiated_not_in_queue') {
        this.filteredRecords = this.initiatedNotInQueueRecords;
        this.currentPage = 1;
        this.calculatePagination();
      } else {
        this.applyFilters();
      }
      return;
    }
    this.activeView = 'main';
    this.activeKpiFilter = this.activeKpiFilter === type ? null : type;
    this.applyFilters();
  }


  /* ================= FILTERS ================= */

  applyFilters() {
  this.filteredRecords = this.allRecords.filter(r => {

    // Mode filter
    if (this.selectedIntegrationMode &&
        r.integrationMode !== this.selectedIntegrationMode) {
      return false;
    }

    // Product filter
    if (
      this.selectedProduct &&
      r.productName !== this.selectedProduct
    ) {
      return false;
    }


    // Stage filter
    if (this.selectedStage &&
        r.tokenStage !== this.selectedStage) {
      return false;
    }

    if (this.activeKpiFilter === 'invalid' && r.validationPassed) {
      return false;
    }


    // ---------- INVALID GROUP KPIs ----------
    if (this.activeKpiFilter === 'invalid_reason') {
      return r.invalidGroup === 'FLOW_MISSING';
    }

    if (this.activeKpiFilter === 'invalid_product') {
      return r.invalidGroup === 'NO_PPID';
    }

    if (this.activeKpiFilter === 'invalid_event_status') {
      return r.invalidGroup === 'NO_EVENT_PARTICIPATION';
    }


    /* ================= KPI FILTERS ================= */

    if (
      this.activeKpiFilter === 'completed' &&
      r.productStatus?.toLowerCase() !== 'completed'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'initiated' &&
      r.productStatus?.toLowerCase() !== 'initiated'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'ongoing' &&
      r.productStatus?.toLowerCase() !== 'ongoing'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'cancelled' &&
      r.productStatus?.toLowerCase() !== 'cancelled'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'active' &&
      String(r.tokenStatus).trim().toLowerCase() !== 'active'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'inactive' &&
      String(r.tokenStatus).trim().toLowerCase() !== 'inactive'
    ) {
      return false;
    }

    if (
      this.activeKpiFilter === 'shifted' &&
      String(r.productStatus).trim().toLowerCase() !== 'shifted'
    ) {
      return false;
    }

    if (this.activeKpiFilter === 'valid' && !r.validationPassed) {
      return false;
    }

    if (this.activeKpiFilter === 'invalid' && r.validationPassed) {
      return false;
    }

    /* ================= SEARCH ================= */

    if (this.searchText) {
      const search = this.searchText.toLowerCase();

      const searchableString = [
        r.participantName,
        r.productName,
        r.productStatus,
        r.integrationMode,
        r.tokenStage,
        r.tokenStatus,
        r.TokenID
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableString.includes(search)) {
        return false;
      }
    }

    return true;
  });

  // GROUPING SORT (must be BEFORE pagination)
  if (
    this.activeKpiFilter === 'invalid_reason' ||
    this.activeKpiFilter === 'invalid_product' ||
    this.activeKpiFilter === 'invalid_event_status'
  ) {
    this.filteredRecords.sort((a, b) =>
      (a.validationReason || '').localeCompare(b.validationReason || '') ||
      (a.productName || '').localeCompare(b.productName || '') ||
      (a.eventParticipationStatus || '').localeCompare(b.eventParticipationStatus || '')
    );
  }

  // Pagination AFTER sorting
  this.currentPage = 1;
  this.calculatePagination();



}


  toggleFilter(type: 'status' | 'mode' | 'stage') {
    this.activeFilter = this.activeFilter === type ? null : type;
  }

  closeFilter() {
    this.activeFilter = null;
  }

  /* ================= PAGINATION ================= */

  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredRecords.length / this.pageSize);
    this.updatePage();
  }

  updatePage() {
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedRecords = this.filteredRecords.slice(start, start + this.pageSize);
  }

  onPageSizeChange(event: any) {
    this.pageSize = Number(event.target.value);
    this.currentPage = 1;
    this.calculatePagination();
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePage();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePage();
    }
  }

  /* ================= KPI ================= */

  prepareDashboard() {
    this.dashboard.total = this.allRecords.length;
    this.dashboard.valid = this.allRecords.filter(r => r.validationPassed).length;
    this.dashboard.failed = this.allRecords.filter(r => !r.validationPassed).length;
  }

  /* ================= EXPORT ================= */

  exportCSV() {
    const rows = this.filteredRecords.map(r =>
      `${r.participantName},${r.productName},${r.productStatus},${r.integrationMode},${r.tokenStage},${r.validationPassed ? 'Valid' : 'Invalid'}`
    );

    const csv = [
      'Participant,Product,Status,Mode,Stage,Validation',
      ...rows
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'queue_report.csv';
    a.click();
  }
}
