import { Component, Inject } from '@angular/core';
import { DocumentReference, Firestore, doc, docData, collectionData, query, where, collection } from '@angular/fire/firestore';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { DomSanitizer } from '@angular/platform-browser';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CommonModule, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatBottomSheetModule, MatBottomSheet } from '@angular/material/bottom-sheet';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import * as XLSX from 'xlsx';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Per-variable source type
export type VariableSource = 'static' | 'analytics' | 'sheet';

export interface VariableConfig {
  source: VariableSource | null;
  staticValues: string[];
  analyticsKey: string | string[];
  isMulti: boolean;
}

@Component({
  selector: 'app-email-input',
  imports: [
    MatFormFieldModule, MatSelectModule, MatInputModule, MatCardModule,
    MatDividerModule, MatChipsModule, MatTooltipModule, MatTabsModule,
    MatListModule, MatBottomSheetModule, NgIf, FormsModule, MatButtonModule,
    MatIconModule, NgxMatSelectSearchModule, CommonModule, MatCheckboxModule,
    MatButtonToggleModule, MatSnackBarModule, MatProgressSpinnerModule,
  ],
  templateUrl: './email-input.component.html',
  styleUrl: './email-input.component.css'
})
export class EmailInputComponent {

  // ─── Strings ────────────────────────────────────────────────────────────────
  searchCategory = '';
  searchSubCategory = '';
  templateSearchQuery = '';
  queuedEmailSearchQuery = '';
  fileUploadUrl = '';
  customTestEmail = '';
  searchTestRecipient = '';
  uploadedFileUrl = '';
  sheetValidationError = '';
  fromemail = 'starlabs@excellenceinstallation.com';
  searchfromemail = '';
  previewMode: 'desktop' | 'mobile' = 'desktop';

  // ─── Arrays ─────────────────────────────────────────────────────────────────
  templateCategories = [];
  templateSubCategories = [];
  templateArray = [];
  tempTemplateArray = [];
  filteredTemplates = [];
  selectedCategory: string[] = [];
  selectedSubCategory: string[] = [];
  profileList = [];
  queuedEmails = [];
  filteredQueuedEmails = [];
  excelData: any[] = [];
  listedEmails: any[] = [];
  validEmails: any[] = [];
  invalidEmails: any[] = [];
  sheetVariables: string[] = [];
  testEmailRecipients: any[] = [];
  fromEmails: string[] = [
    'starlabs@excellenceinstallation.com',
    'support@intl.soexcellence.com'
  ];
  metaDataFields = ['name', 'phonenumber', 'email', 'participantmode', 'customerstatus', 'financialstatus'];

  // ─── Objects ────────────────────────────────────────────────────────────────
  selectedTemplate: any = {};
  selectedQueuedEmail: any = {};
  mapProfileEmail: any = {};

  /** Per-variable config map */
  variableConfigs: { [variable: string]: VariableConfig } = {};

  bufferDoc: any = {
    profileid: [],
    createdby: null,
    date: new Date(),
    status: 'created',
    subject: '',
    body: '',
    templateid: '',
    broadcastname: '',
    notes: '',
    postmarktemplateid: '',
    postmark_msgid: [],
    emailid: [],
    emailmap: {}
  };

  // ─── Booleans ───────────────────────────────────────────────────────────────
  showPreview = false;
  showRecipients = false;
  showTestEmailDialog = false;
  isLoadingQueuedEmails = true;
  isUploadingFile = false;
  showValidationResults = false;
  isValidatingEmails = false;
  isSheetValid = false;

  categoryCollectionSnapShot: DocumentReference;
  uploadedFile: File | null = null;

  selectedTabIndex = 0;

  /** How many templates to show in grid. Start at 12, expand on "Load more" */
  visibleTemplateCount = 12;

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  private destroy$ = new Subject<void>();

