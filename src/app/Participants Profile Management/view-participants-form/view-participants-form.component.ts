import { Component, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { LoadingProgressComponent } from '../../loading-progress/loading-progress.component';
import { collection, collectionData, doc, Firestore, getDocs, getDoc, orderBy, query, where, updateDoc, arrayUnion, serverTimestamp, Timestamp, getFirestore } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SelectionModel } from '@angular/cdk/collections';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { FormOverlayViewComponent } from '../form-overlay-view/form-overlay-view.component';

@Component({
  selector: 'app-view-participants-form',
  imports: [
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    FormsModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    NgxMatSelectSearchModule,
    FormOverlayViewComponent
  ],
  providers: [
    provideNativeDateAdapter()
  ],
  templateUrl: './view-participants-form.component.html',
  styleUrl: './view-participants-form.component.css'
})
export class ViewParticipantsFormComponent {

  // ==========================================
  // TABLE — replaced 'view' and 'download' with 'actions'
  // ==========================================
  displayedColumns = ['select', 'profileid', 'queueref', 'workshopref', 'formname', 'submittedin', 'date', 'notes', 'like', 'flag', 'opportunity', 'actions'];
  dataSource = new MatTableDataSource();
  selection = new SelectionModel<any>(true, []);

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;
  @ViewChild('formOverlay') formOverlay: FormOverlayViewComponent;

  mapProfile: any = {};
  mapProfileNew: any = {};
  mapQueue: any = {};
  participantForm: any[] = [];
  queuelist: any[] = [];
  selectedQueue: any = [];
  selectedForm: any = [];
  formnamelist: any[] = [];
  participantList: any[] = [];
  filterForm: FormGroup;
  workshopList: any[] = [];
  workshopListNew: any[] = [];
  mapWorkshop: any = {};
  mapWorkshopNew: any = {};
  startDate: Date = null;
  endDate: Date = null;

  // Search filter controls
  queueFilterCtrl = new FormControl<string>('');
  workshopFilterCtrl = new FormControl<string>('');
  formFilterCtrl = new FormControl<string>('');
  participantFilterCtrl = new FormControl<string>('');

  // Filtered lists
  filteredQueueList: any[] = [];
  filteredCombinedWorkshopList: any[] = [];
  filteredFormList: any[] = [];
  filteredParticipantList: any[] = [];
  private combinedWorkshopList: any[] = [];
  importedMatchedProfileIds: string[] = [];

  // ==========================================
  // OVERLAY — NEW
  // ==========================================
  showOverlay = false;
  overlayMode: 'individual' | 'merged' = 'individual';
  overlayTitle = '';
  overlayLoading = false;
  overlayFormData: any = null;
  overlayMergedForms: any[] = [];
  currentOverlayRow: any = null;

  // Notes overlay
  showNotesOverlay = false;
  notesRecord: any = null;
  notesText = '';
  notesParticipantName = '';

  // Logged-in user
  loggedInProfileId: string = '';

  // My Forms (stores form template names)
  myForms: { formname: string }[] = [];
  selectedMyForms: string[] = [];
  showMyFormsOnly = false;

  importedEmails: string[] = [];
  showImportedEmailsFilter = false;
  profileEmailMap: any = {};

  //Email import results tracking
  matchedEmailsCount: number = 0;
  unmatchedEmailsCount: number = 0;
  showImportSummaryModal = false;
  importSummaryMode: 'matched' | 'notfound' = 'matched';
  matchedParticipantNames: string[] = [];
  notFoundEmails: string[] = [];

  //Like and Flag Filter
  filterLiked = false;
  filterFlagged = false;

  get loadingScreen() {
    return this.dialog.open(LoadingProgressComponent, {
      data: {
        msg: "Processing Please Wait ...."
      },
      disableClose: true
    });
  }

  private destroy$ = new Subject<void>();
  firestoreDefault = getFirestore()
  firestoreForms = getFirestore('firestore-forms')

