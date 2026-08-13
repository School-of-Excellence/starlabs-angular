import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { collection, query, where, onSnapshot, updateDoc,doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { startWith, map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import * as XLSX from 'xlsx';

/* Angular Material */
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Firestore } from '@angular/fire/firestore';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-live-event-health',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    ProfilePictureComponent
  ],
  templateUrl: './live-event-health.component.html',
  styleUrl: './live-event-health.component.css'
})
export class LiveEventHealthComponent {

  /* ---------------- EVENT STATE ---------------- */

  events: any[] = [];
  selectedEvent: any;
  eventControl = new FormControl();
  selectedRows: any[] = [];
  filteredEvents: any[] = [];

  /* ---------------- TABLE DATA ---------------- */

  participationRequests: any[] = [];
  participantsProducts: any[] = [];
  participantMetadataMap: Record<string, any> = {};
  productsMap: Record<string, any> = {};
  private unsubMetadata?: () => void;
  private unsubProductMaster?: () => void;
  fullTableData: any[] = [];
  filteredData: any[] = [];
  tableData: any[] = [];
  objectKeys = Object.keys;


  displayedColumns = [
    'select',
    'name',
    'event',
    'product',
    'eventRequestStatus',
    'participantProductStatus',
    'mode',
    'createdDate',
    'validation'
  ];

  /* ---------------- FILTER OPTIONS ---------------- */

  eventStatusOptions: string[] = [];
  productStatusOptions: string[] = [];
  modeOptions: string[] = [];
  productOptions: string[] = [];

  productOptionCounts: { value: string; count: number }[] = [];
  eventStatusOptionCounts: { value: string; count: number }[] = [];
  productStatusOptionCounts: { value: string; count: number }[] = [];
  modeOptionCounts: { value: string; count: number }[] = [];

  validationOptions = [
    { label: 'Valid', value: 'valid' },
    { label: 'Invalid', value: 'invalid' }
  ];

  /* ---------------- FILTER CONTROLS (MULTI) ---------------- */

  eventStatusFilter = new FormControl<string[]>([]);
  productStatusFilter = new FormControl<string[]>([]);
  modeFilter = new FormControl<string[]>([]);
  validationFilter = new FormControl<string[]>([]);
  productFilter = new FormControl<string[]>([]);
  searchControl = new FormControl('');

  /* ---------------- KPI STATE ---------------- */

  kpiTotal = 0;
  kpiValid = 0;
  kpiInvalid = 0;
  isLoading = false;

  eventStatusKpis: { status: string; count: number }[] = [];
  productStatusKpis: { status: string; count: number }[] = [];

  /* active KPI filter */
  activeKpi:
    | { type: 'valid' | 'invalid' }
    | { type: 'eventStatus'; value: string }
    | { type: 'productStatus'; value: string }
    | null = null;


  /* ---------------- KPI CLICK FILTER STATE ---------------- */

  kpiFilter = {
    type: null as
      | 'total'
      | 'valid'
      | 'invalid'
      | 'eventStatus'
      | 'productStatus'
      | null,
    value: null as string | null
  };

  displayEvent(event: any): string {
    return event?.name ?? '';
  }

  canCancel(row: any): boolean {
    const eventStatus = (row.eventRequestStatus || '').toLowerCase();
    const productStatus = (row.participantProductStatus || '').toLowerCase();

    return !(eventStatus === 'unattended' && productStatus === 'cancelled');
  }

  isSelected(row: any): boolean {
    return this.selectedRows.includes(row);
  }

  toggleRow(row: any, event: any) {
    if (event.target.checked) {
      this.selectedRows.push(row);
    } else {
      this.selectedRows = this.selectedRows.filter(r => r !== row);
    }
  }

  toggleSelectAll(event: any) {
    if (event.target.checked) {
      this.selectedRows = [...this.tableData];
    } else {
      this.selectedRows = [];
    }
  }

  async cancelProduct(row: any) {

  try {
    const batch = writeBatch(this.firestore);

    this.addCancelToBatch(batch, row);

    await batch.commit();

  } catch (error) {
    console.error('Cancel failed:', error);
  }
}