  constructor(
    private firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<EmailInputComponent>,
    private auth: AuthguardService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private bottomSheet: MatBottomSheet,
    private http: HttpClient,
    private snackBar: MatSnackBar,
  ) {
    this.categoryCollectionSnapShot = doc(this.firestore, 'email validators', 'templateCategories');

    docData(this.categoryCollectionSnapShot).pipe(takeUntil(this.destroy$)).subscribe((d: any) => {
      this.templateCategories = d['categories'];
      this.templateSubCategories = d['subcategories'];
    });

    if (this.data.length === 0) { this.selectedTabIndex = 1; }

    if (this.data) {
      this.bufferDoc.profileid = this.data.map((e: any) => e.profileid);
      this.bufferDoc.emailid = this.data.map((e: any) => e.email);
      this.bufferDoc.emailmap = this.data.reduce((acc: any, e: any) => {
        acc[e.email] = e.profileid; return acc;
      }, {});

      const now = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const stamp = `${p(now.getDate())}_${p(now.getMonth() + 1)}_${now.getFullYear()}_${p(now.getHours())}_${p(now.getMinutes())}`;
      this.bufferDoc.broadcastname = this.bufferDoc.profileid.length === 1
        ? `Individual_${stamp}` : `Broadcast_${stamp}`;

      this.auth.getRoles().then((e: any) => this.bufferDoc.createdby = e['profile_ref'].id);
      this.auth.getProfileMap().then((e: any) => this.mapProfileEmail = e.mapEmailData);
      this.fetchTemplates();
      this.fetchProfiles();
      this.fetchQueuedEmails();
    } else {
      this.dialogRef.close();
    }
  }

  ngOnInit(): void { }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Firestore ───────────────────────────────────────────────────────────────

  async fetchTemplates() {
    const q = query(
      collection(this.firestore, 'email templates'),
      where('postmarkstatus', '==', 'approved'),
      where('templatevalidated', '==', true),
      where('templatestatus', '!=', 'rejected'),
      where('type', '==', 'email'),
    );
    collectionData(q).pipe(takeUntil(this.destroy$)).subscribe((templates: any[]) => {
      this.templateArray = [];
      this.tempTemplateArray = [];
      templates.forEach(t => {
        this.templateArray.push(t);
        this.tempTemplateArray.push(t);
      });
      this.filteredTemplates = [...this.templateArray];
      // Reset visible count on fresh load
      this.visibleTemplateCount = 12;
    });
  }

  async fetchProfiles() {
    collectionData(collection(this.firestore, 'profile_data')).pipe(takeUntil(this.destroy$)).subscribe((profiles: any[]) => {
      this.profileList = profiles.map(p => ({
        id: p['profileid'],
        name: p['name'] || p['displayName'] || 'Unknown',
        email: p['email'],
        avatar: p['photoURL'] || null
      }));
    });
  }

  async fetchQueuedEmails() {
    this.isLoadingQueuedEmails = true;
    const q = query(collection(this.firestore, 'email archive'), where('status', '==', 'queued'));
    collectionData(q, { idField: 'docid' }).pipe(takeUntil(this.destroy$)).subscribe((emails: any[]) => {
      this.queuedEmails = emails.map(e => ({
        ...e,
        date: e['date']?.toDate ? e['date'].toDate() : new Date(e['date'])
      }));
      this.filteredQueuedEmails = [...this.queuedEmails];
      this.isLoadingQueuedEmails = false;
    });
  }

  // ─── Template grid pagination ────────────────────────────────────────────────

  /**
   * Return the LAST `visibleTemplateCount` templates from filteredTemplates.
   * When searching, show all matching results (no limit).
   */
  getVisibleTemplates(): any[] {
    if (this.templateSearchQuery.trim()) {
      // Show all search results
      return this.filteredTemplates;
    }
    // Show last N (most recently added)
    return this.filteredTemplates.slice(-this.visibleTemplateCount);
  }

  loadMoreTemplates(): void {
    this.visibleTemplateCount += 12;
  }

  // ─── Variable extraction ─────────────────────────────────────────────────────

  extractVariables(template: string): string[] {
    if (!template) return [];
    const matches = template.match(/{{(.*?)}}/g) || [];
    const vars = matches.map(m => {
      let v = m.replace(/{{|}}/g, '').trim();
      if (v === '.' || v.startsWith('/')) return null;
      if (v.startsWith('#')) v = v.substring(1).trim();
      return v;
    }).filter(v => v !== null && v !== '') as string[];
    return [...new Set(vars)];
  }

