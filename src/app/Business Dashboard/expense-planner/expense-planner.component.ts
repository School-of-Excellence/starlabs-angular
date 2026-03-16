import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgModel, ReactiveFormsModule, FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDateRangePicker, MatDatepickerModule } from '@angular/material/datepicker';
import { Firestore, collection, collectionData, query, where, doc, Timestamp, setDoc, updateDoc, getDocs, deleteDoc } from '@angular/fire/firestore';
import { AuthguardService } from '../../authguard.service';
import { MatInputModule } from '@angular/material/input';
import { orderBy } from 'firebase/firestore';
import { catchError, firstValueFrom, of, Subscription, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

export interface FormDesc {
  name: string;
  amount: number | null;
  paid: boolean;
}

export interface FormData {
  date: any;
  description: FormDesc[];
}

interface InflowData {
  projection: number;
  paid: number;
  difference: number;
}

interface WebhookResponse {
  success: boolean;
  value: any;
}

@Component({
  selector: 'app-expense-planner',
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
  templateUrl: './expense-planner.component.html',
  styleUrl: './expense-planner.component.css'
})
export class ExpensePlannerComponent implements OnInit, OnDestroy {
  // Numeric declarations
  thisMonthDue: number = 0;
  thisMonthEMIPaid: number = 0;
  thisMonthAdditional: number = 0;
  thisMonthNewPayment: number = 0;
  thisMonthRevived: number = 0;
  thisMonthUnschedule: number = 0;
  thisMonthReceived: number = 0;

  // String declarations
  activeTab: 'expense' | 'inflow' = 'expense';
  searchTerm = '';
  filterType: 'month' | 'range' = 'month';
  monthyear: string;
  inflowMonth: 'current' | 'next' = 'current';

  // Boolean declarations
  isDialogOpen = false;
  isEditMode: boolean = false;
  isloading: boolean = true;
  showCompleteForm = false;
  isCurrentDateExist: boolean | null = null;
  isEntryDateDeleted: boolean = false;

  // Date declarations
  currentDate = new Date();
  startDate: Date;
  endDate: Date;

  // Null declarations
  editingExpense: any | null = null;
  profile_id: any = null;
  subscribe: { [key: string]: Subscription } = {};
  inflowSubscribe: any = null;
  deletedExpense: any = null;

  // Object declarations
  entryForm: FormGroup;
  inflowsMap: { [key: string]: InflowData } = {};
  daysMap = {};

  // Array declarations
  expenses: any[] = [];
  filteredExpenses: any[] = [];
  participantMetadata = [];
  inflows: any[] = [];
  nextMonthPDD: any = [];
  showTootipMsg: string[] = [];

  loadingStatus = {
    expense: false,
    inflows: false
  }

  constructor(
    private firestore: Firestore,
    public authservice: AuthguardService,
    private http: HttpClient,
    private form: FormBuilder,
    private activeroute: ActivatedRoute,
    private route: Router
  ) {

    this.entryForm = this.form.group({
      date: [new Date()],
      description: this.form.array([
        this.form.group({
          name: ['', Validators.required],
          amount: [0, Validators.required],
          paid: [false, Validators.required]
        })
      ])
    });

    this.authservice.getRoles().then((roles) => {
      this.profile_id = roles['profile_ref'].id ?? null;
    });

    this.setCurrentMonth();
    this.initEntryForm();
  }

  async ngOnInit() {
    await this.loadWebhookData();
    this.loadMetadata();
    this.subscribe['route'] = this.activeroute.paramMap.subscribe((parms) => {
      let activeTab: 'expense' | 'inflow' = 'expense';
      let inflowMonth: 'current' | 'next' = 'current';

      if (parms.has('tab') && ['home', 'current', 'next'].includes(parms.get('tab'))) {
        if (parms.get('tab') !== 'home') {
          activeTab = 'inflow';
          if (parms.get('tab') === 'current') {
            inflowMonth = 'current';
          } else if (parms.get('tab') === 'next') {
            inflowMonth = 'next';
          }
        }
      } else {
        this.route.navigate(['/expense-planner/home']);
      }
      this.activeTab = activeTab;
      this.inflowMonth = inflowMonth;
      this.loadData();
    });
  }

  ngOnDestroy(): void {
    if (this.subscribe) {
      Object.values(this.subscribe).forEach((sub) => {
        sub.unsubscribe()
      });
    }
    if (this.inflowSubscribe) {
      this.inflowSubscribe.unsubscribe();
    }
  }

  checkIsAllLoaded() {
    const allLoaded = Object.values(this.loadingStatus).every((status) => !status);
    if (allLoaded) {
      this.isloading = false;
    }
    console.log(this.loadingStatus)
  }

  // Function to create map for each day of current month 
  createMonthDaysMap(): void {
    const now = new Date();
    if (this.inflowMonth == 'next') {
      now.setMonth(now.getMonth() + 1)
    }
    const year = now.getFullYear();
    const month = now.getMonth();

    // Get total days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Clear existing map
    this.daysMap = {};

    // Create entry for each day
    for (let day = 1; day <= totalDays; day++) {
      this.daysMap[day] = {
        projection: 0,
        paid: 0,
        schedule: 0,
        newpayment: 0
      };
    }
  }

  // Function to get data from webhook 
  async loadWebhookData() {
    let watsonurl1 = '';
    let watsonurl2 = '';

    if (environment.firebase.projectId === "starlabs-test") {
      watsonurl1 = "https://us-central1-watson-test-19.cloudfunctions.net/sendGrowthDataToBusinessDashboard";
      watsonurl2 = "https://us-central1-watson-test-19.cloudfunctions.net/sendUpcomingDataToBusinessDashboard";
    } else if (environment.firebase.projectId === "fir-sample-aae4a") {
      watsonurl1 = "https://us-central1-watsonproduction-becde.cloudfunctions.net/sendGrowthDataToBusinessDashboard";
      watsonurl2 = "https://us-central1-watsonproduction-becde.cloudfunctions.net/sendUpcomingDataToBusinessDashboard";
    }

    if (!watsonurl1) return;

    try {
      const [watsonresult1, watsonresult2] = await Promise.all([
        firstValueFrom(this.http.get<WebhookResponse>(watsonurl1).pipe(
          timeout(30000),
          catchError(err => {
            console.error('Error fetching growth data:', err);
            return of(null);
          })
        )),
        firstValueFrom(this.http.get<WebhookResponse>(watsonurl2).pipe(
          timeout(30000),
          catchError(err => {
            console.error('Error fetching upcoming data:', err);
            return of(null);
          })
        ))
      ]);

      if (watsonresult1?.success) {
        this.thisMonthDue = watsonresult1.value[`${this.currentDate.getMonth() + 1}-${this.currentDate.getFullYear()}`] || 0;
      }
      console.log('status of request : ' , watsonresult2)
      if (watsonresult2?.success) {
        this.nextMonthPDD = watsonresult2.value;
        console.log('from loadwebhook : ', this.nextMonthPDD)
      }

    } catch (error: any) {
      console.error('Error loading webhook data:', error.message || error);
    }
  }

  // function to load meta data
  async loadMetadata() {
    this.inflowSubscribe = collectionData(query(collection(this.firestore, 'participant metadata'), where("financedata", "!=", null))).subscribe((metadata) => {
      this.participantMetadata = metadata;
      if (metadata.length != 0 && this.activeTab == 'inflow') {
        this.loadInflows();
      }      
    });
  }

  // fcuntion to check whether entry for current date exist
  async initEntryForm(): Promise<void> {
    await this.dateExist();
    this.isCurrentDateExist = !this.showCompleteForm
  }

  // Check expense date exists
  async dateExist(): Promise<void> {
    try {
      const date = this.entryForm.value.date;
      const start = new Date(date);
      const end = new Date(date);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const collRef = collection(this.firestore, 'expenseplanning');
      const q = query(
        collRef,
        where('date', '>=', Timestamp.fromDate(start)),
        where('date', '<=', Timestamp.fromDate(end)),
      );

      const snap = await getDocs(q);
      const isExist = !snap.empty;

      if (isExist && snap.docs[0].data()['delete'] && this.isCurrentDateExist !== null) {
        const edit = confirm('Entry For this Date Exist But Deleted click ok to Edit or Delete Permanently');
        if (edit) {
          this.isEntryDateDeleted = true;
          this.editEntry(snap.docs[0].data());
        } else {
          this.permanentDeleteEntry(snap.docs[0].data()['docid']);
          this.closeDialog();
        }
      } else {
        this.entryForm.get('date').setErrors(isExist ? {} : null);
        this.showCompleteForm = !isExist;
      }
    } catch (error) {
      console.log('Error in Checking Entry for Date is exist or not : ', error.message);
    }
  }

  // function to load screen data as per active tab
  loadData(): void {
    this.isloading = true;
    if (this.activeTab === 'expense') {
      this.loadingStatus.expense = true;
      this.loadExpenses();
    } else {
      this.loadingStatus.inflows = true;
      this.loadInflows();
    }
  }

  // Function to load the expenses 
  loadExpenses(): void {
    if (this.subscribe['expenseplanner']) {
      this.subscribe['expenseplanner'].unsubscribe();
    }

    const collRef = collection(this.firestore, 'expenseplanning');
    let start = new Date(this.startDate);
    let end = new Date(this.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const q = query(
      collRef,
      where("date", '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end)),
      where('delete', '==', false),
      orderBy('date', 'asc')
    );

    this.subscribe['expenseplanner'] = collectionData(q).subscribe((data) => {
      this.expenses = data;
      this.loadingStatus.expense = false;
      this.checkIsAllLoaded()
    });
  }
  // Function to load the inflows 
  loadInflows(): void {
    let tempMap: { [key: number]: InflowData } = {};
    this.createMonthDaysMap();
    for (const key in this.daysMap) {
      tempMap[key] = { ...this.daysMap[key] };
    }
    let tempEMIPaid = 0;
    let tempNewPayment = 0;
    let tempAdditional = 0;
    let tempRevived = 0;
    let tempUnschedule = 0;
    let receivedAmount = 0;

    const now = new Date();
    const targetDate = this.inflowMonth === 'next' ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    let filteredData = this.inflowMonth == 'current' ? this.participantMetadata.map((e) => e['financedata']) : this.nextMonthPDD;

    console.log(this.nextMonthPDD)

    for (let i = 0; i < filteredData.length; i++) {
      const financeData = filteredData[i];

      if (financeData && financeData['date']) {
        const customerStatus = financeData['customerstatus'];
        const dateValue = financeData['date'];
        const date = this.convertToDate(dateValue);
        const financeYear = date.getFullYear();
        const financeMonth = date.getMonth();
        const financeDate = this.inflowMonth == 'current' ? financeData['paymentday'] : date ? date.getDate() : null;
        const receipt = financeData['receipt'] || 0;
        let mapsum = 0;
        receivedAmount += receipt;
        let projectedAmount = 0;

        // Check if date is in current month
        if (financeYear === year && financeMonth === month && ![null, undefined, ''].includes(financeDate)) {

          if (financeData['paymentmap']) {
            Object.keys(financeData['paymentmap']).forEach((key) => {
              const parts = key.split('-');
              const day = parseInt(parts[2]);

              mapsum += financeData['paymentmap'][key]
              if (tempMap[day]) {
                tempMap[day]['paid'] += financeData['paymentmap'][key]
              }
            })
          }

          if (["newpayment"].includes(financeData['status'])) {
            tempNewPayment = tempNewPayment + financeData['newpaymentamount'];
            if (![null, undefined, 0].includes(financeData['scheduleamount'])) {
              if ([null, undefined, 0].includes(financeData['revivedreceipts'])) {
                if (['regular', 'defaulted'].includes(customerStatus) && ![null, undefined, 0].includes(financeData['scheduleamount'])) {
                  tempEMIPaid = tempEMIPaid + financeData['scheduleamount'];
                  if (financeData['paymentstatus'] == 'extrapaid') {
                    tempAdditional = tempAdditional + (financeData['receipt'] - ([null, undefined, ""].includes(financeData['computedamount']) ? 0 : financeData['computedamount']));
                  }
                }
              }
            }

            if (((financeData['computedamount'] - financeData['newpaymentamount']) > 0) && ['regular', 'defaulted'].includes(customerStatus)) {
              projectedAmount = projectedAmount + ((financeData['computedamount'] - financeData['newpaymentamount']) - ([null, undefined, "", 0].includes(financeData['additionalamount']) ? 0 : financeData['additionalamount']));
            }
          }

          // filter expected revenue
          if (['regular', 'defaulted'].includes(customerStatus) && ['schedule', 'schedule-extended'].includes(financeData['status'])) {
            if ([null, undefined, 0].includes(financeData['revivedreceipts']) && financeData['computedamount'] != 0) {
              if (['regular', 'defaulted'].includes(customerStatus) && ![null, undefined, 0].includes(financeData['scheduleamount'])) {
                tempEMIPaid = tempEMIPaid + (financeData['scheduleamount'] > financeData['computedamount'] ? financeData['computedamount'] : financeData['scheduleamount']);
              }
              projectedAmount = projectedAmount + (financeData['computedamount'] - ([null, undefined, "", 0].includes(financeData['additionalamount']) ? 0 : financeData['additionalamount']));
            }

            // filter additional emi
            if (financeData['paymentstatus'] == 'extrapaid' && [null, undefined, 0].includes(financeData['revivedreceipts'])) {
              tempAdditional = tempAdditional + (financeData['receipt'] - ([null, undefined, ""].includes(financeData['computedamount']) ? 0 : financeData['computedamount']));
            }
          }

          // get unschedule amount
          if ([null, undefined, "", "emipause"].includes(financeData['status']) && financeData['receipt'] > 0) {
            tempUnschedule = tempUnschedule + financeData['scheduleamount'];
          }
          // get revived data
          if (financeData['revivedreceipts'] > 0) {
            tempRevived = tempRevived + financeData['revivedreceipts'];
          }

          tempMap[financeDate]['projection'] += projectedAmount;
        }
      }
    }

    this.inflowsMap = tempMap;
    this.thisMonthEMIPaid = tempEMIPaid;
    this.thisMonthAdditional = tempAdditional;
    this.thisMonthNewPayment = tempNewPayment;
    this.thisMonthRevived = tempRevived;
    this.thisMonthReceived = receivedAmount;
    this.thisMonthUnschedule = tempUnschedule;

    this.loadingStatus.inflows = false;
    this.checkIsAllLoaded();
  }

  // ==================== TAB METHODS ====================

  // function to set active tab
  setActiveTab(tab: 'expense' | 'inflow'): void {
    if (tab === 'expense') {
      this.route.navigate(['/expense-planner/home'])
    } else {
      this.route.navigate(['/expense-planner/current'])
    }
  }

  // ==================== EXPENSE CALCULATIONS ====================

  // function to get inflow difference for inflow
  getInflowDifference(inflow: any): number {
    return (inflow.actual || 0) - (inflow.projection || 0);
  }

  // function to filter expenses
  filterExpenses(): void {
    const month = this.currentDate.getMonth();
    const year = this.currentDate.getFullYear();
    const search = this.searchTerm.toLowerCase();

    this.filteredExpenses = this.expenses.filter(expense => {
      const expenseDate = new Date(expense.date);
      const monthMatch = expenseDate.getMonth() === month && expenseDate.getFullYear() === year;

      if (!monthMatch) return false;

      if (search) {
        return expense.items.some(item => item.name.toLowerCase().includes(search));
      }

      return true;
    });
  }

  // function to apply search filter
  onSearch(): void {
    this.filterExpenses();
  }
  // ==================== EXPENSE DIALOG METHODS ====================

  // function to open form dialog
  openDialog(): void {
    this.isDialogOpen = true;
    document.body.style.overflow = 'hidden';
  }

  // function to close form dialog
  closeDialog(): void {
    this.isDialogOpen = false;
    this.editingExpense = null;
    this.isEditMode = false;
    this.isEntryDateDeleted = false;
    document.body.style.overflow = '';
    this.resetForm();
  }

  // function to close form dialog on overlay click
  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeDialog();
    }
  }

  // function to create new description
  createDescription(desc?: FormDesc): FormGroup {
    return this.form.group({
      name: [desc?.name ?? '', Validators.required],
      amount: [desc?.amount ?? null, Validators.required],
      paid: [desc?.paid ?? false, Validators.required]
    });
  }

  // function to add description
  addDescription(desc?: FormDesc) {
    (this.entryForm.get('description') as FormArray).push(this.createDescription(desc));
  }

  // function to remove description
  removeDescription(index: number) {
    (this.entryForm.get('description') as FormArray).removeAt(index);
  }

  // function to reset entry form
  resetForm(): void {
    this.entryForm.get('date')?.setValue(this.isCurrentDateExist ? '' : new Date());
    (this.entryForm.get('description') as FormArray).clear();
    this.addDescription();
    this.showCompleteForm = !this.isCurrentDateExist;
    this.entryForm.get('date').setErrors(null);
  }

  // funtion to open entry form
  addEntry(): void {
    this.editingExpense = null;
    this.isEditMode = false;
    this.resetForm();
    this.openDialog();
  }

  // function to open entry form in edit mode
  editEntry(expense: any = this.deletedExpense): void {
    if (!expense) {
      return;
    }
    this.editingExpense = expense;
    this.isEditMode = true;

    this.entryForm.get('date').setValue(expense.date.toDate());
    (this.entryForm.get('description') as FormArray).clear();
    expense.description.forEach((desc) => this.addDescription(desc));
    this.openDialog();
  }

  // function to delete entry
  async deleteEntry(expenseId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this expense entry?')) {
      const docData = { delete: true };
      await this.updateExpense(expenseId, docData);
    }
  }

  // function to permanently delete expense entry
  async permanentDeleteEntry(expenseId: string): Promise<void> {
    try {
      await deleteDoc(doc(this.firestore, `expenseplanning/${expenseId}`));
    } catch (error) {
      console.error('Error in Deleting Expense : ', error.message);
    }
  }

  // function to handle entry form click
  async saveEntry(): Promise<void> {
    if (this.entryForm.get('date').invalid || !this.entryForm.get('date').value) {
      alert('Please select a date');
      return;
    }

    const isInvalid: boolean = this.entryForm.get('description').invalid;

    if (isInvalid) {
      alert('Please fill all expense description fields');
      return;
    }

    const entry = this.entryForm.value;

    if (this.editingExpense) {
      if (this.isEntryDateDeleted) {
        const docData = { description: entry.description, delete: false };
        await this.updateExpense(this.editingExpense.docid, docData);
      } else {
        const docData = { description: entry.description };
        await this.updateExpense(this.editingExpense.docid, docData);
      }
    } else {
      await this.addExpense();
    }
    this.closeDialog();
  }

  // function to add new expense 
  async addExpense(): Promise<void> {
    const entry = this.entryForm.value
    const description = entry.description.map(item => ({
      name: item.name.trim(),
      amount: item.amount!,
      paid: item.paid
    }));

    try {
      const docRef = doc(collection(this.firestore, 'expenseplanning'));

      const newEntry = {
        docid: docRef.id,
        date: Timestamp.fromDate(entry.date),
        totalpaid: 0,
        delete: false,
        lastupdatedtime: Timestamp.now(),
        lastupdatedby: this.profile_id,
        entryby: this.profile_id,
        description: description
      };

      await setDoc(docRef, newEntry, { merge: true });
      if (entry.date.toLocaleDateString() === new Date().toLocaleDateString()) {
        this.isCurrentDateExist = true;
      }
      this.closeDialog();
    } catch (error) {
      console.log('Error in adding entry : ', error.message);
    }
  }

  // function to update expense to firebase 
  async updateExpense(docId: string, updatedDoc): Promise<void> {
    const docRef = doc(this.firestore, `expenseplanning/${docId}`);
    const docData = {
      ...updatedDoc,
      lastupdatedby: this.profile_id,
      lastupdatedtime: Timestamp.now()
    };
    try {
      await updateDoc(docRef, docData);
    } catch (error) {
      console.log('Error in updating the doc : ', error.message);
    }
  }

  // ==================== FILTER METHODS ====================

  // function to toggle between month filter to date range filter
  setFilterType(type: 'month' | 'range'): void {
    this.filterType = type;
    this.setCurrentMonth();
    this.loadData();
  }

  // function to set filter to current month
  setCurrentMonth(): void {
    const now = new Date();
    this.startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    this.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.monthyear = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // function to update month filter
  updateDate(): void {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.loadData();
  }

  // function to move month filter to next month
  forwardMonth(): void {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 12 ? month + 1 : 1;
    year = month == 1 ? year + 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.loadData();
  }

  // function to move month filter to previous month
  backwardMonth(): void {
    let year = parseInt(this.monthyear.split('-')[0]);
    let month = parseInt(this.monthyear.split('-')[1]);
    month = month != 1 ? month - 1 : 12;
    year = month == 12 ? year - 1 : year;
    this.startDate = new Date(year, month - 1, 1);
    this.endDate = new Date(year, month, 0);
    this.monthyear = year + "-" + String(month).padStart(2, '0');
    this.loadData();
  }

  // ==================== LOAD DATA ====================

  // Function to toggle between months 
  setInflowMonth(month: 'current' | 'next'): void {
    this.route.navigate([`/expense-planner/${month}`]);
  }

  // Helper function to convert date
  convertToDate(value: any): Date | null {
    if (!value) return null;

    // If it has _seconds (serialized Firestore Timestamp)
    if (value._seconds !== undefined) {
      return new Date(value._seconds * 1000);
    }

    // If it has seconds (Firestore Timestamp structure)
    if (value.seconds !== undefined) {
      return new Date(value.seconds * 1000);
    }

    // If it's a Firestore Timestamp with toDate method
    if (typeof value.toDate === 'function') {
      return value.toDate();
    }

    // If it's already a Date
    if (value instanceof Date) {
      return value;
    }

    // If it's a string or number
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return null;
  }

  // ==================== DATE FORMATTING ====================

  // function  to format day
  formatDay(dateStr: string): string {
    return new Date(dateStr).getDate().toString().padStart(2, '0');
  }

  // function to format month year
  formatMonthYear(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  // ==================== EXPENSE CALCULATIONS PER ROW ====================

  // function to get total planned for an expense 
  getTotalPlanned(expense: any): number {
    return expense.description.reduce((sum, item) => sum + item.amount, 0);
  }

  // function to get total additional paid for an expense 
  getAdditionalPaid(expense: any): number {
    return expense.totalpaid - this.getTotalPlanned(expense);
  }

  // ==================== EXPENSE TABLE ACTIONS ====================

  // function to update paid status
  updatePaidStatus(expenseId: string, itemIndex: number): void {
    const expense = this.expenses.find(e => e.docid === expenseId);
    if (expense && expense.description.length > itemIndex) {
      expense.description[itemIndex].paid = !expense.description[itemIndex].paid;
      const docData = { description: expense.description };
      this.updateExpense(expense.docid, docData);
    }
  }

  // function to update total paid 
  updateTotalPaid(expenseId: string, event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);

    if (isNaN(value) || value < 0) {
      return;
    }
    const expense = this.expenses.find(e => e.docid === expenseId);
    if (expense) {
      const docData = { totalpaid: value };
      this.updateExpense(expense.docid, docData);
    }

    this.showTootipMsg = this.showTootipMsg.filter((id) => id !== expenseId);
    (event.target as HTMLInputElement).blur();
  }

  // function to handel total paid change
  handleTotalPaidChange(expenseId: string, event: Event) {
    const value = parseFloat((event.target as HTMLInputElement).value);

    if ((isNaN(value) || value < 0)) {
      if (this.showTootipMsg.includes(expenseId)) {
        this.showTootipMsg = this.showTootipMsg.filter((id) => id !== expenseId);
      }
    } else if (!this.showTootipMsg.includes(expenseId)) {
      this.showTootipMsg.push(expenseId);
    }

  }


  //getter function to get display month 
  get currentMonthDisplay(): string {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  //getter function to get total planned 
  get totalPlanned(): number {
    return this.expenses.reduce((sum, expense) =>
      sum + expense.description.reduce((descSum, desc) => descSum + desc.amount, 0), 0);
  }

  // getter function to get total paid
  get totalPaid(): number {
    return this.expenses.reduce((sum, expense) => sum + expense.totalpaid, 0);
  }

  // getter function to get inflow map length
  get inflowsMapLength(): number {
    return Object.keys(this.inflowsMap).length;
  }

  // getter function to get additional paid
  get additionalPaid(): number {
    return this.totalPaid - this.totalPlanned;
  }

  // ==================== INFLOW CALCULATIONS ====================

  // getter function to get total projection
  get totalProjection(): number {
    return Object.keys(this.inflowsMap).reduce((sum, inflow) => sum + this.inflowsMap[inflow]['projection'], 0);
  }

  // getter function to get total paid recived
  get totalReceived(): number {
    return Object.keys(this.inflowsMap).reduce((sum, inflow) => sum + this.inflowsMap[inflow]['paid'], 0);
  }

  // getter function to get inflow difference
  get inflowDifference(): number {
    return this.totalReceived - this.totalProjection;
  }

  // getter function to get current day
  get currentDay(): number {
    return new Date().getDate();
  }

  // Function to get current month name
  get currentMonthName(): string {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // getter function to get next month name
  get nextMonthName(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // getter function to get inflow sort
  get inflowSort(): { key: number; value: InflowData }[] {
    return Object.keys(this.inflowsMap)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(key => ({
        key: parseInt(key),
        value: this.inflowsMap[key]
      }));
  }

  // getter function to get descrition
  get description(): FormArray {
    return this.entryForm.get('description') as FormArray;
  }
}