  async cancelSelected() {

    if (!this.selectedRows.length) return;

    const ok = confirm(`Cancel ${this.selectedRows.length} participants?`);
    if (!ok) return;

    try {

      const batch = writeBatch(this.firestore);

      for (const row of this.selectedRows) {
        this.addCancelToBatch(batch, row);
      }

      await batch.commit();

      this.selectedRows = [];

    } catch (error) {
      console.error('Batch cancel failed:', error);
    }
  }

  private addCancelToBatch(batch: any, row: any) {

    const eventStatus = (row.eventRequestStatus || '').toLowerCase();
    const productStatus = (row.participantProductStatus || '').toLowerCase();

    // Cancel product if needed
    if (productStatus !== 'cancelled' && row.participantProductId) {

      const productRef = doc(
        this.firestore,
        'participantsproduct',
        row.participantProductId
      );

      batch.update(productRef, {
        status: 'cancelled',
        mode: null,
        "statusdate.cancelled": serverTimestamp()
      });
    }

    // Mark event unattended if needed
    if (eventStatus !== 'unattended' && row.participationRequestId) {

      const participationRef = doc(
        this.firestore,
        'event participation request',
        row.participationRequestId
      );

      batch.update(participationRef, {
        status: 'unattended'
      });
    }
  }

  /* ---------------- PAGINATION ---------------- */

  pageSize = 10;
  pageIndex = 0;
  totalRows = 0;

  /* ---------------- SUBSCRIPTIONS ---------------- */

  private unsubParticipation?: () => void;
  private unsubProducts?: () => void;

  constructor(
    public firestore: Firestore
  ) {
    this.loadEvents();
    this.setupFilterListeners();
    this.loadParticipantMetadata();
    this.loadProductsMaster();
  }

  /* ---------------- Filters ---------------- */
  filteredProductStatusOptions: Observable<string[]> = this.productStatusFilter.valueChanges.pipe(
    startWith([]),
    map(() => this.productStatusOptions)
  );

  filteredEventStatusOptions: Observable<string[]> = this.eventStatusFilter.valueChanges.pipe(
    startWith([]),
    map(() => this.eventStatusOptions)
  );

  filteredModeOptions: Observable<string[]> = this.modeFilter.valueChanges.pipe(
    startWith([]),
    map(() => this.modeOptions)
  );

  filteredproduct: Observable<string[]> = this.validationFilter.valueChanges.pipe(
    startWith([]),
    map(() => this.validationOptions.map(v => v.value))
  );

  /* ---------------- FILTER LISTENERS ---------------- */

  setupFilterListeners() {
    this.eventStatusFilter.valueChanges.subscribe(() => this.applyFilters());
    this.productStatusFilter.valueChanges.subscribe(() => this.applyFilters());
    this.modeFilter.valueChanges.subscribe(() => this.applyFilters());
    this.validationFilter.valueChanges.subscribe(() => this.applyFilters());
    this.searchControl.valueChanges.subscribe(() => this.applyFilters());
    this.productFilter.valueChanges.subscribe(() => this.applyFilters());
  }

  /* ---------------- LOAD EVENTS ---------------- */

