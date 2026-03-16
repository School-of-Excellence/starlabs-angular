import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgModel, ReactiveFormsModule, FormControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDateRangePicker, MatDatepickerModule } from '@angular/material/datepicker';
import { Firestore, collection, collectionData, query, where, doc, Timestamp, writeBatch, getDocs, CollectionReference } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatInputModule } from '@angular/material/input';
import { orderBy } from 'firebase/firestore';


@Component({
  selector: 'app-entry-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatDateRangePicker,
    ReactiveFormsModule,
    MatInputModule
  ],
  templateUrl: './entry-management.component.html',
  styleUrl: './entry-management.component.css'
})
export class EntryManagementComponent implements OnInit, OnDestroy {
  // Data
  entries: any = [];
  subscribe: any = null;
  isloading = true;

  // profile data
  profile_id: any = null;
  profileMap: any = {};
  collRef: CollectionReference;

  // Form state
  showForm = false;
  isEditMode = false;
  editingId: number | null = null;

  // form data
  entryForm: FormGroup;
  showCompleteForm = false;
  isCurrentDateExist: boolean = true;
  isFormButtonClicked : boolean = false

  // logs array
  logs: any = null;

  // Filter state
  filterType: 'month' | 'range' = 'month';
  startDate: Date;
  endDate: Date;
  monthyear;

  // Modal state
  showLogModal = false;

  // Toast state
  showToast = false;
  toastMessage = '';

  constructor(
    private firestore: Firestore,
    public authservice: AuthguardService,
    private form: FormBuilder
  ) {

    this.collRef = collection(this.firestore, 'adsinvestment');

    this.entryForm = this.form.group({
      date: [new Date()],
      campaigns: [0, Validators.required],
      amount: [0, Validators.required]
    });

    this.authservice.getRoles().then((roles) => {
      this.profile_id = roles['profile_ref'].id ?? null;
    });

    this.authservice.getProfileMap().then((profileData) => {
      this.profileMap = profileData.map;
    });
    this.initEntryForm();
    this.setCurrentMonth();
  }

