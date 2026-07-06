import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { collection, doc, Firestore, getDoc, getDocs, limit, orderBy, query, startAfter, Timestamp, where, getFirestore } from '@angular/fire/firestore';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabChangeEvent, MatTabsModule } from '@angular/material/tabs';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ProfilePictureComponent } from '../../ProfilePicture/profile-picture/profile-picture.component';

@Component({
  selector: 'app-participant-form-tracker',
  imports: [
    ProfilePictureComponent,
    MatTabsModule,
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './participant-form-tracker.component.html',
  styleUrl: './participant-form-tracker.component.css'
})
export class ParticipantFormTrackerComponent {

  // Filters
  startDate = new FormControl<Date | null>(null);
  endDate = new FormControl<Date | null>(null);
  participantSearch = new FormControl('');
  participantOptions: any[] = [];
  selectedParticipant: any = null;

  // Pagination
  pageSize = 100;
  currentPage = 0;
  lastDoc: any = null;
  pageCache: Map<number, any[]> = new Map();
  totalRecords = 0;

  // Tab
  activeTab = 0;
  collectionMap: string[] = ['ask AH', 'love letter', 'formsByClient'];
  dateFieldMap: string[] = ['created', 'created', 'date'];

  // Data
  records: any[] = [];
  loading = false;
  mapProfiles: any = {};
  selectedRecords: any[] = [];

  // Overlay
  showOverlay = false;
  overlayMode: 'individual' | 'merged' = 'merged';
  overlayTitle = '';
  overlayRecords: any[] = [];
  overlayIndex = 0;
  overlayFormFields: any[] = [];
  overlayLoading = false;
  overlayMergedForms: any[] = [];

  participantFilterCtrl = new FormControl('');
  filteredParticipants: any[] = [];

  // Field mapping per tab
  fieldMap: { primary: string; secondary?: string; primaryLabel: string; secondaryLabel?: string }[] = [
    { primary: 'askah', secondary: 'installationaskah', primaryLabel: 'Ask A&H', secondaryLabel: 'Installation Ask A&H' },
    { primary: 'loveletter', primaryLabel: 'Love Letter' },
    { primary: 'report', primaryLabel: 'uP! Life Report' },
  ];
  firestoreDefault = getFirestore()
  firestoreForms = getFirestore('firestore-forms')

  constructor() { }

  ngOnInit() {
    this.fetchAskAH();
    this.fetchParticipants();

    this.participantFilterCtrl.valueChanges.subscribe((search) => {
      this.filterParticipants(search || '');
    });
  }

  fetchParticipants() {
    getDocs(query(collection(this.firestoreDefault, 'profile_data'), orderBy("name", "asc"))).then((snap) => {
      this.participantOptions = snap.docs.map((doc) => ({
        id: doc.id,
        name: doc.data()['name']
      }));
      this.filteredParticipants = [...this.participantOptions];
      this.mapProfiles = {};
      snap.docs.forEach((doc) => {
        this.mapProfiles[doc.id] = doc.data();
      });
    });
  }

  filterParticipants(search: string) {
    if (!search) {
      this.filteredParticipants = [...this.participantOptions];
      return;
    }
    const lowerSearch = search.toLowerCase();
    this.filteredParticipants = this.participantOptions.filter(
      (p) => p.name?.toLowerCase().includes(lowerSearch)
    );
  }

  private buildQuery(collectionName: string, dateField: string, pageLimit: number, startAfterDoc?: any) {
    const ref = collection(this.firestoreDefault, collectionName);
    const constraints: any[] = [orderBy(dateField, 'desc')];

    if (this.startDate.value) {
      constraints.push(where(dateField, '>=', Timestamp.fromDate(this.startDate.value)));
    }
    if (this.endDate.value) {
      const endOfDay = new Date(this.endDate.value);
      endOfDay.setHours(23, 59, 59, 999);
      constraints.push(where(dateField, '<=', Timestamp.fromDate(endOfDay)));
    }

    if (this.selectedParticipant) {
      constraints.push(where('profileid', '==', this.selectedParticipant.id));
    }

    // uP! Life Report tab
    if (this.activeTab === 2) {
      constraints.push(where('formid', '==', 'QundpMXgXlXiCJYZ7WU4'));
    }

    if (startAfterDoc) {
      constraints.push(startAfter(startAfterDoc));
    }

    constraints.push(limit(pageLimit));
    return query(ref, ...constraints);
  }

  private fetchRecords(startAfterDoc?: any) {
    this.loading = true;
    const collectionName = this.collectionMap[this.activeTab];
    const dateField = this.dateFieldMap[this.activeTab];
    const q = this.buildQuery(collectionName, dateField, this.pageSize, startAfterDoc);

    getDocs(q).then((snap) => {
      this.records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      this.lastDoc = snap.docs[snap.docs.length - 1] || null;
      this.pageCache.set(this.currentPage, snap.docs as any);

      // Update total records estimate
      if (this.currentPage === 0) {
        if (snap.docs.length < this.pageSize) {
          // Less than page size means this is all data
          this.totalRecords = snap.docs.length;
        } else {
          // Has more pages, estimate higher
          this.totalRecords = snap.docs.length * 10;
        }
      } else {
        if (snap.docs.length < this.pageSize) {
          // Last page
          this.totalRecords = (this.currentPage * this.pageSize) + snap.docs.length;
        }
      }

      this.loading = false;
    }).catch((err) => {
      console.error('Error fetching records:', err);
      this.loading = false;
    });
  }

  fetchAskAH() {
    this.resetPagination(); 
    this.fetchRecords();
  }

  fetchLoveLetter() { 
    this.resetPagination(); 
    this.fetchRecords(); 
  }

  fetchUPLifeReport() { 
    this.resetPagination(); 
    this.fetchRecords(); 
  }

  onTabChange(event: MatTabChangeEvent) {
    this.activeTab = event.index;
    this.selectedRecords = [];
    switch (event.index) {
      case 0: this.fetchAskAH(); break;
      case 1: this.fetchLoveLetter(); break;
      case 2: this.fetchUPLifeReport(); break;
    }
  }

  onPageChange(event: PageEvent) {
    if (event.pageSize !== this.pageSize) {
      this.pageSize = event.pageSize;
      this.resetPagination();
      this.fetchRecords();
      return;
    }

    if (event.pageIndex > this.currentPage) {
      this.currentPage = event.pageIndex;
      if (this.pageCache.has(this.currentPage)) {
        const cachedDocs = this.pageCache.get(this.currentPage)!;
        this.records = cachedDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      } else {
        this.fetchRecords(this.lastDoc);
      }
    } else if (event.pageIndex < this.currentPage) {
      this.currentPage = event.pageIndex;
      const cachedDocs = this.pageCache.get(this.currentPage)!;
      this.records = cachedDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      this.lastDoc = cachedDocs[cachedDocs.length - 1];
    }
  }

  isSelected(row: any): boolean {
    return this.selectedRecords.some((r) => r.id === row.id);
  }

  toggleRow(row: any, checked: boolean) {
    if (checked) {
      if (this.activeTab === 2 && this.selectedRecords.length >= 20) {
        alert('Maximum 20 selections allowed for uP! Life Report.');
        return;
      }
      this.selectedRecords.push(row);
    } else {
      this.selectedRecords = this.selectedRecords.filter((r) => r.id !== row.id);
    }
  }

  toggleAll(checked: boolean) {
    if (checked) {
      this.selectedRecords = this.activeTab === 2 ? this.records.slice(0, 20) : [...this.records];
    } else {
      this.selectedRecords = [];
    }
  }

  isAllSelected(): boolean {
    if (this.activeTab === 2) {
      const maxSelect = Math.min(this.records.length, 20);
      return maxSelect > 0 && this.selectedRecords.length === maxSelect;
    }
    return this.records.length > 0 && this.selectedRecords.length === this.records.length;
  }

  // Overlay methods
  private getFormattedRecords(): any[] {
    const fields = this.fieldMap[this.activeTab];
    return this.selectedRecords.map((record) => ({
      name: this.mapProfiles[record.profileid]?.['name'] || '-',
      date: record.created?.toDate
        ? record.created.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
        : new Date(record.created).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
      content: record[fields.primary] || '-',
      contentLabel: fields.primaryLabel,
      content2: fields.secondary ? record[fields.secondary] || null : null,
      content2Label: fields.secondaryLabel || null,
    }));
  }

  viewIndividual() {
    const tabNames = ['Ask A&H', 'Love Letter', 'uP! Life Report'];
    this.overlayTitle = tabNames[this.activeTab];
    this.overlayMode = 'individual';
    this.overlayRecords = this.getFormattedRecords();
    this.overlayIndex = 0;
    this.showOverlay = true;
  }

  async viewMerged() {
    const tabNames = ['Ask A&H', 'Love Letter', 'uP! Life Report'];
    this.overlayTitle = tabNames[this.activeTab] + ' (Merged)';
    this.overlayMode = 'merged';
    this.overlayRecords = [];
    this.overlayMergedForms = [];
    this.overlayLoading = true;
    this.showOverlay = true;

    if (this.activeTab === 2) {
      try {
        const results = await Promise.all(
          this.selectedRecords.map(async (row) => {
            const [formTemplateDoc, submittedFormDoc] = await Promise.all([
              getDoc(doc(this.firestoreDefault, 'delivery forms', row.formid)),
              getDoc(doc(this.firestoreForms, 'formsByClient', row.docid))
            ]);

            if (!formTemplateDoc.exists() || !submittedFormDoc.exists()) return null;

            const formTemplate = formTemplateDoc.data();
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

            controlIndex = 0;
            let questionNumber = 0;
            const fields: any[] = [];

            for (const field of formTemplate['formarray']) {
              if (['video', 'audio'].includes(field.type)) continue;

              if (field.type === 'label') {
                fields.push({
                  type: 'label',
                  fieldname: field.fieldname,
                  fielddescription: field.fielddescription || null
                });
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
                value: this.formatFieldValueForDisplay(field, fieldValue),
                isEmpty: !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
              });
            }

            return {
              name: this.mapProfiles[row.profileid]?.['name'] || '-',
              date: row.date?.toDate
                ? row.date.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
                : new Date(row.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
              formTitle: formTemplate['formname'] || 'Form',
              formDescription: formTemplate['formdescription'] || null,
              fields: fields
            };
          })
        );

        // Remove null entries
        this.overlayMergedForms = results.filter(Boolean);

      } catch (err) {
        console.error('Error loading merged forms:', err);
      }

      this.overlayLoading = false;

    } else {
      const fieldConfig = this.fieldMap[this.activeTab];
      this.overlayRecords = this.selectedRecords.map((record) => ({
        name: this.mapProfiles[record.profileid]?.['name'] || '-',
        date: record.created?.toDate
          ? record.created.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
          : new Date(record.created).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
        content: record[fieldConfig.primary] || '-',
        contentLabel: fieldConfig.primaryLabel,
        content2: fieldConfig.secondary ? record[fieldConfig.secondary] || null : null,
        content2Label: fieldConfig.secondaryLabel || null,
      }));
      this.overlayLoading = false;
    }
  }

  async viewRow(row: any) {
    const fields = this.fieldMap[this.activeTab];
    const tabNames = ['Ask A&H', 'Love Letter', 'uP! Life Report'];
    this.overlayTitle = tabNames[this.activeTab];
    this.overlayMode = 'individual';
    this.showOverlay = true;

    if (this.activeTab === 2) {
      // uP! Life Report - load form template + submitted data
      this.overlayLoading = true;
      this.overlayFormFields = [];

      try {
        const formTemplateDoc = await getDoc(doc(this.firestoreDefault, 'delivery forms', row.formid));
        const submittedFormDoc = await getDoc(doc(this.firestoreForms, 'formsByClient', row.docid));

        if (!formTemplateDoc.exists() || !submittedFormDoc.exists()) {
          this.overlayLoading = false;
          return;
        }

        const formTemplate = formTemplateDoc.data();
        const submittedFormData = submittedFormDoc.data();

        // Extract form values
        const formValues: any = {};
        let controlIndex = 0;
        if (submittedFormData['formarray']) {
          for (const field of submittedFormData['formarray']) {
            if (['label', 'video', 'audio'].includes(field.type)) continue;
            formValues[`control${controlIndex}`] = field.value;
            controlIndex++;
          }
        }

        // Build display fields
        controlIndex = 0;
        let questionNumber = 0;
        this.overlayFormFields = [];

        for (const field of formTemplate['formarray']) {
          if (['video', 'audio'].includes(field.type)) continue;

          if (field.type === 'label') {
            this.overlayFormFields.push({
              type: 'label',
              fieldname: field.fieldname,
              fielddescription: field.fielddescription || null
            });
            continue;
          }

          const fieldValue = formValues[`control${controlIndex}`];
          controlIndex++;
          questionNumber++;

          this.overlayFormFields.push({
            type: 'field',
            number: questionNumber,
            fieldname: field.fieldname,
            fielddescription: field.fielddescription || null,
            fieldnotes: field.fieldnotes || null,
            required: field.required || false,
            fieldType: field.type,
            value: this.formatFieldValueForDisplay(field, fieldValue),
            isEmpty: !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0)
          });
        }

        this.overlayRecords = [{
          name: this.mapProfiles[row.profileid]?.['name'] || '-',
          date: row.date?.toDate
            ? row.date.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : new Date(row.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
          formTitle: formTemplate['formname'] || 'Form',
          formDescription: formTemplate['formdescription'] || null,
        }];

      } catch (err) {
        console.error('Error loading form:', err);
      }

      this.overlayLoading = false;

    } else {
      // Ask A&H / Love Letter
      this.overlayRecords = [{
        name: this.mapProfiles[row.profileid]?.['name'] || '-',
        date: row.created?.toDate
          ? row.created.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' })
          : new Date(row.created).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
        content: row[fields.primary] || '-',
        contentLabel: fields.primaryLabel,
        content2: fields.secondary ? row[fields.secondary] || null : null,
        content2Label: fields.secondaryLabel || null,
      }];
    }
  }

  formatFieldValueForDisplay(field: any, value: any): string {
    if (!value && value !== 0) return 'Not answered';

    if (field.type === 'array' && Array.isArray(value)) {
      return value.map((item: any) => {
        if (typeof item === 'object') return JSON.stringify(item);
        return String(item);
      }).join('\n');
    }

    if (field.type === 'checkbox') {
      return value ? 'Yes' : 'No';
    }

    if (field.type === 'date' && value?.toDate) {
      return value.toDate().toLocaleDateString('en-IN', { dateStyle: 'medium' });
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  }

  closeOverlay() {
    this.showOverlay = false;
  }

  overlayPrev() {
    if (this.overlayIndex > 0) this.overlayIndex--;
  }

  overlayNext() {
    if (this.overlayIndex < this.overlayRecords.length - 1) this.overlayIndex++;
  }

  applyFilters() {
    this.selectedRecords = [];
    this.resetPagination();
    this.fetchRecords();
  }

  clearFilters() {
    this.selectedRecords = [];
    this.startDate.reset();
    this.endDate.reset();
    this.selectedParticipant = null;
    this.resetPagination();
    this.fetchRecords();
  }

  private resetPagination() {
    this.currentPage = 0;
    this.lastDoc = null;
    this.pageCache.clear();
    this.totalRecords = 0;
  }
}