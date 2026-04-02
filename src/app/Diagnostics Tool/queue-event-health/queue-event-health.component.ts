import { Component , HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, onSnapshot, collection, getDocs, query, where, doc, updateDoc, serverTimestamp,getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';

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
  initiatedNotInQueueDocs: any[] = [];
  initiatedNotInQueueRecords: any[] = [];
  initiatedNotInQueuePpUnsub: any;
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

  constructor(
    private authService: AuthguardService,
    private router: Router,
    public firestore: Firestore
  ) {
    this.showDashboard = true;
    this.loadQueues();
  }

  /* VALIDATION — ONLY 2 CASES ARE VALID */

  validateRecord(
    productStatus: string,
    tokenStage: string,
    integrationMode: string,
    eventParticipationStatus: string
  ): { passed: boolean; reason: string } {

    const status = (productStatus || '').toLowerCase();
    const stage = (tokenStage || '').toLowerCase();
    const mode = (integrationMode || '').toLowerCase();
    const epstatus = (eventParticipationStatus || '').toLowerCase();

    // HARD FAIL → INVALID if event participation status not found
    if (
      !eventParticipationStatus ||
      eventParticipationStatus === 'Not Found'
    ) {
      return {
        passed: false,
        reason: 'Invalid: event participation status not found'
      };
    }

    /* CASE 1 */
    if (
      (['completed'].includes(status) &&
      [
        'integration mode',
        'performance mode',
        'extended performance mode',
        'after extended performance mode'
      ].includes(mode)) || status == "shifted" &&
      epstatus == 'attended'
    ) {
      return {
        passed: true,
        reason: 'Valid: completed/shifted via integration/performance flow'
      };
    }

    /* CASE 2 */
    if (
      status == 'initiated' || status ==  'ongoing' &&
      [
        'event mode',
        'preparation',
        'early preparation'
      ].includes(mode) &&
      epstatus == 'approved'
    ) {
      return {
        passed: true,
        reason: 'Valid: event/preparation flow'
      };
    }

    // CASE 3 → VALID
    if (
      status === 'cancelled' &&
      eventParticipationStatus?.toLowerCase() === 'unattended'
    ) {
      return {
        passed: true,
        reason: 'Valid: marked as unattended'
      };
    }

    // CASE 4
    if (
      status === 'shifted' &&
      epstatus === 'attended' || epstatus === 'approved'
    ) {
      return {
        passed: true,
        reason: 'Valid: shifted'
      };
    }


    // EVERYTHING ELSE → INVALID
    return {
      passed: false,
      reason: `product status is ${status || '-'}, current stage is ${stage || '-'}, mode is ${mode || 'N/A'}`
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
    this.initiatedNotInQueueDocs = [];
    this.activeView = 'main';

    if (this.initiatedNotInQueuePpUnsub) {
      this.initiatedNotInQueuePpUnsub();
      this.initiatedNotInQueuePpUnsub = null;
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
        this.firestore,
        'queue generation',
        this.selectedQueueId
      );

      const productRef = selectedToken.productref;

      if (!productRef) {
        console.warn('eventref or productref missing in token');
        return;
      }

      const key = `${productRef.id}_${this.selectedQueueId}`;
      const arenaeventid = this.arenaEventMap.get(key);

      if (!arenaeventid) {
        console.warn('No arena event found for product + queue');
        return;
      }


      //Resolve arenaeventid using eventref + productref

      // const arenaQuery = query(
      //   collection(this.firestore, 'arena events'),
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
      //   collection(this.firestore, 'event participation request'),
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

      //Create event participation request
      // Generate docID
      const epRef = doc(
        collection(this.firestore, 'event participation request')
      );

      // SINGLE atomic write
      await setDoc(epRef, {
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


      // eventparticipationid into participantsproduct
      const ppQuery = query(
        collection(this.firestore, 'participantsproduct'),
        where('docid', '==', ppid)
      );

      const ppSnap = await getDocs(ppQuery);

      if (!ppSnap.empty) {
        await updateDoc(ppSnap.docs[0].ref, {
          eventparticipationid: epRef.id,
          eventref: selectedQueueRef,
          arenaeventid: arenaeventid
        });
      } else {
        console.warn('Participantsproduct document not found for ppid:', ppid);
      }

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
    // Only fix records with missing event participation
    const recordsToFix = this.filteredRecords.filter(
      r =>
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

  /* ================= LOAD QUEUES ================= */

  async loadQueues() {
    const snap = await getDocs(collection(this.firestore, 'queue generation'));
    this.queues = snap.docs .map(d => ({
    id: d.id, ...d.data() })) .sort((a: any, b: any) => {
      if (!a.queueenddate) return 1;
      if (!b.queueenddate) return -1;
      return b.queueenddate.toMillis() - a.queueenddate.toMillis();
    });
  }

  async buildInitiatedNotInQueueRecords() {
    const queueProductRefIds = new Set<string>(
      [...this.arenaEventMap.keys()]
    );

    const tokenPpIds = new Set<string>(
      this.liveTokens
        .map(t => t['participantproductid'])
        .filter(Boolean)
    );

    const filtered = this.initiatedNotInQueueDocs
      .filter(pp => {
        const productRefId = pp.productref?.id ?? null;
        return productRefId && queueProductRefIds.has(productRefId);
      })
      .filter(pp => !tokenPpIds.has(pp.id));

    const resolved = await Promise.all(
      filtered.map(async (pp) => {

        let participantName = '-';
        if (pp.profileid) {
          try {
            const profileSnap = await getDoc(
              doc(this.firestore, 'profile_data', pp.profileid)
            );
            if (profileSnap.exists()) {
              const d = profileSnap.data();
              participantName = d['name'] ?? '-';
            }
          } catch (e) {
            console.warn('Failed to fetch profile_data', pp.profileid, e);
          }
        }

        let productName = '-';
        const productRefId = pp.productref?.id ?? null;
        if (productRefId) {
          try {
            const productSnap = await getDoc(
              doc(this.firestore, 'products', productRefId)
            );
            if (productSnap.exists()) {
              const d = productSnap.data();
              productName = d['product'] ?? '-';
            }
          } catch (e) {
            console.warn('Failed to fetch product', productRefId, e);
          }
        }

        const epId = pp.eventparticipationid ?? null;
        let epStatus = 'Not Found';

        if (epId) {
          try {
            const epSnap = await getDoc(
              doc(this.firestore, 'event participation request', epId)
            );
            if (epSnap.exists()) {
              epStatus = epSnap.data()['status'] ?? 'Found (status missing)';
            }
          } catch (e) {
            console.warn('Failed to fetch EP doc', epId, e);
          }
        }
        return {
          participantName,
          productName,
          productStatus: pp.status ?? '-',
          epStatus,
          tokenDocId: null,
          participantproductid: pp.id,
          eventParticipationId: epId ?? null,
          selected: false
        };
      })
    );

    this.initiatedNotInQueueRecords = resolved;
    this.dashboard.initiatedNotInQueue = this.initiatedNotInQueueRecords.length;

    // Reuse main pagination if currently in this view
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

  //   const batch = writeBatch(this.firestore);

  //   for (const record of selectedRecords) {
  //     // Update participantsproduct → cancelled
  //     if (record.ppId) {
  //       const ppRef = doc(this.firestore, 'participantsproduct', record.ppId);
  //       batch.update(ppRef, {
  //         status: 'cancelled',
  //         'statusdate.cancelled': serverTimestamp()
  //       });
  //     }

  //     // Update event participation → unattended (only if ep exists)
  //     if (record.epId) {
  //       const epRef = doc(
  //         this.firestore,
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
    // ---- INITIATED NOT IN QUEUE LISTENER ----
    if (this.initiatedNotInQueuePpUnsub) this.initiatedNotInQueuePpUnsub();

    this.initiatedNotInQueuePpUnsub = onSnapshot(
      query(
        collection(this.firestore, 'participantsproduct'),
        where('status', '==', 'initiated')
      ),
      (snap) => {
        this.initiatedNotInQueueDocs = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        this.buildInitiatedNotInQueueRecords();
      }
    );

    const queueRef = doc(this.firestore, 'queue generation', queueId);
      onSnapshot(
        query(
          collection(this.firestore, 'arena events'),
          where('eventref', '==', queueRef),
          where('delete', '==', false)
        ),
        (snap) => {
          this.arenaEventMap.clear();

          snap.docs.forEach(d => {
            const data = d.data();
            const productRef = data['productref'];
            const arenaEventId = data['docid'];

            if (productRef?.id && arenaEventId) {
              const key = `${productRef.id}`;
              this.arenaEventMap.set(key, arenaEventId);
            }
          });
        }
      );

    // Stop previous listeners
    if (this.tokenUnsub) this.tokenUnsub();
    if (this.ppUnsub) this.ppUnsub();

    try {
      const queueRef = doc(this.firestore, 'queue generation', queueId);
        // ATC ALPHA (VALID)
        if (this.atcAlphaUnsub) this.atcAlphaUnsub();
        this.atcAlphaUnsub = onSnapshot(
          query(
            collection(this.firestore, 'atc_alpha'),
            where('isdelete', '==', false)
          ),
          (snap) => {
            this.atcAlphaRecords = snap.docs.map(d => ({
              source: 'atc_alpha',
              profileid: d.data()['profileid'],
              queueid: d.data()['queueid'] ?? null,
              prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null
            }));

            this.mergeAtcsAndRebuild();
          }
        );

        // ---- ATC TO VALIDATE (LIVE) ----
        if (this.atcValidateUnsub) this.atcValidateUnsub();

        this.atcValidateUnsub = onSnapshot(
          query(
            collection(this.firestore, 'atc_to_validate'),
            where('isdelete', '==', false)
          ),
          (snap) => {
            this.atcValidateRecords = snap.docs.map(d => ({
              source: 'atc_to_validate',
              profileid: d.data()['profileid'],
              queueid: d.data()['queueid'] ?? null,
              prescriptionDate: d.data()['prescription_date']?.toDate?.() ?? null
            }));
            this.mergeAtcsAndRebuild();
          }
        );

      //  LIVE TOKEN LISTENER
      this.tokenUnsub = onSnapshot(
        query(
          collection(this.firestore, 'queue_token'),
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
          collection(this.firestore, 'participantsproduct'),
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
        collection(this.firestore, 'event participation request'),
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
        record.tokenStage,
        record.integrationMode,
        record.eventParticipationStatus,
        // record.tokenStatus
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
    const batch = writeBatch(this.firestore);
    for (const record of selectedRecords) {
      if (
        record.tokenDocId &&
        String(record.tokenStatus).toLowerCase() !== 'inactive'
      ) {
        const tokenRef = doc(
          this.firestore,
          'queue_token',
          record.tokenDocId
        );
        batch.update(tokenRef, {
          tokenstatus: 'inactive'
        });
      }
      if (record.participantproductid) {
        const ppRef = doc(
          this.firestore,
          'participantsproduct',
          record.participantproductid
        );
        if (String(record.productStatus).toLowerCase() !== 'cancelled') {
          batch.update(ppRef, {
            status: 'cancelled',
            "statusdate.cancelled": serverTimestamp()
          });
        } else {
          batch.update(ppRef, {
            status: 'cancelled'
          });
        }
      }
      if (
        record.eventParticipationId &&
        String(record.eventParticipationStatus).toLowerCase() !== 'unattended'
      ) {
        const epRef = doc(
          this.firestore,
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

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    this.paginatedRecords.forEach(r => r.selected = checked);
  }

  /* ================= KPI CLICK ================= */

  onKpiClick(
    type: 'completed' | 'initiated' | 'active' | 'inactive' | 'shifted' | 'ongoing' | 'cancelled' | 'valid' | 'invalid' | 'invalid_reason' | 'invalid_product' | 'invalid_event_status' | 'initiated_not_in_queue'
  ) {
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