  // function to load ads entry only on page load
  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.subscribe) {
      this.subscribe.unsubscribe();
    }
  }

  // function to check whether entry for todays date is exist or not
  async initEntryForm() {
    await this.dateExist();
    if (this.showCompleteForm) {
      this.isCurrentDateExist = false;
    }
  }

  // function to load ads from firestore
  loadData(): void {
    this.ngOnDestroy();
    let start = new Date(this.startDate);
    let end = new Date(this.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const q = query(this.collRef, where("date", '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)), orderBy('date', 'asc'));
    this.subscribe = collectionData(q).subscribe((data) => {
      this.entries = data;
      this.isloading = false;
    });
  }

  // function to check whether the entered date exist or not
  async dateExist() {
    if (!this.entryForm.value.date) {
      return
    }
    try {
      const date = this.entryForm.value.date;
      const start = new Date(date);
      const end = new Date(date);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const q = query(this.collRef, where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end)));

      const snap = (await getDocs(q));
      const isexist = !snap.empty;

      this.entryForm.get('date').setErrors(isexist ? {} : null);
      this.showCompleteForm = !isexist;
    } catch (error) {
      console.log('Error in Checking Entry for Date is exist or not : ', error.message);
    }
  }

  // Function to set current month date 
  setCurrentMonth() {
    const now = new Date();
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // Update date based on month selection 
  updateDate() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.loadData();
  }

  // move to next month 
  forwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.loadData();
  }

  // move to previous month 
  backwardMonth() {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.loadData();
  }

  // Filter methods
  setFilterType(type: 'month' | 'range'): void {
    this.filterType = type;
    this.setCurrentMonth();
    this.loadData();
  }

  // Form methods
  openAddForm(): void {
    this.isEditMode = false;
    this.editingId = null;
    this.resetForm();
    this.showForm = true;
  }

  // function to open form in edit mode
  editEntry(entry: any): void {
    this.isEditMode = true;
    this.editingId = entry.docid;

    this.entryForm.get('date')?.setValue(entry.date?.toDate());
    this.entryForm.get('campaigns')?.setValue(entry.campaigns);
    this.entryForm.get('amount')?.setValue(entry.amount);

    this.showForm = true;
    this.showCompleteForm = true;
  }

  // function to close form
  closeForm(): void {
    this.showForm = false;
    this.isEditMode = false;
    this.editingId = null;
    this.isFormButtonClicked = false;
    this.resetForm();
  }

  // function to rest the form
  resetForm(): void {
    this.entryForm.get('date')?.setValue(this.isCurrentDateExist ? '' : new Date());
    this.entryForm.get('campaigns')?.setValue(0);
    this.entryForm.get('amount')?.setValue(0);

    this.showCompleteForm = !this.isCurrentDateExist;
    this.entryForm.get('date').setErrors(null);
  }

  // function to handle the submit of form
  handleSubmit(): void {
    if (this.entryForm.invalid || !this.entryForm.value.date) {
      return
    }
    this.isFormButtonClicked = true; 
    if (this.isEditMode && this.editingId !== null) {
      this.updateEntry();
    } else {
      this.addEntry();
    }
  }

  // function to add new ads to firebase
  async addEntry(): Promise<void> {
    try {
      const batch = writeBatch(this.firestore);
      const docRef = doc(collection(this.firestore, 'adsinvestment'));
      const subdocRef = doc(collection(this.firestore, `adsinvestment/${docRef.id}/logs`));
      const entry = this.entryForm.value;

      const newEntry = {
        docid: docRef.id,
        date: Timestamp.fromDate(entry.date),
        campaigns: entry.campaigns,
        amount: entry.amount,
        entrytime: Timestamp.now(),
        lastupdated: Timestamp.now(),
        entryby: this.profile_id
      };

      const newLog = {
        docid: subdocRef.id,
        editedby: this.profile_id,
        updatedtime: Timestamp.now(),
        campagins: entry.campaigns,
        amount: entry.amount,
      };

      batch.set(docRef, newEntry);
      batch.set(subdocRef, newLog);

      await batch.commit();

      this.displayToast('Entry added successfully!');
      if (entry.date.toLocaleDateString() === new Date().toLocaleDateString()) {
        this.isCurrentDateExist = true;
      }
      this.closeForm();
    } catch (error) {
      console.log('Error in adding entry : ', error.message)
      this.closeForm();
    }
  }

  // function to edit or patch ads 
  async updateEntry(): Promise<void> {
    const entryIndex = this.entries.findIndex(e => e.docid === this.editingId);
    try {
      if (entryIndex !== -1) {
        const entry = this.entries[entryIndex];
        const batch = writeBatch(this.firestore);
        const docRef = doc(this.firestore, `adsinvestment/${entry.docid}`);
        const subdocRef = doc(collection(this.firestore, `adsinvestment/${docRef.id}/logs`));
        const entryValues = this.entryForm.value;

        entry.campaigns = entryValues.campaigns;
        entry.amount = entryValues.amount;
        entry.lastupdated = Timestamp.now();

        const newLog = {
          docid: subdocRef.id,
          editedby: this.profile_id,
          updatedtime: Timestamp.now(),
          campagins: entryValues.campaigns,
          amount: entryValues.amount,
        };

        batch.update(docRef, entry);
        batch.set(subdocRef, newLog);
        await batch.commit();

        this.displayToast('Entry updated successfully!');
        this.closeForm();
      }
    }
    catch (error) {
      console.log('Error in Updating entry : ', error);
      this.closeForm();
    }
  }

  // Log modal methods
  async viewLog(entryId: string): Promise<void> {
    const collRef = collection(this.firestore, `adsinvestment/${entryId}/logs`);
    const q = query(collRef, orderBy('updatedtime', 'desc'));
    const snap = await getDocs(q);
    const logs = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    this.logs = logs;
  }

  // function to close view log model
  closeLogModal(): void {
    this.logs = null;
  }

  // Toast methods
  displayToast(message: string): void {
    this.toastMessage = message;
    this.showToast = true;

    setTimeout(() => {
      this.showToast = false;
    }, 3000);
  }

  // Utility methods
  isEditing(entryId: number): boolean {
    return this.editingId === entryId;
  }

  // function to format the currency
  formatCurrency(value: any): string {
    if ([null, undefined, ''].includes(value)) {
      return '';
    }
    return '₹' + value.toLocaleString('en-IN');
  }

  // function to get date for ads
  getDay(dateStr: string): string {
    const date = new Date(dateStr);
    return date.getDate().toString().padStart(2, '0');
  }

  // function to format and get month and year for specific ads
  getMonthYear(dateStr: string): string {
    const date = new Date(dateStr);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${month} ${year}`;
  }

  // function format and get date and time of an ads
  formatDateTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date?.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }


  // function to track elements with ngfor
  trackByEntryId(index: number, entry: any): number {
    return entry.docid;
  }

  // function to track elements with ngfor
  trackByLogIndex(index: number, log: any): number {
    return index;
  }

  // function to get profile name
  getProfileName(editedby: string) {
    return this.profileMap[editedby] ?? '';
  }

  // Computed values
  get totalCampaings(): number {
    return this.entries.reduce((sum, e) => sum + e.campaigns, 0);
  }

  // function to get total amount
  get totalAmount(): number {
    return this.entries.reduce((sum, e) => sum + e.amount, 0);
  }

  // function to get total entries
  get totalEntries(): number {
    return this.entries.length;
  }

}