  private getHashPrefixedVariables(template: string): Set<string> {
    const regex = /{{#([^}]+)}}/g;
    const set = new Set<string>();
    let m;
    while ((m = regex.exec(template)) !== null) set.add(m[1].trim());
    return set;
  }

  private initVariableConfigs(template: string): void {
    const vars = this.extractVariables(template);
    const hashVars = this.getHashPrefixedVariables(template);
    const next: { [k: string]: VariableConfig } = {};
    vars.forEach(v => {
      next[v] = this.variableConfigs[v] ?? {
        source: null, staticValues: [], analyticsKey: hashVars.has(v) ? [] : '', isMulti: hashVars.has(v)
      };
      next[v].isMulti = hashVars.has(v);
    });
    this.variableConfigs = next;
  }

  ensureConfig(variable: string): VariableConfig {
    if (!this.variableConfigs[variable]) {
      const tpl = this.selectedTemplate['htmlbody'] || '';
      const hashVars = this.getHashPrefixedVariables(tpl);
      this.variableConfigs[variable] = {
        source: null, staticValues: [], analyticsKey: hashVars.has(variable) ? [] : '', isMulti: hashVars.has(variable)
      };
    }
    return this.variableConfigs[variable];
  }

  setVariableSource(variable: string, source: VariableSource): void {
    this.ensureConfig(variable).source = source;
    if (source === 'sheet' && this.uploadedFile) this.validateSheetStructure();
  }

  isVariableConfigured(variable: string): boolean {
    const cfg = this.variableConfigs[variable];
    if (!cfg?.source) return false;
    switch (cfg.source) {
      case 'static': return cfg.staticValues.length > 0;
      case 'analytics':
        return cfg.isMulti
          ? Array.isArray(cfg.analyticsKey) && (cfg.analyticsKey as string[]).length > 0
          : typeof cfg.analyticsKey === 'string' && cfg.analyticsKey.trim().length > 0;
      case 'sheet':
        return this.isSheetValid && this.sheetVariables.some(h => h.includes(variable) || variable.includes(h));
    }
  }

  isVariablesConfigured(): boolean {
    const tpl = this.selectedTemplate['htmlbody'] || '';
    const vars = this.extractVariables(tpl);
    return vars.length === 0 || vars.every(v => this.isVariableConfigured(v));
  }

  configuredCount(): number {
    const tpl = this.selectedTemplate['htmlbody'] || '';
    return this.extractVariables(tpl).filter(v => this.isVariableConfigured(v)).length;
  }

  // ─── Template/queued selection ───────────────────────────────────────────────

  onTemplateChange(template: any): void {
    this.selectedQueuedEmail = {};
    this.selectedTemplate = { ...template, templatedocid: template['docid'] };
    this.bufferDoc.subject = template.subject || '';
    this.bufferDoc.body = template.htmlbody || '';
    this.initVariableConfigs(template.htmlbody || '');
    this.showPreview = true;
    this.selectedTabIndex = 2;
  }

  onQueuedEmailSelect(queuedEmail: any): void {
    this.selectedTemplate = {
      templatealias: queuedEmail.templateid,
      postmarktemplateid: queuedEmail.postmarktemplateid,
      subject: queuedEmail.subject,
      htmlbody: queuedEmail.body,
      docid: queuedEmail.docid,
      templatedocid: queuedEmail.templatedocid
    };
    this.selectedQueuedEmail = queuedEmail;
    this.bufferDoc.subject = queuedEmail.subject || '';
    this.bufferDoc.body = queuedEmail.body || '';
    this.bufferDoc.broadcastname = queuedEmail.broadcastname || '';
    this.bufferDoc.notes = queuedEmail.notes || '';
    this.bufferDoc.templateid = queuedEmail.templateid || '';
    this.bufferDoc.postmarktemplateid = queuedEmail.postmarktemplateid || '';
    this.bufferDoc.profileid = queuedEmail.profileid || [];
    this.initVariableConfigs(queuedEmail.body || '');
    this.showPreview = true;
    this.selectedTabIndex = 2;
  }

  onQueuedEmailSearch(): void {
    if (!this.queuedEmailSearchQuery.trim()) {
      this.filteredQueuedEmails = [...this.queuedEmails]; return;
    }
    const q = this.queuedEmailSearchQuery.toLowerCase();
    this.filteredQueuedEmails = this.queuedEmails.filter(e =>
      e.subject?.toLowerCase().includes(q) ||
      e.broadcastname?.toLowerCase().includes(q) ||
      e.notes?.toLowerCase().includes(q)
    );
  }

  onTemplateSearch(): void {
    if (!this.templateSearchQuery.trim()) {
      this.filteredTemplates = [...this.templateArray]; return;
    }
    const q = this.templateSearchQuery.toLowerCase();
    this.filteredTemplates = this.templateArray.filter(t =>
      t.templatename?.toLowerCase().includes(q) ||
      t.subject?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    );
  }

  async filterTemplate() {
    this.templateArray = this.tempTemplateArray.filter(e =>
      (this.selectedCategory.length ? this.selectedCategory.includes(e.category) : true) &&
      (this.selectedSubCategory.length ? this.selectedSubCategory.includes(e.subcateogry) : true)
    );
    this.filteredTemplates = [...this.templateArray];
    this.visibleTemplateCount = 12;
    this.onTemplateSearch();
  }

  // ─── Chip helpers ─────────────────────────────────────────────────────────────

  addStaticValue(variable: string, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.ensureConfig(variable).staticValues.push(value);
    event.chipInput!.clear();
  }

  removeStaticValue(variable: string, index: number): void {
    this.ensureConfig(variable).staticValues.splice(index, 1);
  }

  // ─── Sheet / file ────────────────────────────────────────────────────────────

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file && this.isExcelFile(file)) {
      this.uploadedFile = file;
      this.sheetValidationError = '';
      this.isSheetValid = false;
      this.processExcelFile(file);
    } else {
      this.snackBar.open('Please select a valid Excel file (.xlsx or .xls)', 'Close', { duration: 3000 });
    }
  }