  constructor(
    private authguard: AuthguardService,
    private router: Router,
    private fb: FormBuilder,
    public dialog: MatDialog
  ) {
    let loadingRef = this.loadingScreen;
    let queryRunTimes = 0;
    this.endDate = new Date(new Date().setHours(23, 59, 59, 0));
    this.startDate = new Date();
    this.startDate.setDate(this.startDate.getDate() - 30);
    this.startDate = new Date(new Date(this.startDate.getFullYear(), this.startDate.getMonth(), this.startDate.getDate()).setHours(0, 0, 0, 0));

    this.authguard.getProfileMap().then(async profile => {
      console.log("profile", profile);
      this.mapProfile = profile.map;

      if (profile.email) {
        Object.entries(profile.email).forEach(([docid, email]) => {
          if (docid && email && typeof email === 'string') {
            this.profileEmailMap[docid] = email.toLowerCase();
          }
        });
      }
      this.buildParticipantList();
      queryRunTimes = queryRunTimes + 1;
      if (queryRunTimes >= 4) loadingRef.close();
    });

    // Get logged-in user's profile ID
    this.authguard.getRoles().then((roles: any) => {
      this.loggedInProfileId = roles?.['profile_ref']?.id ?? '';
    });

    this.authguard.getProfileMapNewUser().then(async profilenew => {
      this.mapProfileNew = profilenew.map;

      if (profilenew.email) {
        Object.entries(profilenew.email).forEach(([docid, email]) => {
          if (docid && email && typeof email === 'string') {
            this.profileEmailMap[docid] = email.toLowerCase();
          }
        });
      }
      this.buildParticipantList();
      queryRunTimes = queryRunTimes + 1;
      if (queryRunTimes >= 4) loadingRef.close();
    });

    const queueGenerationCollRef = collection(this.firestoreDefault, "queue generation");
    const queueGenerationQuery = query(queueGenerationCollRef, orderBy("queueenddate", "desc"));
    collectionData(queueGenerationQuery).pipe(takeUntil(this.destroy$)).subscribe(async queuesnap => {
      this.queuelist = queuesnap;
      for (let i = 0; i < queuesnap.length; i++) {
        const element = queuesnap[i];
        this.mapQueue[element['docid']] = element['queuename'];
      }
      this.queuelist.sort((a, b) => (a['queuename'] || '').localeCompare(b['queuename'] || ''));
      this.filteredQueueList = [...this.queuelist];
    });

    const deliveryFormsCollRef = collection(this.firestoreDefault, "delivery forms");
    getDocs(deliveryFormsCollRef).then(snap => {
      this.formnamelist = snap.docs.map(e => e.data());
      this.formnamelist.sort((a, b) => (a['formname'] || '').localeCompare(b['formname'] || ''));
      this.filteredFormList = [...this.formnamelist];
      queryRunTimes = queryRunTimes + 1;
      if (queryRunTimes >= 4) loadingRef.close();
    });

    const eiflixWorkshopCollRef = collection(this.firestoreDefault, "eiflix workshop");
    getDocs(eiflixWorkshopCollRef).then(snap => {
      this.workshopList = snap.docs.map(e => e.data());
      for (let i = 0; i < this.workshopList.length; i++) {
        const element = this.workshopList[i];
        this.mapWorkshop[element['docid']] = element['title'];
      }
      this.buildCombinedWorkshopList();
      queryRunTimes = queryRunTimes + 1;
      if (queryRunTimes >= 4) loadingRef.close();
    });

    const eiflixWorkshopnewCollRef = collection(this.firestoreDefault, "workshopconfiguration");
    getDocs(eiflixWorkshopnewCollRef).then(snap => {
      this.workshopListNew = snap.docs.map(e => e.data());
      for (let i = 0; i < this.workshopListNew.length; i++) {
        const element = this.workshopListNew[i];
        this.mapWorkshopNew[element['docid']] = element['detailpage']?.['title'] ?? '';
      }
      this.buildCombinedWorkshopList();
      queryRunTimes = queryRunTimes + 1;
      if (queryRunTimes >= 4) loadingRef.close();
    });

    this.fetchData();
  }

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      name: [[],],
      queue: [[],],
      formname: [[],],
      workshop: [[],]
    });
    this.dataSource.filterPredicate = this.customfilter();

    // Load My Forms from localStorage
    this.loadMyForms();

    this.queueFilterCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.filterQueues());
    this.workshopFilterCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.filterWorkshops());
    this.formFilterCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.filterForms());
    this.participantFilterCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.filterParticipants());

  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================================
  // COMBINED WORKSHOP LIST
  // ==========================================
  private buildCombinedWorkshopList() {
    const oldWorkshops = (this.workshopList || []).map(w => ({ docid: w.docid, displayTitle: w.title || '' }));
    const newWorkshops = (this.workshopListNew || []).map(w => ({ docid: w.docid, displayTitle: w.detailpage?.title || '' }));
    this.combinedWorkshopList = [...oldWorkshops, ...newWorkshops]
      .filter(w => w.displayTitle)
      .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
    this.filteredCombinedWorkshopList = [...this.combinedWorkshopList];
  }

  private buildParticipantList() {
    const allParticipants = new Map<string, string>();

    // Add ALL profiles from both maps regardless of date range
    Object.keys(this.mapProfile).forEach(docid => {
      if (this.mapProfile[docid]) {
        allParticipants.set(docid, this.mapProfile[docid]);
      }
    });

    Object.keys(this.mapProfileNew).forEach(docid => {
      if (this.mapProfileNew[docid] && !allParticipants.has(docid)) {
        allParticipants.set(docid, this.mapProfileNew[docid]);
      }
    });

    // Track who has forms in current date range
    const activeProfileIds = new Set<string>();
    this.participantForm.forEach(form => {
      if (form.profileid) activeProfileIds.add(form.profileid);
    });

    this.participantList = Array.from(allParticipants.entries()).map(([docid, name]) => ({
      profileId: docid,
      name: name,
      hasFormsInRange: activeProfileIds.has(docid)
    })).sort((a, b) => a.name.localeCompare(b.name));

    this.filteredParticipantList = [...this.participantList];
  }

  // ==========================================
  // DROPDOWN SEARCH FILTERS
  // ==========================================
  private filterQueues() {
    const search = (this.queueFilterCtrl.value || '').toLowerCase().trim();
    this.filteredQueueList = !search ? [...this.queuelist] : this.queuelist.filter(q => (q['queuename'] || '').toLowerCase().includes(search));
  }

  private filterWorkshops() {
    const search = (this.workshopFilterCtrl.value || '').toLowerCase().trim();
    this.filteredCombinedWorkshopList = !search ? [...this.combinedWorkshopList] : this.combinedWorkshopList.filter(w => w.displayTitle.toLowerCase().includes(search));
  }

  private filterForms() {
    const search = (this.formFilterCtrl.value || '').toLowerCase().trim();
    this.filteredFormList = !search ? [...this.formnamelist] : this.formnamelist.filter(f => (f['formname'] || '').toLowerCase().includes(search));
  }

  private filterParticipants() {
    const search = (this.participantFilterCtrl.value || '').toLowerCase().trim();
    this.filteredParticipantList = !search ? [...this.participantList] : this.participantList.filter(p => p.name.toLowerCase().includes(search));
  }

  // ==========================================
  // FETCH DATA
  // ==========================================
  fetchData() {
    let loadingRef = this.loadingScreen;
    this.endDate = new Date(new Date(this.endDate).setHours(23, 59, 59, 0));
    this.startDate = new Date(new Date(this.startDate).setHours(0, 0, 0, 0));
    const formsByClientCollRef = collection(this.firestoreForms, "formsByClient");
    const formsByClientQuery = query(formsByClientCollRef, where('date', '>', this.startDate), where('date', '<', this.endDate), orderBy('date', 'desc'));
    collectionData(formsByClientQuery).pipe(takeUntil(this.destroy$)).subscribe(async formsnap => {
      this.participantForm = formsnap;
      this.buildParticipantList();
      this.ngAfterViewInit(this.participantForm);
      this.selection.clear();
      loadingRef.close();
    });
  }

  ngAfterViewInit(data: any[]) {
    this.dataSource.data = data || [];
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  // ==========================================
  // TABLE FILTER
  // ==========================================
  onFilter(value: any) {
    this.dataSource.filter = JSON.stringify(value);
  }

  public customfilter(): (data: any, filter: string) => boolean {
    let filterFunction = (data: any, filter: string): boolean => {
      let e = data;
      let value = JSON.parse(filter);

      // My Forms filter
      if (this.showMyFormsOnly && this.selectedMyForms.length > 0) {
        if (!this.selectedMyForms.includes(e['formname'])) return false;
      }

      // Imported emails filter — runs independently, not through participant dropdown
      if (this.showImportedEmailsFilter && this.importedMatchedProfileIds.length > 0) {
        if (!this.importedMatchedProfileIds.includes(e['profileid'])) return false;
      }

      // Like filter
      if (this.filterLiked && !e['liked']) return false;

      // Flag filter
      if (this.filterFlagged && !e['tagged']) return false;

      return (
        (value.name.length != 0 ? value.name.includes(e['profileid']) : true)
      ) &&
        (value.queue.length != 0 ? (![null, undefined].includes(e['queueref']) ? value.queue.includes(e['queueref'].id) : false) : true) &&
        (value.workshop.length != 0 ? (![null, undefined].includes(e['workshopref']) ? value.workshop.includes(e['workshopref'].id) : false) : true) &&
        (value.formname.length != 0 ? value.formname.includes(e['formname']) : true);
    };
    return filterFunction;
  }

  // ==========================================
  // MY FORMS
  // ==========================================
  private loadMyForms() {
    try {
      const stored = localStorage.getItem('myForms');
      this.myForms = stored ? JSON.parse(stored) : [];
    } catch {
      this.myForms = [];
    }
  }

  private persistMyForms() {
    localStorage.setItem('myForms', JSON.stringify(this.myForms));
  }

  addSelectedFormsToMyForms() {
    const selectedFormNames: string[] = this.filterForm.get('formname')?.value || [];
    if (selectedFormNames.length === 0) return;

    const existingNames = this.myForms.map(f => f.formname);
    const newForms = selectedFormNames
      .filter(name => !existingNames.includes(name))
      .map(name => ({ formname: name }));

    if (newForms.length === 0) return;

    this.myForms = [...this.myForms, ...newForms].sort((a, b) => a.formname.localeCompare(b.formname));
    this.persistMyForms();
    this.filterForm.patchValue({ formname: [] });
    this.onFilter(this.filterForm.value);
  }

  removeFromMyForms(formname: string) {
    this.myForms = this.myForms.filter(f => f.formname !== formname);
    this.persistMyForms();
    this.selectedMyForms = this.selectedMyForms.filter(f => f !== formname);
    this.showMyFormsOnly = this.selectedMyForms.length > 0;
    this.onFilter(this.filterForm.value);
  }

  toggleMyFormChip(formname: string) {
    const idx = this.selectedMyForms.indexOf(formname);
    if (idx >= 0) {
      this.selectedMyForms.splice(idx, 1);
    } else {
      this.selectedMyForms.push(formname);
    }
    this.showMyFormsOnly = this.selectedMyForms.length > 0;
    this.onFilter(this.filterForm.value);
  }

  clearMyFormsSelection() {
    this.selectedMyForms = [];
    this.showMyFormsOnly = false;
    this.onFilter(this.filterForm.value);
  }

  // ADD THESE METHODS
  onImportEmails(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Read first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Find Email column index
        const headers = jsonData[0] as string[];
        const emailColumnIndex = headers.findIndex(h =>
          h && h.toString().toLowerCase().trim() === 'email'
        );

        if (emailColumnIndex === -1) {
          alert('No "Email" column found in the file. Please ensure your file has an "Email" column.');
          return;
        }

        // Extract emails (skip header row)
        const emails: string[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          const email = row[emailColumnIndex];
          if (email && email.toString().trim()) {
            emails.push(email.toString().toLowerCase().trim());
          }
        }

        if (emails.length === 0) {
          alert('No emails found in the file.');
          return;
        }

        this.importedEmails = emails;
        this.showImportedEmailsFilter = true;
        this.applyImportedEmailsFilter();

        alert(`Successfully imported ${emails.length} email(s).`);

        // Reset file input
        event.target.value = '';

      } catch (error) {
        console.error('Error reading file:', error);
        alert('Error reading file. Please ensure it is a valid Excel or CSV file.');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  applyImportedEmailsFilter() {
    const matchedProfileIds: string[] = [];
    const matchedNames: string[] = [];
    const notFoundEmails: string[] = [];
    let matchedEmailsCount = 0;
    let unmatchedEmailsCount = 0;

    this.importedEmails.forEach(email => {
      const profileIds = Object.keys(this.profileEmailMap).filter(profileId =>
        this.profileEmailMap[profileId] === email
      );

      if (profileIds.length > 0) {
        const hasFormsInRange = profileIds.some(id =>
          this.participantForm.some(form => form.profileid === id)
        );
        if (hasFormsInRange) {
          matchedEmailsCount++;
          profileIds.forEach(id => {
            const name = this.mapProfile[id] || this.mapProfileNew[id] || email;
            if (!matchedNames.includes(name)) matchedNames.push(name);
          });
        } else {
          unmatchedEmailsCount++;
          const name = this.mapProfile[profileIds[0]] || this.mapProfileNew[profileIds[0]] || email;
          notFoundEmails.push(`${name}`);
        }
        profileIds.forEach(id => matchedProfileIds.push(id));
      } else {
        unmatchedEmailsCount++;
        notFoundEmails.push(`${email} (not registered)`);
      }
    });

    this.matchedEmailsCount = matchedEmailsCount;
    this.unmatchedEmailsCount = unmatchedEmailsCount;
    this.matchedParticipantNames = matchedNames.sort();
    this.notFoundEmails = notFoundEmails;
    this.importedMatchedProfileIds = matchedProfileIds;

    if (matchedProfileIds.length === 0) {
      alert('No matching participants found for the imported emails.');
      this.clearImportedEmailsFilter();
      return;
    }

    this.showImportedEmailsFilter = true;
    this.onFilter(this.filterForm.value);
  }

  clearImportedEmailsFilter() {
    this.importedEmails = [];
    this.showImportedEmailsFilter = false;
    this.importedMatchedProfileIds = [];
    // Remove imported emails from participant selection
    // Keep only manually selected participants
    const currentSelected = this.filterForm.get('name')?.value || [];
    this.filterForm.patchValue({ name: currentSelected });
    this.onFilter(this.filterForm.value);
  }

  triggerFileInput() {
    const fileInput = document.getElementById('emailImportInput') as HTMLElement;
    fileInput?.click();
  }

  openImportSummaryModal(mode: 'matched' | 'notfound') {
    this.importSummaryMode = mode;
    this.showImportSummaryModal = true;
  }

  closeImportSummaryModal() {
    this.showImportSummaryModal = false;
  }

  // ==========================================
  // OPEN IN NEW TAB (existing logic)
  // ==========================================
  onFormPreview(form: any) {
    let path = doc(this.firestoreForms, "formsByClient", form['docid']).path;
    const url = this.router.createUrlTree(['/formtemplate'], { queryParams: { id: form.formid, type: 'form', patchdata: path, viewFilledForm: 'true' } });
    window.open(url.toString(), '_blank');
  }

  // ==========================================
  // VIEW MERGED — OVERLAY (NEW)
  // ==========================================
  async viewMergedOverlay() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length === 0) {
      alert('Please select at least one form.');
      return;
    }

    this.overlayMode = 'merged';
    this.overlayTitle = `Merged Forms (${selectedRows.length})`;
    this.overlayLoading = true;
    this.overlayMergedForms = [];
    this.showOverlay = true;

    try {
      const results = await Promise.all(
        selectedRows.map(async (row) => {
          const [formTemplateDoc, submittedFormDoc] = await Promise.all([
            getDoc(doc(this.firestoreDefault, 'delivery forms', row.formid)),
            getDoc(doc(this.firestoreForms, 'formsByClient', row.docid))
          ]);
          if (!formTemplateDoc.exists() || !submittedFormDoc.exists()) return null;
          return this.buildFormDisplayData(row, formTemplateDoc.data(), submittedFormDoc.data());
        })
      );
      this.overlayMergedForms = results.filter(Boolean);
    } catch (err) {
      console.error('Error loading merged forms:', err);
    }

    this.overlayLoading = false;
  }

  // ==========================================
  // SHARED: Build form display data for overlay
  // ==========================================
  private buildFormDisplayData(row: any, formTemplate: any, submittedFormData: any): any {
    const formValues: any = {};
    let controlIndex = 0;
    if (submittedFormData['formarray']) {
      for (const field of submittedFormData['formarray']) {
        if (['label', 'video', 'audio'].includes(field.type)) continue;
        formValues[`control${controlIndex}`] = field.value;
        controlIndex++;
      }
    }

    controlIndex = 0;
    let questionNumber = 0;
    const fields: any[] = [];

    for (const field of formTemplate['formarray']) {
      if (['video', 'audio'].includes(field.type)) continue;

      if (field.type === 'label') {
        fields.push({ type: 'label', fieldname: field.fieldname, fielddescription: field.fielddescription || null });
        continue;
      }

      const fieldValue = formValues[`control${controlIndex}`];
      controlIndex++;
      questionNumber++;

      fields.push({
        type: 'field',
        number: questionNumber,
        fieldname: field.fieldname,
        fielddescription: field.fielddescription || null,
        fieldnotes: field.fieldnotes || null,
        required: field.required || false,
        fieldType: field.type,
        value: this.formatFieldValueForOverlay(field, fieldValue),
        isEmpty: !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
      });
    }

    const participantName = this.mapProfile[row.profileid] || this.mapProfileNew[row.profileid] || 'Unknown';
    const queueName = row.queueref ? this.mapQueue[row.queueref.id] : 'N/A';
    const workshopName = row.workshopref ? (this.mapWorkshop[row.workshopref.id] || this.mapWorkshopNew[row.workshopref.id]) : 'N/A';
    const submittedDate = row.date ? new Date(row.date.toDate()).toLocaleDateString() : 'N/A';

    return {
      participantName,
      formTitle: formTemplate['formname'] || 'Form',
      formDescription: formTemplate['formdescription'] || null,
      queue: queueName,
      workshop: workshopName,
      date: submittedDate,
      fields
    };
  }

  // ==========================================
  // FORMAT FIELD VALUE FOR OVERLAY DISPLAY
  // ==========================================
  private formatFieldValueForOverlay(field: any, value: any): string {
    if (!value && value !== 0) return 'Not answered';

    switch (field.type) {
      case 'date':
        if (value?.toDate) return value.toDate().toLocaleDateString();
        try { return new Date(value).toLocaleDateString(); } catch { return String(value); }
      case 'Checkbox':
        return value ? 'Yes' : 'No';
      case 'MultiSelect':
      case 'multicheckbox':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'slider':
        let result = String(value);
        if (field.options?.length > 0) result += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`;
        return result;
      case 'array':
        if (Array.isArray(value) && value.length > 0) {
          return value.map((item: any, idx: number) => {
            if (typeof item === 'object' && item !== null) {
              if (field.array && Array.isArray(field.array)) {
                const parts = field.array.map((af: any) => {
                  const v = item[af.fieldname];
                  return v != null && v !== '' ? `${af.fieldname}: ${v}` : null;
                }).filter(Boolean);
                // Each sub-field on its own line
                return parts.join('\n');
              }
              const parts = Object.entries(item)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `${k}: ${v}`);
              return parts.join('\n');
            }
            return String(item);
          }).join('\n');
        }
        return 'No items';
      default:
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') {
          try {
            return Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', ');
          } catch { return JSON.stringify(value); }
        }
        return String(value);
    }
  }

  // ==========================================
  // LIKE
  // ==========================================
  toggleLike(row: any) {
    const newValue = !row.liked;
    row.liked = newValue;
    const docRef = doc(this.firestoreForms, 'formsByClient', row.docid);

    if (newValue) {
      row.likedetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, { liked: true, likedetails: { user: this.loggedInProfileId, time: serverTimestamp() } });
    } else {
      row.likedetails = null;
      updateDoc(docRef, { liked: false, likedetails: null });
    }
  }

  // ==========================================
  // FLAG
  // ==========================================
  toggleFlag(row: any) {
    const newValue = !row.tagged;
    row.tagged = newValue;
    const docRef = doc(this.firestoreForms, 'formsByClient', row.docid);

    if (newValue) {
      row.tagdetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, { tagged: true, tagdetails: { user: this.loggedInProfileId, time: serverTimestamp() } });
    } else {
      row.tagdetails = null;
      updateDoc(docRef, { tagged: false, tagdetails: null });
    }
  }

  // ==========================================
  // OPPORTUNITY
  // ==========================================
  toggleOpportunity(row: any) {
    const newValue = !row.opportunity;
    row.opportunity = newValue;
    const docRef = doc(this.firestoreForms, 'formsByClient', row.docid);

    if (newValue) {
      row.opportunitydetails = { user: this.loggedInProfileId, time: new Date() };
      updateDoc(docRef, { opportunity: true, opportunitydetails: { user: this.loggedInProfileId, time: serverTimestamp() } });
    } else {
      row.opportunitydetails = null;
      updateDoc(docRef, { opportunity: false, opportunitydetails: null });
    }
  }

  // ==========================================
  // NOTES
  // ==========================================
  openNotes(row: any) {
    this.notesRecord = row;
    this.notesParticipantName = this.mapProfile[row.profileid] || this.mapProfileNew[row.profileid] || '-';
    this.notesText = '';
    this.showNotesOverlay = true;
  }

  closeNotes() {
    this.showNotesOverlay = false;
    this.notesRecord = null;
    this.notesText = '';
  }

  saveNotes() {
    if (this.notesRecord && this.notesText?.trim()) {
      const newNote = {
        notes: this.notesText.trim(),
        user: this.loggedInProfileId,
        time: Timestamp.now()
      };

      if (!this.notesRecord.notes) {
        this.notesRecord.notes = [];
      }
      this.notesRecord.notes.push(newNote);

      const docRef = doc(this.firestoreForms, 'formsByClient', this.notesRecord.docid);
      updateDoc(docRef, {
        notes: arrayUnion({
          notes: this.notesText.trim(),
          user: this.loggedInProfileId,
          time: Timestamp.now()
        })
      });

      this.notesText = '';
    }
  }

  getReversedNotes(): any[] {
    if (!this.notesRecord?.notes) return [];
    return [...this.notesRecord.notes].reverse();
  }

  // ==========================================
  // OVERLAY HELPERS
  // ==========================================
  closeOverlay() {
    this.showOverlay = false;
    this.overlayFormData = null;
    this.overlayMergedForms = [];
    this.currentOverlayRow = null;
  }

  openMergedInNewTabs() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length > 5) {
      if (!confirm(`This will open ${selectedRows.length} tabs. Continue?`)) return;
    }
    for (const row of selectedRows) {
      this.onFormPreview(row);
    }
  }

  // ==========================================
  // SELECTION METHODS (unchanged)
  // ==========================================
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.filteredData.length;
    return numSelected === numRows;
  }

  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }
    this.selection.select(...this.dataSource.filteredData);
  }

  clearSelection() {
    this.selection.clear();
  }

  // ==========================================
  // DOWNLOAD AS EXCEL (unchanged)
  // ==========================================
  async downloadSelectedAsExcel() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length === 0) { alert('Please select at least one form to download.'); return; }

    const loadingRef = this.dialog.open(LoadingProgressComponent, {
      data: { msg: `Preparing Excel file for ${selectedRows.length} form(s)...` }, disableClose: true
    });

    try {
      const excelData: any[] = [];
      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];
        const formDocRef = doc(this.firestoreDefault, "delivery forms", row.formid);
        const formTemplateDoc = await getDoc(formDocRef);
        if (!formTemplateDoc.exists()) continue;
        const formTemplate = formTemplateDoc.data();
        const submittedFormDoc = await getDoc(doc(this.firestoreForms, "formsByClient", row.docid));
        if (!submittedFormDoc.exists()) continue;
        const submittedFormData = submittedFormDoc.data();

        const rowData: any = {
          'Participant Name': this.mapProfile[row.profileid] || this.mapProfileNew[row.profileid] || 'Unknown',
          'Queue': row.queueref ? this.mapQueue[row.queueref.id] : '',
          'Workshop': row.workshopref ? (this.mapWorkshop[row.workshopref.id] || this.mapWorkshopNew[row.workshopref.id]) : '',
          'Form Name': row.formname || '',
          'Submitted From': row.submittedin === 'starlabs' ? 'starlabs-link' : row.submittedin + '-app',
          'Date': row.date ? new Date(row.date.toDate()).toLocaleDateString() : '',
        };

        if (submittedFormData['formarray']) {
          for (const field of submittedFormData['formarray']) {
            if (['label', 'video', 'audio'].includes(field.type)) continue;
            rowData[field.fieldname] = this.formatValueForExcel(field, field.value);
          }
        }
        excelData.push(rowData);
      }

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Forms');
      if (excelData.length > 0) {
        const colWidths = Object.keys(excelData[0]).map(key => ({
          wch: Math.min(50, Math.max(key.length, ...excelData.map(row => String(row[key] || '').length)))
        }));
        worksheet['!cols'] = colWidths;
      }
      const fileName = `Forms_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      loadingRef.close();
      alert(`Successfully exported ${excelData.length} form(s) to Excel.`);
      this.selection.clear();
    } catch (error) {
      console.error('Error generating Excel:', error);
      loadingRef.close();
      alert('Error generating Excel. Please try again.');
    }
  }

  private formatValueForExcel(field: any, value: any): string {
    if (value === null || value === undefined) return '';
    switch (field.type) {
      case 'date':
        if (value) { try { return new Date(value.toDate ? value.toDate() : value).toLocaleDateString(); } catch { return String(value); } }
        return '';
      case 'Checkbox': return value ? 'Yes' : 'No';
      case 'MultiSelect': case 'multicheckbox': return Array.isArray(value) ? value.join(', ') : String(value);
      case 'array':
        if (Array.isArray(value) && value.length > 0) {
          return value.map((item: any, index: number) => {
            if (typeof item === 'object' && item !== null) {
              const itemParts: string[] = [];
              if (field.array && Array.isArray(field.array)) {
                field.array.forEach((af: any) => { const fv = item[af.fieldname]; if (fv != null && fv !== '') itemParts.push(`${af.fieldname}: ${fv}`); });
              } else {
                Object.keys(item).forEach(key => { const iv = item[key]; if (iv != null && iv !== '') itemParts.push(`${key}: ${iv}`); });
              }
              return itemParts.length > 0 ? `Item ${index + 1}: ${itemParts.join(', ')}` : '';
            }
            return `Item ${index + 1}: ${item}`;
          }).filter(Boolean).join(' | ');
        }
        return '';
      case 'slider':
        if (value) { let r = String(value); if (field.options?.length > 0) r += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`; return r; }
        return '';
      default:
        if (typeof value === 'object') {
          if (Array.isArray(value)) return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
          try { return Object.entries(value).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(', '); } catch { return JSON.stringify(value); }
        }
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return String(value);
    }
  }

  // ==========================================
  // DOWNLOAD AS MERGED PDF (unchanged)
  // ==========================================
  async downloadSelectedAsMergedPDF() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length === 0) { alert('Please select at least one form to download.'); return; }

    const loadingRef = this.dialog.open(LoadingProgressComponent, {
      data: { msg: `Generating merged PDF for ${selectedRows.length} form(s)...` }, disableClose: true
    });

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let isFirstForm = true;

      for (let formIndex = 0; formIndex < selectedRows.length; formIndex++) {
        const row = selectedRows[formIndex];
        const formTemplateDoc = await getDoc(doc(this.firestoreDefault, "delivery forms", row.formid));
        if (!formTemplateDoc.exists()) continue;
        const formTemplate = formTemplateDoc.data();
        const submittedFormDoc = await getDoc(doc(this.firestoreForms, "formsByClient", row.docid));
        if (!submittedFormDoc.exists()) continue;
        const submittedFormData = submittedFormDoc.data();

        const formValues: any = {};
        let controlIndex = 0;
        if (submittedFormData['formarray']) {
          for (const field of submittedFormData['formarray']) {
            if (['label', 'video', 'audio'].includes(field.type)) continue;
            formValues[`control${controlIndex}`] = field.value;
            controlIndex++;
          }
        }

        if (!isFirstForm) pdf.addPage();
        isFirstForm = false;
        let currentY = margin;
        let questionNumber = 0;

        const checkPageBreak = (requiredHeight: number) => {
          if (currentY + requiredHeight > pageHeight - margin - 10) { pdf.addPage(); currentY = margin; return true; }
          return false;
        };

        pdf.setFillColor(102, 126, 234);
        pdf.rect(0, 0, pageWidth, 8, 'F');
        pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
        pdf.text(`Form ${formIndex + 1} of ${selectedRows.length}`, margin, 5.5);
        currentY = 15;

        pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(102, 126, 234);
        const participantName = this.mapProfile[row.profileid] || this.mapProfileNew[row.profileid] || 'Unknown';
        pdf.text(participantName, margin, currentY); currentY += 6;

        pdf.setFontSize(16); pdf.setTextColor(0, 0, 0);
        pdf.text(formTemplate['formname'] || 'Form', margin, currentY); currentY += 8;

        if (formTemplate['formdescription']) {
          pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
          const descLines = pdf.splitTextToSize(formTemplate['formdescription'], pageWidth - (margin * 2));
          pdf.text(descLines, margin, currentY); currentY += descLines.length * 4 + 3;
        }

        pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
        const queue = row.queueref ? this.mapQueue[row.queueref.id] : 'N/A';
        const workshop = row.workshopref ? (this.mapWorkshop[row.workshopref.id] || this.mapWorkshopNew[row.workshopref.id]) : 'N/A';
        const submittedDate = row.date ? new Date(row.date.toDate()).toLocaleDateString() : 'N/A';
        pdf.text(`Queue: ${queue} | Workshop: ${workshop} | Submitted: ${submittedDate}`, margin, currentY); currentY += 8;

        pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.3);
        pdf.line(margin, currentY, pageWidth - margin, currentY); currentY += 8;
        pdf.setTextColor(0, 0, 0); controlIndex = 0;

        for (let i = 0; i < formTemplate['formarray'].length; i++) {
          const field = formTemplate['formarray'][i];
          if (['label', 'video', 'audio'].includes(field.type)) {
            if (field.type === 'label') {
              checkPageBreak(15);
              pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
              const labelLines = pdf.splitTextToSize(field.fieldname, pageWidth - margin - 20);
              pdf.text(labelLines, margin, currentY); currentY += labelLines.length * 5 + 3;
              if (field.fielddescription) {
                pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
                const dLines = pdf.splitTextToSize(field.fielddescription, pageWidth - margin - 10);
                pdf.text(dLines, margin, currentY); currentY += dLines.length * 3 + 2;
              }
              currentY += 5;
            }
            continue;
          }

          const fieldValue = formValues[`control${controlIndex}`]; controlIndex++; questionNumber++;
          let fieldHeight = 15;
          if (field.type === 'array' && fieldValue && Array.isArray(fieldValue)) fieldHeight += fieldValue.length * 8;
          else if (field.type === 'Paragraph' && fieldValue) fieldHeight += Math.ceil(String(fieldValue).length / 85) * 3;
          if (field.fielddescription) fieldHeight += Math.ceil(field.fielddescription.length / 85) * 3;
          if (field.fieldnotes) fieldHeight += Math.ceil(field.fieldnotes.length / 85) * 3 + 3;
          checkPageBreak(fieldHeight);

          pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
          let questionText = `${questionNumber}. ${field.fieldname}`; if (field.required) questionText += ' *';
          const questionLines = pdf.splitTextToSize(questionText, pageWidth - margin - 15);
          pdf.text(questionLines, margin, currentY); currentY += questionLines.length * 4 + 2;

          if (field.fielddescription) {
            pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
            const dLines = pdf.splitTextToSize(field.fielddescription, pageWidth - margin - 10);
            pdf.text(dLines, margin + 3, currentY); currentY += dLines.length * 3 + 2;
          }

          pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
          let valueText = this.formatFieldValue(field, fieldValue);
          let isEmptyValue = !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
          if (isEmptyValue) { pdf.setTextColor(150, 150, 150); pdf.setFont('helvetica', 'italic'); }
          const valueLines = pdf.splitTextToSize(valueText, pageWidth - margin - 15);
          pdf.text(valueLines, margin + 3, currentY); currentY += valueLines.length * 3 + 2;

          if (field.fieldnotes) {
            pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(100, 100, 100);
            const notesLines = pdf.splitTextToSize(`Note: ${field.fieldnotes}`, pageWidth - margin - 15);
            pdf.text(notesLines, margin + 3, currentY); currentY += notesLines.length * 3 + 2;
          }
          currentY += 4; pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal');
        }

        const footerY = pageHeight - 8;
        pdf.setFontSize(7); pdf.setTextColor(120, 120, 120);
        pdf.text(`Form ${formIndex + 1} of ${selectedRows.length} | Generated electronically`, margin, footerY);
      }

      pdf.save(`Merged_Forms_${new Date().toISOString().split('T')[0]}.pdf`);
      loadingRef.close();
      alert(`Successfully merged ${selectedRows.length} form(s) into PDF.`);
      this.selection.clear();
    } catch (error) {
      console.error('Error generating merged PDF:', error); loadingRef.close();
      alert('Error generating merged PDF. Please try again.');
    }
  }

  // ==========================================
  // DOWNLOAD INDIVIDUAL PDFs (unchanged)
  // ==========================================
  async downloadSelectedPDFs() {
    const selectedRows = this.selection.selected;
    if (selectedRows.length === 0) { alert('Please select at least one form to download.'); return; }

    let loadingRef = this.dialog.open(LoadingProgressComponent, {
      data: { msg: `Downloading ${selectedRows.length} PDF(s)... Please wait.` }, disableClose: true
    });

    let successCount = 0; let failCount = 0;
    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i];
      loadingRef.close();
      loadingRef = this.dialog.open(LoadingProgressComponent, {
        data: { msg: `Downloading PDF ${i + 1} of ${selectedRows.length}...` }, disableClose: true
      });
      try { await this.generateAndDownloadPDF(row); successCount++; await this.delay(500); }
      catch (error) { console.error(`Error downloading PDF for row ${i + 1}:`, error); failCount++; }
    }
    loadingRef.close();
    alert(failCount === 0 ? `Successfully downloaded ${successCount} PDF(s).` : `Downloaded ${successCount} PDF(s). Failed: ${failCount}.`);
    this.selection.clear();
  }

  // ==========================================
  // SINGLE PDF DOWNLOAD
  // ==========================================
  async downloadFormPDF(form: any) {
    const loadingRef = this.dialog.open(LoadingProgressComponent, {
      data: { msg: "Generating PDF, please wait..." }, disableClose: true
    });
    try { await this.generateAndDownloadPDF(form); loadingRef.close(); }
    catch (error) { console.error('Error generating PDF:', error); loadingRef.close(); alert('Error generating PDF. Please try again.'); }
  }

  // ==========================================
  // HELPER: Generate and Download Single PDF (unchanged)
  // ==========================================
  private async generateAndDownloadPDF(form: any): Promise<void> {
    const formDocRef = doc(this.firestoreDefault, "delivery forms", form.formid);
    const formTemplateDoc = await getDoc(formDocRef);
    if (!formTemplateDoc.exists()) throw new Error('Form template not found');
    const formTemplate = formTemplateDoc.data();

    const submittedFormDoc = await getDoc(doc(this.firestoreForms, "formsByClient", form.docid));
    if (!submittedFormDoc.exists()) throw new Error('Submitted form not found');
    const submittedFormData = submittedFormDoc.data();

    const formValues: any = {};
    let controlIndex = 0;
    if (submittedFormData['formarray']) {
      for (const field of submittedFormData['formarray']) {
        if (['label', 'video', 'audio'].includes(field.type)) continue;
        formValues[`control${controlIndex}`] = field.value; controlIndex++;
      }
    }

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    let currentY = margin; let questionNumber = 0;

    const checkPageBreak = (requiredHeight: number) => {
      if (currentY + requiredHeight > pageHeight - margin - 10) { pdf.addPage(); currentY = margin; return true; }
      return false;
    };

    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
    pdf.text(formTemplate['formname'] || 'Form', margin, currentY); currentY += 8;

    if (formTemplate['formdescription']) {
      pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      const descLines = pdf.splitTextToSize(formTemplate['formdescription'], pageWidth - (margin * 2));
      pdf.text(descLines, margin, currentY); currentY += descLines.length * 4 + 3;
    }

    pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, currentY); currentY += 8;
    pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.3);
    pdf.line(margin, currentY, pageWidth - margin, currentY); currentY += 8;
    pdf.setTextColor(0, 0, 0); controlIndex = 0;

    for (let i = 0; i < formTemplate['formarray'].length; i++) {
      const field = formTemplate['formarray'][i];
      if (['label', 'video', 'audio'].includes(field.type)) {
        if (field.type === 'label') {
          checkPageBreak(15);
          pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
          const labelLines = pdf.splitTextToSize(field.fieldname, pageWidth - margin - 20);
          pdf.text(labelLines, margin, currentY); currentY += labelLines.length * 5 + 3;
          if (field.fielddescription) {
            pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
            const dLines = pdf.splitTextToSize(field.fielddescription, pageWidth - margin - 10);
            pdf.text(dLines, margin, currentY); currentY += dLines.length * 3 + 2;
          }
          currentY += 5;
        }
        continue;
      }

      const fieldValue = formValues[`control${controlIndex}`]; controlIndex++; questionNumber++;
      let fieldHeight = 15;
      if (field.type === 'array' && fieldValue && Array.isArray(fieldValue)) fieldHeight += fieldValue.length * 8;
      else if (field.type === 'Paragraph' && fieldValue) fieldHeight += Math.ceil(String(fieldValue).length / 85) * 3;
      if (field.fielddescription) fieldHeight += Math.ceil(field.fielddescription.length / 85) * 3;
      if (field.fieldnotes) fieldHeight += Math.ceil(field.fieldnotes.length / 85) * 3 + 3;
      checkPageBreak(fieldHeight);

      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      let questionText = `${questionNumber}. ${field.fieldname}`; if (field.required) questionText += ' *';
      const questionLines = pdf.splitTextToSize(questionText, pageWidth - margin - 15);
      pdf.text(questionLines, margin, currentY); currentY += questionLines.length * 4 + 2;

      if (field.fielddescription) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
        const dLines = pdf.splitTextToSize(field.fielddescription, pageWidth - margin - 10);
        pdf.text(dLines, margin + 3, currentY); currentY += dLines.length * 3 + 2;
      }

      pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0, 0, 0);
      let valueText = this.formatFieldValue(field, fieldValue);
      let isEmptyValue = !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
      if (isEmptyValue) { pdf.setTextColor(150, 150, 150); pdf.setFont('helvetica', 'italic'); }
      const valueLines = pdf.splitTextToSize(valueText, pageWidth - margin - 15);
      pdf.text(valueLines, margin + 3, currentY); currentY += valueLines.length * 3 + 2;

      if (field.fieldnotes) {
        pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(100, 100, 100);
        const notesLines = pdf.splitTextToSize(`Note: ${field.fieldnotes}`, pageWidth - margin - 15);
        pdf.text(notesLines, margin + 3, currentY); currentY += notesLines.length * 3 + 2;
      }
      currentY += 4; pdf.setTextColor(0, 0, 0); pdf.setFont('helvetica', 'normal');
    }

    pdf.setFontSize(7); pdf.setTextColor(120, 120, 120);
    pdf.text('Generated electronically', margin, pageHeight - 8);

    const fileName = `${this.mapProfile[form['profileid']] || this.mapProfileNew[form['profileid']] || 'User'}_${formTemplate['formname'] || 'form'}.pdf`;
    pdf.save(fileName);
  }

  // ==========================================
  // HELPER: Format field value for PDF (unchanged)
  // ==========================================
  private formatFieldValue(field: any, fieldValue: any): string {
    let valueText = '';
    switch (field.type) {
      case 'Text': case 'number': case 'email': case 'time': case 'DropDown': case 'radio':
        valueText = fieldValue ? String(fieldValue) : 'No response'; break;
      case 'Paragraph':
        valueText = fieldValue ? String(fieldValue) : 'No response'; break;
      case 'date':
        valueText = fieldValue ? new Date(fieldValue.toDate ? fieldValue.toDate() : fieldValue).toLocaleDateString() : 'No date selected'; break;
      case 'slider':
        if (fieldValue) { valueText = String(fieldValue); if (field.options?.length > 0) valueText += ` (Range: ${field.options[0]}-${field.options[field.options.length - 1]})`; }
        else valueText = 'No value'; break;
      case 'MultiSelect': case 'multicheckbox':
        valueText = (fieldValue && Array.isArray(fieldValue) && fieldValue.length > 0) ? fieldValue.join(', ') : 'No selections'; break;
      case 'Checkbox':
        valueText = fieldValue ? 'Yes' : 'No'; break;
      case 'array':
        if (fieldValue && Array.isArray(fieldValue) && fieldValue.length > 0) {
          valueText = `${fieldValue.length} items: `;
          fieldValue.forEach((item: any, index: number) => {
            if (index > 0) valueText += '; ';
            valueText += `Item ${index + 1}: `;
            if (field.array && Array.isArray(field.array)) {
              valueText += field.array.map((af: any) => `${af.fieldname}: ${item[af.fieldname] || 'N/A'}`).join(', ');
            }
          });
        } else valueText = 'No items'; break;
      default:
        valueText = fieldValue ? String(fieldValue) : 'No response';
    }
    return valueText;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isSelectedParticipantOutOfRange(): boolean {
    const selectedIds: string[] = this.filterForm.get('name')?.value || [];
    if (selectedIds.length === 0) return false;

    // Check if all selected participants have no forms in current fetched data
    const hasAnyForms = selectedIds.some(id =>
      this.participantForm.some(form => form.profileid === id)
    );

    return !hasAnyForms;
  }

  toggleLikeFilter() {
    this.filterLiked = !this.filterLiked;
    this.onFilter(this.filterForm.value);
  }

  toggleFlagFilter() {
    this.filterFlagged = !this.filterFlagged;
    this.onFilter(this.filterForm.value);
  }

  openFormOverlay(row: any) {
    this.formOverlay.mapProfile = this.mapProfile;
    this.formOverlay.mapProfileNew = this.mapProfileNew;
    this.formOverlay.mapQueue = this.mapQueue;
    this.formOverlay.mapWorkshop = this.mapWorkshop;
    this.formOverlay.mapWorkshopNew = this.mapWorkshopNew;
    this.formOverlay.viewFormOverlay(row);
  }
}