  loadEvents() {
    onSnapshot(collection(this.firestore, 'event collection'), snap => {
      this.events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.filteredEvents = this.events; // initialize
    });

    // React to typing in the input
    this.eventControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const search = typeof value === 'string' ? value : (value?.name ?? '');
        return search
          ? this.events.filter(e =>
              e.name.toLowerCase().includes(search.toLowerCase())
            )
          : this.events.slice();
      })
    ).subscribe(filtered => {
      this.filteredEvents = filtered;
    });
  }

  /* ---------------- EVENT SELECT ---------------- */

  selectEvent(event: any) {
    this.selectedEvent = event;
    this.pageIndex = 0;
    this.isLoading = true;

    this.unsubParticipation?.();
    this.unsubProducts?.();

    this.eventStatusFilter.setValue([]);
    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);

    const eventRef = doc(this.firestore, 'event collection', event.id);

    const q = query(
      collection(this.firestore, 'event participation request'),
      where('eventref', '==', eventRef)
    );

    this.unsubParticipation = onSnapshot(q, snap => {
      this.participationRequests = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      this.listenParticipantsProduct();
    });
  }

    onKpiClick(type: 'total' | 'valid' | 'invalid'| 'eventStatus' | 'productStatus', value?: string) {
    this.kpiFilter.type = type;
    this.kpiFilter.value = value ?? null;

  // Clear dropdown filters to avoid conflict
    this.eventStatusFilter.setValue([]);
    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);

    this.applyFilters();
  }

  loadParticipantMetadata() {
    this.unsubMetadata?.();

    this.unsubMetadata = onSnapshot(
      collection(this.firestore, 'participant metadata'),
      snap => {
        snap.docs.forEach(d => {
          const data = d.data();
          this.participantMetadataMap[d.id] = data;
        });
      }
    );
  }

  loadProductsMaster() {
    this.unsubProductMaster?.();

    this.unsubProductMaster = onSnapshot(
      collection(this.firestore, 'products'),
      snap => {
        snap.docs.forEach(d => {
          this.productsMap[d.id] = d.data();
        });
      }
    );
  }


  /* ---------------- PARTICIPANTS PRODUCT ---------------- */

 listenParticipantsProduct() {
  this.participantsProducts = [];
  this.unsubProducts?.();

  if (!this.participationRequests.length) {
    this.fullTableData = [];
    this.applyFilters();
    return;
  }

  const eventReqIds = this.participationRequests.map(r => r.id);
  const directProductIds = this.participationRequests
    .map(r => r.participantproductid)
    .filter(Boolean);

  const unsubs: (() => void)[] = [];

  // 🔹 Helper: Split array into chunks of 30
  const chunkArray = (arr: string[], size: number) => {
    const chunks: string[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  /* ---------------- QUERY 1 ---------------- */
  const eventReqChunks = chunkArray(eventReqIds, 30);

  eventReqChunks.forEach(chunk => {
    const q = query(
      collection(this.firestore, 'participantsproduct'),
      where('eventparticipationid', 'in', chunk)
    );

    unsubs.push(
      onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          this.upsertProduct({ id: d.id, ...d.data() });
        });
        this.mergeTableData();
      })
    );
  });

  /* ---------------- QUERY 2 ---------------- */
  const directChunks = chunkArray(directProductIds, 30);

  directChunks.forEach(chunk => {
    const q = query(
      collection(this.firestore, 'participantsproduct'),
      where('docid', 'in', chunk)
    );

    unsubs.push(
      onSnapshot(q, snap => {
        snap.docs.forEach(d => {
          this.upsertProduct({ id: d.id, ...d.data() });
        });
        this.mergeTableData();
      })
    );
  });

  this.unsubProducts = () => unsubs.forEach(u => u());
}