  private isExcelFile(file: File): boolean {
    return ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
      .includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  }

  private processExcelFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        this.excelData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        this.validateSheetStructure();
      } catch {
        this.snackBar.open('Error processing Excel file', 'Close', { duration: 3000 });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  private validateSheetStructure(): void {
    this.sheetValidationError = '';
    this.isSheetValid = false;
    if (this.excelData.length < 2) {
      this.sheetValidationError = 'Sheet must have at least a header row and one data row'; return;
    }
    const headers = this.excelData[0];
    this.sheetVariables = headers.map((h: any) => h?.trim()).filter((h: any) => h);

    const sheetVars = Object.entries(this.variableConfigs)
      .filter(([, c]) => c.source === 'sheet').map(([v]) => v);
    const missing = sheetVars.filter(v =>
      !this.sheetVariables.some(h => h.includes(v) || v.includes(h))
    );
    if (missing.length) {
      this.sheetValidationError = `Missing columns for: ${missing.join(', ')}`; return;
    }
    this.extractEmails();
    if (!this.listedEmails.length) {
      this.sheetValidationError = 'No "email" column found in sheet.'; return;
    }
    const cnt = this.bufferDoc.profileid.length;
    if (cnt !== this.listedEmails.length) {
      this.sheetValidationError = `Count mismatch: ${cnt} participants vs ${this.listedEmails.length} sheet rows`; return;
    }
    this.validateEmails();
  }

  private async validateEmails(): Promise<void> {
    this.isValidatingEmails = true;
    this.validEmails = [];
    this.invalidEmails = [];
    const existing = new Set<string>();
    this.data.forEach((d: any) => {
      const e = d?.['email'] || d?.['mail'];
      if (e) existing.add(e.trim().toLowerCase());
    });
    for (const email of this.listedEmails) {
      if (this.isValidEmailFormat(email) && existing.has(email.trim().toLowerCase())) {
        this.validEmails.push(email);
      } else {
        this.invalidEmails.push(email);
      }
    }
    this.isSheetValid = this.invalidEmails.length === 0;
    this.sheetValidationError = this.isSheetValid ? '' : `${this.invalidEmails.length} invalid / non-matching emails`;
    this.showValidationResults = true;
    this.isValidatingEmails = false;
  }

  private extractEmails(): void {
    if (this.excelData.length < 2) return;
    const headers = this.excelData[0];
    let idx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]?.toString().toLowerCase().includes('email')) { idx = i; break; }
    }
    if (idx === -1) return;
    this.listedEmails = [];
    for (let i = 1; i < this.excelData.length; i++) {
      if (this.excelData[i][idx]) this.listedEmails.push(this.excelData[i][idx]);
    }
  }

  private isValidEmailFormat(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  removeUploadedFile(): void {
    this.uploadedFile = null;
    this.excelData = [];
    this.showValidationResults = false;
    this.fileUploadUrl = '';
    this.sheetValidationError = '';
    this.isSheetValid = false;
    this.sheetVariables = [];
  }

  async uploadSheet(): Promise<string> {
    if (!this.uploadedFile) return '';
    this.isUploadingFile = true;
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `email-uploads/${Date.now()}_${this.uploadedFile.name}`);
      const snap = await uploadBytes(storageRef, this.uploadedFile);
      const url = await getDownloadURL(snap.ref);
      this.fileUploadUrl = url;
      return url;
    } catch {
      this.snackBar.open('Error uploading file', 'Close', { duration: 3000 });
      return '';
    } finally {
      this.isUploadingFile = false;
    }
  }

  // ─── Data model ──────────────────────────────────────────────────────────────

  private buildDataModel(): any {
    const dataModel: any = {};
    Object.entries(this.variableConfigs).forEach(([variable, cfg]) => {
      switch (cfg.source) {
        case 'static':
          dataModel[variable] = cfg.isMulti ? cfg.staticValues : (cfg.staticValues[0] || '');
          break;
        case 'analytics':
          dataModel[variable] = cfg.analyticsKey;
          break;
        case 'sheet':
          dataModel[variable] = { fromSheet: true };
          break;
      }
    });
    dataModel['_sheetFileUrl'] = this.fileUploadUrl;
    dataModel['_variableConfigs'] = Object.fromEntries(
      Object.entries(this.variableConfigs).map(([k, v]) => [k, v.source])
    );
    return dataModel;
  }

  // ─── Validation & submission ─────────────────────────────────────────────────

  formValidation(): boolean {
    return !(
      this.bufferDoc.subject?.trim().length &&
      this.bufferDoc.body?.trim().length &&
      this.bufferDoc.broadcastname?.trim().length &&
      this.isVariablesConfigured()
    );
  }

  async onSubmit(): Promise<void> {
    if (this.formValidation()) { alert('Please fill in all required fields...'); return; }
    if (confirm('Are you sure to send email to Participants?')) {
      await this.maybeUploadSheet();
      this.closeWithPayload('send');
    }
  }

  async onSendTest(): Promise<void> {
    if (this.formValidation()) { alert('Please fill in all required fields..'); return; }
    if (confirm('Are you sure to send email for validation?')) {
      await this.maybeUploadSheet();
      this.bufferDoc['profileid'] = this.testEmailRecipients.map(e => this.mapProfileEmail[e['email']]?.['profileid'] ?? null);
      this.bufferDoc['emailid'] = this.testEmailRecipients.map(e => e['email']);
      this.bufferDoc['emailmap'] = Object.fromEntries(
        this.testEmailRecipients.map(em => [em['email'], this.mapProfileEmail[em['email']]?.['profileid'] ?? null])
      );
      this.closeWithPayload('send');
    }
  }

  async onAddToQueue(): Promise<void> {
    if (this.formValidation()) { alert('Please fill in all required fields before adding to queue.'); return; }
    if (confirm('Add email to sending queue?')) {
      await this.maybeUploadSheet();
      this.closeWithPayload('queued');
    }
  }

  private async maybeUploadSheet(): Promise<void> {
    const needsSheet = Object.values(this.variableConfigs).some(c => c.source === 'sheet');
    if (needsSheet && this.uploadedFile && !this.fileUploadUrl) await this.uploadSheet();
  }

  private closeWithPayload(status: string): void {
    this.dialogRef.close({
      ...this.bufferDoc,
      body: this.selectedTemplate['htmlbody'] || this.bufferDoc.body,
      subject: this.selectedTemplate['subject'] || this.bufferDoc.subject,
      templateid: this.selectedTemplate['templatealias'] || 'custom',
      notes: this.selectedTemplate['notes'] || '',
      postmarktemplateid: this.selectedTemplate['postmarktemplateid'] || '',
      docid: this.isQueuedEmailSelected()
        ? this.selectedTemplate['docid']
        : doc(collection(this.firestore, 'email archive')).id,
      status,
      templatedocid: this.selectedTemplate['templatedocid'] || this.selectedTemplate['docid'],
      fileUrl: this.fileUploadUrl,
      datamodel: this.buildDataModel(),
      from: this.fromemail,
    });
  }

  // ─── Test email ───────────────────────────────────────────────────────────────

  onShowTestEmailDialog(): void {
    this.showTestEmailDialog = true;
    this.testEmailRecipients = [];
    this.customTestEmail = '';
    this.searchTestRecipient = '';
  }

  onCloseTestEmailDialog(): void {
    this.showTestEmailDialog = false;
    this.testEmailRecipients = [];
    this.customTestEmail = '';
  }

  addTestRecipient(profile: any): void {
    if (!this.testEmailRecipients.find(r => r.email === profile.email))
      this.testEmailRecipients.push(profile);
  }

  addCustomTestEmail(): void {
    if (this.customTestEmail && this.isValidEmail(this.customTestEmail)) {
      if (!this.testEmailRecipients.find(r => r.email === this.customTestEmail)) {
        this.testEmailRecipients.push({ id: 'custom', name: this.customTestEmail, email: this.customTestEmail, avatar: null });
        this.customTestEmail = '';
      }
    }
  }

  removeTestRecipient(index: number): void { this.testEmailRecipients.splice(index, 1); }

  isValidEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  getFilteredProfiles(): any[] {
    const q = this.searchTestRecipient.toLowerCase().trim();
    const list = q
      ? this.profileList.filter((p: any) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      : this.profileList;
    return list.slice(0, 10);
  }

  // ─── Search helpers ───────────────────────────────────────────────────────────

  onSearchCategory() {
    return this.searchCategory
      ? this.templateCategories.filter((e: any) => e.includes(this.searchCategory))
      : this.templateCategories;
  }

  onSearchSubCategory() {
    return this.searchSubCategory
      ? this.templateSubCategories.filter((e: any) => e.includes(this.searchSubCategory))
      : this.templateSubCategories;
  }

  onSearchEmail() {
    return this.searchfromemail
      ? this.fromEmails.filter(e => e.includes(this.searchfromemail))
      : this.fromEmails;
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────────

  sanitizeHTML(html: string) { return this.sanitizer.bypassSecurityTrustHtml(html); }

  isTemplatePresent(): boolean { return Object.keys(this.selectedTemplate).length !== 0; }

  isQueuedEmailSelected(): boolean { return Object.keys(this.selectedQueuedEmail).length !== 0; }

  onCreateTemplate(): void { this.dialogRef.close(); this.router.navigate(['/email-templates']); }

  onShowRecipients(): void { this.showRecipients = !this.showRecipients; }

  onDialogCancel(): void { this.dialogRef.close(); }

  clearFilters(): void {
    this.selectedCategory = [];
    this.selectedSubCategory = [];
    this.templateSearchQuery = '';
    this.searchCategory = '';
    this.searchSubCategory = '';
    this.templateArray = [...this.tempTemplateArray];
    this.filteredTemplates = [...this.templateArray];
    this.visibleTemplateCount = 12;
  }

  getRecipientCount(): number { return this.bufferDoc.profileid.length; }

  getRecipientList(): any[] { return this.data || []; }

  removeCategory(c: string) { this.selectedCategory = this.selectedCategory.filter(x => x !== c); }

  removeSubCategory(s: string) { this.selectedSubCategory = this.selectedSubCategory.filter(x => x !== s); }

  getQueuedEmailDate(date: any): string {
    if (!date) return 'Unknown';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  getQueuedEmailRecipientCount(email: any): number { return email.profileid?.length || 0; }

  getButtonTooltip(buttonType: string): string {
    if (!this.isTemplatePresent()) return 'Please select a template first';
    if (!this.bufferDoc.subject?.trim()) return 'Please enter email subject';
    if (!this.bufferDoc.body?.trim()) return 'Please select a template with content';
    if (!this.bufferDoc.broadcastname?.trim()) return 'Please enter campaign name';
    if (!this.isVariablesConfigured()) return 'Please configure all template variables';
    if (buttonType === 'queue' && this.isQueuedEmailSelected()) return 'Cannot queue an already queued email';
    return '';
  }
}