private upsertProduct(product: any) {
  const index = this.participantsProducts.findIndex(p => p.id === product.id);
  if (index === -1) {
    this.participantsProducts.push(product);
  } else {
    this.participantsProducts[index] = product;
  }
}


  /* ---------------- MERGE + VALIDATION ---------------- */

  mergeTableData() {
  this.fullTableData = this.participationRequests.map(req => {

    /* ---------- EXISTING PRIORITY ---------- */
    let product = this.participantsProducts.find(
      p => p.eventparticipationid === req.id
    );

    /* ---------- ADD-ON FALLBACK ---------- */
    if (!product && req.participantproductid) {
      product = this.participantsProducts.find(
        p => p.id === req.participantproductid
      );
    }

    const eventStatus = (req.status ?? '').toLowerCase();
    const productStatus = (product?.status ?? '').toLowerCase();
    const mode = product?.mode ?? null;
    const hasProductId = req.participantproductid ? true : false;
    let isValid = false;

    // CASE 1 : REQUESTED / DENIED
    if (['requested', 'denied'].includes(eventStatus)) {
      isValid = !hasProductId;
    }

    // CASE 2 : APPROVED
    else if (eventStatus === 'approved') {
      isValid = ['initiated', 'ongoing'].includes(productStatus);
    }

    // CASE 3 : ATTENDED
    else if (eventStatus === 'attended') {
      isValid = productStatus === 'completed';
    }

    // CASE 4 : UNATTENDED
    else if (eventStatus === 'unattended') {
      isValid = productStatus === 'cancelled' || !hasProductId;
    }

    // CASE 5 : REVOKED
    else if (eventStatus === 'revoked') {
      isValid = productStatus === 'cancelled' || !hasProductId;
    }

    const profileId = req.profileid;
    const productId = product?.productref?.id || req?.productref?.id || null;
    const participantMeta = this.participantMetadataMap[profileId];
    const productMaster = productId ? this.productsMap[productId] : null;

    return {
      participationRequestId: req.id,
      profileid: profileId,
      name: participantMeta?.name ?? profileId ?? 'N/A',
      event: this.selectedEvent?.name ?? 'N/A',
      product: productMaster?.product ?? productId ?? 'N/A',
      eventRequestStatus: req.status ?? 'N/A',
      participantProductStatus: product?.status ?? 'N/A',
      participantProductId: product?.id,
      mode: mode ?? 'N/A',
      createdDate: req.doccreateddate?.toDate?.() ?? null,
      isValid
    };
  });

  this.fullTableData.sort(
    (a, b) =>
      new Date(b.createdDate).getTime() -
      new Date(a.createdDate).getTime()
  );

  this.buildFilterOptions();
  this.applyFilters();
  this.isLoading = false;
}


  /* ---------------- FILTER OPTIONS ---------------- */

  buildFilterOptions() {
    const uniq = <T>(arr: T[]) => Array.from(new Set(arr)).filter(Boolean);

    this.eventStatusOptions = uniq(this.fullTableData.map(r => r.eventRequestStatus));
    this.productStatusOptions = uniq(this.fullTableData.map(r => r.participantProductStatus));
    this.modeOptions = uniq(this.fullTableData.map(r => r.mode));
    this.productOptions = uniq(this.fullTableData.map(r => r.product));

    const countBy = (field: string, options: string[]) =>
      options.map(opt => ({
        value: opt,
        count: this.fullTableData.filter(r => r[field] === opt).length
      }));

    this.productOptionCounts = countBy('product', this.productOptions);
    this.eventStatusOptionCounts = countBy('eventRequestStatus', this.eventStatusOptions);
    this.productStatusOptionCounts = countBy('participantProductStatus', this.productStatusOptions);
    this.modeOptionCounts = countBy('mode', this.modeOptions);
  }

  /* ---------------- APPLY FILTERS ---------------- */

  applyFilters() {
    let data = [...this.fullTableData];

    /* -------- KPI FILTER FIRST -------- */

    if (this.kpiFilter.type === 'valid') {
      data = data.filter(r => r.isValid);
    }

    if (this.kpiFilter.type === 'invalid') {
      data = data.filter(r => !r.isValid);
    }

    if (this.kpiFilter.type === 'eventStatus' && this.kpiFilter.value) {
      data = data.filter(
        r => r.eventRequestStatus === this.kpiFilter.value
      );
    }

    if (this.kpiFilter.type === 'productStatus' && this.kpiFilter.value) {
      data = data.filter(
        r => r.participantProductStatus === this.kpiFilter.value
      );
    }

    /* -------- SEARCH FILTER -------- */

    const searchTerm = this.searchControl.value?.toLowerCase() || '';
    if (searchTerm) {
      data = data.filter(r =>
        r.name.toLowerCase().includes(searchTerm) ||
        r.event.toLowerCase().includes(searchTerm) ||
        r.product.toLowerCase().includes(searchTerm) ||
        r.eventRequestStatus.toLowerCase().includes(searchTerm) ||
        r.participantProductStatus.toLowerCase().includes(searchTerm) ||
        r.mode.toLowerCase().includes(searchTerm)
      );
    }

    /* -------- DROPDOWN FILTERS -------- */

    const eventStatuses = this.eventStatusFilter.value || [];
    const productStatuses = this.productStatusFilter.value || [];
    const modes = this.modeFilter.value || [];
    const validations = this.validationFilter.value || [];
    const products = this.productFilter.value || [];

    if (eventStatuses.length) {
      data = data.filter(r =>
        eventStatuses.includes(r.eventRequestStatus)
      );
    }

    if (productStatuses.length) {
      data = data.filter(r =>
        productStatuses.includes(r.participantProductStatus)
      );
    }

    if (modes.length) {
      data = data.filter(r =>
        modes.includes(r.mode)
      );
    }

    if (validations.length) {
      data = data.filter(r =>
        validations.includes(r.isValid ? 'valid' : 'invalid')
      );
    }

    if (products.length) {
      data = data.filter(r =>
        products.includes(r.product)
      );
    }

    this.filteredData = data;
    this.totalRows = data.length;
    this.pageIndex = 0;

    this.calculateKpis(this.fullTableData);
    this.applyPagination();
  }


  /* ---------------- KPI ---------------- */

  calculateKpis(data: any[]) {
    this.kpiTotal = data.length;
    this.kpiValid = 0;
    this.kpiInvalid = 0;

    const eventStatusMap: Record<string, number> = {};
    const productStatusMap: Record<string, number> = {};

    data.forEach(row => {
      // Valid / Invalid
      row.isValid ? this.kpiValid++ : this.kpiInvalid++;

      // Event Status
      if (row.eventRequestStatus) {
        eventStatusMap[row.eventRequestStatus] =
          (eventStatusMap[row.eventRequestStatus] || 0) + 1;
      }

      // Product Status
      if (row.participantProductStatus) {
        productStatusMap[row.participantProductStatus] =
          (productStatusMap[row.participantProductStatus] || 0) + 1;
      }
    });

    // Convert maps → KPI cards
    this.eventStatusKpis = Object.keys(eventStatusMap).map(k => ({
      status: k,
      count: eventStatusMap[k]
    }));

    this.productStatusKpis = Object.keys(productStatusMap).map(k => ({
      status: k,
      count: productStatusMap[k]
    }));
  }


  /* ---------------- PAGINATION ---------------- */

  applyPagination() {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.tableData = this.filteredData.slice(start, end);
  }

  exportToExcel() {
    const exportData = this.filteredData.map(row => ({
      Name: row.name,
      Event: row.event,
      Product: row.product,
      'Event Status': row.eventRequestStatus,
      'Participant Status': row.participantProductStatus,
      Mode: row.mode,
      'Created Date': row.createdDate ? row.createdDate.toISOString() : '',
      Validation: row.isValid ? 'Valid' : 'Invalid'
    }));
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(exportData);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Live Event Health');
    XLSX.writeFile(wb, `Live_Event_Health_${this.selectedEvent?.name ?? 'export'}.xlsx`);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.applyPagination();
  }

  onValidKpiClick(isValid: boolean) {
    this.kpiFilter.type = isValid ? 'valid' : 'invalid';
    this.kpiFilter.value = null;

    this.eventStatusFilter.setValue([]);
    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);

    this.validationFilter.setValue([isValid ? 'valid' : 'invalid']);
    this.applyFilters();
  }

  onEventStatusKpiClick(status: string) {
    this.kpiFilter.type = 'eventStatus';
    this.kpiFilter.value = status;

    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);

    this.eventStatusFilter.setValue([status]);
    this.applyFilters();
  }

  onProductStatusKpiClick(status: string) {
    this.kpiFilter.type = 'productStatus';
    this.kpiFilter.value = status;

    this.eventStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);

    this.productStatusFilter.setValue([status]);
    this.applyFilters();
  }

  onTotalKpiClick() {
    this.kpiFilter.type = 'total';
    this.kpiFilter.value = null;
    this.eventStatusFilter.setValue([]);
    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);

    this.applyFilters();
  }


  resetDropdownFilters() {
    this.eventStatusFilter.setValue([]);
    this.productStatusFilter.setValue([]);
    this.modeFilter.setValue([]);
    this.validationFilter.setValue([]);
    this.productFilter.setValue([]);
  }


  /* ---------------- CLEANUP ---------------- */

  ngOnDestroy() {
    this.unsubParticipation?.();
    this.unsubProducts?.();
  }
}
