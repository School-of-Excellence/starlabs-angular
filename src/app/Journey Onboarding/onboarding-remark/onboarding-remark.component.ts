import { Component, Inject, HostListener, ElementRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { AuthguardService } from '../../authguard.service';
import {
  collection, doc, Firestore, getDoc, getDocs, limit, query, where, addDoc, setDoc
} from '@angular/fire/firestore';
import { MatFormFieldModule } from '@angular/material/form-field';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// ── Constants ────────────────────────────────────────────────────────────────
const FIXED_JOURNEY_ID      = 'SOORkBYIzPKbrFEcXzeQ';
const FIXED_TEMPLATE_ALIAS  = 'welcome_to_up_onboarding';
const COL_PARTICIPANT_META  = 'participant metadata';
const COL_EMAIL_ARCHIVE     = 'email archive';
// ─────────────────────────────────────────────────────────────────────────────

export interface Attachment {
  name: string;
  size: number;
  type: string;
  url: string;
  uploadedAt?: number;
}

@Component({
  selector: 'app-onboarding-remark',
  imports: [
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './onboarding-remark.component.html',
  styleUrl: './onboarding-remark.component.css'
})
export class OnboardingRemarkComponent {

  loading: boolean = true;
  attended: boolean;
  continuity: boolean = false;
  upgrade: boolean = false;
  referral: boolean = false;
  addon: boolean = false;

  mapProfile: Object = {};
  mapjourneyname: Object = {};
  mapAppointments: Object = {};
  salesleadsData: Object = {};
  participantjourneyproduct;
  previouseJourneyStatus: string = 'upgraded';
  previousJourney: string = '';
  currentJourney: string = '';
  currentJourneyStatus: string = 'initiated';
  note: string = '';
  generalnote: string = '';
  loggedInProfileId: string;
  selectedTime: string;

  journeystatusOption: Array<string> = [
    'Initiated', 'Ongoing', 'Completed', 'Cancelled',
    'Shifted', 'Upgraded', 'Downgraded', 'Closed Lost'
  ];
  ahmember: Array<any> = [];
  selectedDate;

  // ── Email template state ─────────────────────────────────────────────────
  isFixedJourney: boolean = false;
  emailTemplateLoading: boolean = false;
  emailTemplateError: string = '';
  selectedTemplate: any = null;

  // Template search (non-material custom dropdown)
  templateSearchQuery: string = '';
  templateSearchResults: Array<any> = [];
  allTemplates: Array<any> = [];
  templateDropdownOpen: boolean = false;

  previewHtml: SafeHtml = null;
  rawPreviewHtml: string = '';

  // All available emails
  allParticipantEmails: string[] = [];
  ccEmailsLoading: boolean = false;

  // CC state (custom dropdown)
  ccSearchQuery: string = '';
  ccFilteredEmails: string[] = [];
  selectedCcChips: string[] = [];
  ccDropdownOpen: boolean = false;

  // BCC state (custom dropdown)
  bccSearchQuery: string = '';
  bccFilteredEmails: string[] = [];
  selectedBccChips: string[] = [];
  bccDropdownOpen: boolean = false;

  // Attachments
  templateAttachments: Attachment[] = [];

  // Send state
  emailSending: boolean = false;
  emailSent: boolean = false;

  // ── Checkbox: send onboarding email on submit ────────────────────────────
  sendOnboardingEmail: boolean = false;
  emailArchiveCreating: boolean = false;

  participantEmailProfileMap: Record<string, string> = {};

  // ── Package / Product maps & bonus ───────────────────────────────────────
  mapPackage: Record<string, string> = {};   
  mapProduct: Record<string,Object> = {};  
  mapJourney: Record<string,Object> = {};   
  bonusProducts: string[] = [];
  bonusLoading: boolean = false;
  mailAttachments: Array<Object> = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<any>,
    private dialog: MatDialog,
    private firestore: Firestore,
    public guard: AuthguardService,
    private sanitizer: DomSanitizer,
    private elRef: ElementRef,
  ) {
    this.loading = true;
    this.participantjourneyproduct = data;
    this.participantjourneyproduct['emailsent'] = false;
    this.participantjourneyproduct['onboardedtime'] = ![null, undefined, ''].includes(data['onboardingscheduled'])
      ? data['onboardingscheduled'] : null;

    this.guard.getRoles().then(async roles => {
      this.loggedInProfileId = roles['profile_ref'].id;
    });

    getDocs(query(collection(this.firestore, 'users_roles'), where('ahmember', '==', true))).then(snap => {
      this.ahmember = snap.docs.map(e => e.data());
    });

  }

  async loadPackageAndProductMaps(): Promise<void> {
    try {
      const [packageSnap, productSnap, journeySnap] = await Promise.all([
        getDocs(collection(this.firestore, 'package')),
        getDocs(collection(this.firestore, 'products')),
        getDocs(collection(this.firestore, 'journey')),
      ]);
      packageSnap.docs.forEach(d => {
        this.mapPackage[d.id] = d.data()['package'] || '';
      });
      productSnap.docs.forEach(d => {
        this.mapProduct[d.id] = d.data() || '';
      });
      journeySnap.docs.forEach(j => {
        this.mapJourney[j.id] = j.data() || {};
      })
    } catch (err) {
      console.error('loadPackageAndProductMaps error:', err);
    }
  }

  ngOnInit(): void {
    this.guard.getAppointmentMap().then(data => this.mapAppointments = data);
    this.mapProfile     = this.participantjourneyproduct['mapProfile'];
    this.mapjourneyname = this.participantjourneyproduct['mapJourney'];
    this.loadPackageAndProductMaps();
    if (![null, undefined, ''].includes(this.participantjourneyproduct['salesleadsref'])) {
      getDoc(doc(this.firestore, 'salesleads', this.participantjourneyproduct['salesleadsref'].id)).then(salesleaddoc => {
        if (salesleaddoc.exists()) {
          this.salesleadsData = salesleaddoc.data();
          this.participantjourneyproduct['referral'] = [null, undefined, ''].includes(this.salesleadsData['referral'])
            ? null : this.salesleadsData['referral'];
          this.currentJourney = this.mapjourneyname[this.salesleadsData['journey']];
          if (![null, undefined].includes(this.salesleadsData['previousjourney'])) {
            this.previousJourney = this.mapjourneyname[this.salesleadsData['previousjourney']];
          }
          const journeyId = this.salesleadsData['journeyref']?.id;
          this.isFixedJourney = (journeyId === FIXED_JOURNEY_ID);
          this.isFixedJourney ? this.autoLoadTemplate() : this.loadAllTemplates();
        }
      });
    } else {
      this.isFixedJourney = false;
      this.loadAllTemplates();
    }

    this.loading = false;
    this.setCheckboxStates();
    if (this.participantjourneyproduct['onboarded'] === null) {
      this.participantjourneyproduct['onboarded'] = false;
    }
    if (this.participantjourneyproduct['markonboard'] === true) {
      this.loadParticipantEmails();
    }
  }

  // Close all custom dropdowns when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.closeAllDropdowns();
    }
  }

  closeAllDropdowns() {
    this.templateDropdownOpen = false;
    this.ccDropdownOpen = false;
    this.bccDropdownOpen = false;
  }

  setCheckboxStates() {
    this.continuity = this.participantjourneyproduct['opportunities']?.includes('Continuity');
    this.upgrade    = this.participantjourneyproduct['opportunities']?.includes('Upgrade');
    this.referral   = this.participantjourneyproduct['opportunities']?.includes('Referral');
    this.addon      = this.participantjourneyproduct['opportunities']?.includes('Add-on');
  }

  getCombinedDateTime() {
    if (!this.selectedDate || !this.selectedTime) return null;
    const [hours, minutes] = this.selectedTime.split(':').map(Number);
    const dateTime = new Date(this.selectedDate);
    dateTime.setHours(hours, minutes, 0);
    this.participantjourneyproduct['onboardedtime'] = dateTime;
    return dateTime;
  }

  // ── Template loading ──────────────────────────────────────────────────────

  async autoLoadTemplate() {
    this.emailTemplateLoading = true;
    this.emailTemplateError = '';
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'email templates'),
        where('templatealias', '==', FIXED_TEMPLATE_ALIAS),
        where('active', '==', true),
        limit(1)
      ));
      if (!snap.empty) {
        this.selectedTemplate = { id: snap.docs[0].id, ...snap.docs[0].data() };
        this.mailAttachments = [];
        this.buildPreview();
        this.extractAttachments();
        this.resolveBonusProducts();
      } else {
        this.emailTemplateError = `Template "${FIXED_TEMPLATE_ALIAS}" not found.`;
      }
    } catch (err) {
      console.error('autoLoadTemplate error:', err);
      this.emailTemplateError = 'Failed to load email template.';
    } finally {
      this.emailTemplateLoading = false;
    }
  }

  async loadAllTemplates() {
    try {
      const snap = await getDocs(query(
        collection(this.firestore, 'email templates'),
        where('active', '==', true)
      ));
      this.allTemplates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.templateSearchResults = [...this.allTemplates];
    } catch (err) {
      console.error('loadAllTemplates error:', err);
    }
  }

  // Custom template search dropdown
  onTemplateInputFocus() {
    this.templateDropdownOpen = true;
    this.onTemplateSearchChange();
  }

  onTemplateSearchChange() {
    const q = this.templateSearchQuery?.toLowerCase()?.trim();
    this.templateSearchResults = q
      ? this.allTemplates.filter(t =>
          t.templatename?.toLowerCase().includes(q) || t.templatealias?.toLowerCase().includes(q))
      : [...this.allTemplates];
    this.templateDropdownOpen = this.templateSearchResults.length > 0;
  }

  selectTemplate(template: any, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.selectedTemplate = template;
    this.templateSearchQuery = template.templatename;
    this.templateDropdownOpen = false;
    this.emailSent = false;
    this.bonusProducts   = [];
    this.mailAttachments = [];
    this.buildPreview();
    this.extractAttachments();  
    this.resolveBonusProducts();
  }

  clearTemplate(event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.selectedTemplate = null;
    this.previewHtml = null;
    this.rawPreviewHtml = '';
    this.templateSearchQuery = '';
    this.templateSearchResults = [...this.allTemplates];
    this.templateAttachments = [];
  }

  // async resolveBonusProducts(): Promise<void> {
  //   this.bonusProducts = [];

  //   // Only run if the template actually contains a {{#bonus}} block
  //   const templateHtml: string = this.selectedTemplate?.htmlbody || '';
  //   const hasBonusParam = /\{\{#bonus\}\}/i.test(templateHtml);
  //   if (!hasBonusParam) return;

  //   this.bonusLoading = true;
  //   try {
  //     const participantProducts: any[] = this.participantjourneyproduct['participantproducts'] || [];

  //     const bonusNames: string[] = [];
  //     const bonusAttachments: object[] = [];

  //     for (const pp of participantProducts) {
  //       const packageRefId: string = pp['packageref']?.id || '';
  //       if (!packageRefId) continue;

  //       // Check if this package is 'Bonus' using the pre-built map
  //       const packageName = this.mapPackage[packageRefId] || '';
  //       if (packageName.toLowerCase() !== 'bonus') continue;

  //       // Resolve product name from the pre-built product map
  //       const productRefId: string = pp['productref']?.id || '';
  //       if (!productRefId) continue;

  //       const productName = this.mapProduct[productRefId]['product'] || '';
  //       bonusAttachments.push(this.mapProduct[productRefId]['attachments'] || []);
  //       if (productName && !bonusNames.includes(productName)) {
  //         bonusNames.push(productName);
  //       }
  //     }
  //     const journeyAttchements = this.mapJourney[this.participantjourneyproduct['journeyref']?.id]['attachments'] || []
  //     this.mailattachments = [...this.mailattachments, ...bonusAttachments];
  //     this.mailattachments.push(journeyAttchements);
  //     this.bonusProducts = bonusNames;
  //     console.log('Attachments',this.mailattachments);
      
  //   } catch (err) {
  //     console.error('resolveBonusProducts error:', err);
  //   } finally {
  //     this.bonusLoading = false;
  //     this.buildPreview();
  //   }
  // }

  async resolveBonusProducts(): Promise<void> {
    this.bonusProducts = [];

    const templateHtml: string = this.selectedTemplate?.htmlbody || '';
    const hasBonusParam = /\{\{#bonus\}\}/i.test(templateHtml);

    this.bonusLoading = true;
    try {
      const participantProducts: any[] = this.participantjourneyproduct['participantproducts'] || [];
      const bonusNames: string[] = [];

      // ── Journey attachments ──────────────────────────────────────────────
      const journeyId = this.participantjourneyproduct['journeyref']?.id;
      if (journeyId && this.mapJourney[journeyId]) {
        const journeyData = this.mapJourney[journeyId] as any;
        const journeyAttachments: any[] = Array.isArray(journeyData['attachments'])
          ? journeyData['attachments'] : [];
        journeyAttachments.forEach((att, i) => {
          if (!att) return;
          const alreadyAdded = (this.mailAttachments as any[]).find(a => a['url'] === att.url);
          if (!alreadyAdded) {
            (this.mailAttachments as any[]).push({
              ...att,
              _source: 'journey',
              _id: `journey_${i}_${Date.now()}`,
            });
          }
        });
      }

      for (const pp of participantProducts) {
        const packageRefId: string = pp['packageref']?.id || '';
        if (!packageRefId) continue;

        const packageName: string = (this.mapPackage[packageRefId] || '').toLowerCase();
        const productRefId: string = pp['productref']?.id || '';
        if (!productRefId) continue;

        const productData = this.mapProduct[productRefId] as any;
        if (!productData) continue;

        const productName: string = productData['product'] || '';
        const productAttachments: any[] = Array.isArray(productData['attachments'])
          ? productData['attachments'] : [];

        // ── Bonus ────────────────────────────────────────────────────────
        if (packageName === 'bonus') {
          if (hasBonusParam && productName && !bonusNames.includes(productName)) {
            bonusNames.push(productName);
          }
          productAttachments.forEach((att, i) => {
            if (!att) return;
            const alreadyAdded = (this.mailAttachments as any[]).find(a => a['url'] === att.url);
            if (!alreadyAdded) {
              (this.mailAttachments as any[]).push({
                ...att,
                _source: 'bonus',
                _id: `bonus_${productRefId}_${i}_${Date.now()}`,
              });
            }
          });
        }

        // ── Addon: only when journeyref is null/undefined ────────────────
        if (packageName === 'add-on' || packageName === 'addon') {
          const hasJourney = ![null, undefined, ''].includes(
            this.participantjourneyproduct['journeyref']
          );
          if (!hasJourney) {
            productAttachments.forEach((att, i) => {
              if (!att) return;
              const alreadyAdded = (this.mailAttachments as any[]).find(a => a['url'] === att.url);
              if (!alreadyAdded) {
                (this.mailAttachments as any[]).push({
                  ...att,
                  _source: 'addon',
                  _id: `addon_${productRefId}_${i}_${Date.now()}`,
                });
              }
            });
          }
        }
      }

      this.bonusProducts = bonusNames;
      // Replace reference so Angular detects the change
      this.mailAttachments = [...this.mailAttachments];

      console.log('mailAttachments final:', this.mailAttachments);
    } catch (err) {
      console.error('resolveBonusProducts error:', err);
    } finally {
      this.bonusLoading = false;
      this.buildPreview();
    }
  } 

  // ── Attachments ───────────────────────────────────────────────────────────

  extractAttachments() {
    if (!this.selectedTemplate) { this.templateAttachments = []; return; }
    const raw = this.selectedTemplate.attachments;
    this.templateAttachments = Array.isArray(raw) && raw.length > 0 ? raw as Attachment[] : [];

    this.templateAttachments.forEach((att, i) => {
      const alreadyAdded = (this.mailAttachments as any[]).find(
        (a: any) => a['url'] === att.url && a['_source'] === 'template'
      );
      if (!alreadyAdded) {
        (this.mailAttachments as any[]).push({
          ...att,
          _source: 'template',
          _id: `template_${i}_${Date.now()}`,
        });
      }
    });
    console.log('mailAttachments after extractAttachments:', this.mailAttachments);
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  getFileIcon(type: string): string {
    if (!type) return 'insert_drive_file';
    if (type.includes('pdf'))   return 'picture_as_pdf';
    if (type.includes('image')) return 'image';
    if (type.includes('word') || type.includes('document')) return 'description';
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'table_chart';
    if (type.includes('zip') || type.includes('rar')) return 'folder_zip';
    return 'insert_drive_file';
  }

  getFileIconColor(type: string): string {
    if (!type) return 'icon-default';
    if (type.includes('pdf'))   return 'icon-pdf';
    if (type.includes('image')) return 'icon-image';
    if (type.includes('word') || type.includes('document')) return 'icon-word';
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'icon-sheet';
    if (type.includes('zip') || type.includes('rar')) return 'icon-zip';
    return 'icon-default';
  }

  // ── Preview builder ───────────────────────────────────────────────────────
  buildPreview() {
    if (!this.selectedTemplate) return;
    const participantName = this.getParticipantName();
    let html: string = this.selectedTemplate.htmlbody || '';

    // ── Compute bonus text once ─────────────────────────────────────────────
    const getBonusText = () => {
      if (this.bonusLoading) return `<span style="color:#9aa0a6;font-style:italic;">Loading…</span>`;
      if (this.bonusProducts.length === 0) return '-';
      if (this.bonusProducts.length === 1) return this.bonusProducts[0];
      if (this.bonusProducts.length === 2) return `${this.bonusProducts[0]} and ${this.bonusProducts[1]}`;
      return `${this.bonusProducts.slice(0, -1).join(', ')}, and ${this.bonusProducts[this.bonusProducts.length - 1]}`;
    };

    // ── Triple-brace {{{bonustext}}} ────────────────────────────────────────
    html = html.replace(/\{\{\{bonustext\}\}\}/gi, getBonusText);

    // ── Triple-brace {{{bonus}}} ────────────────────────────────────────────
    html = html.replace(/\{\{\{bonus\}\}\}/gi, getBonusText);

    // ── Block {{#bonus}}...{{/bonus}} — replace entire block with inline text
    html = html.replace(/\{\{#bonus\}\}([\s\S]*?)\{\{\/bonus\}\}/gi, getBonusText);

    // ── Scalar replacements ─────────────────────────────────────────────────
    html = html.replace(/\{\{name\}\}/gi, `<strong>${participantName}</strong>`);
    html = html.replace(/\{\{participantname\}\}/gi, `<strong>${participantName}</strong>`);
    html = html.replace(/\{\{journey\}\}/gi, this.currentJourney || '');
    html = html.replace(/\{\{journeyname\}\}/gi, this.currentJourney || '');

    // ── Highlight remaining unresolved variables ────────────────────────────
    html = html.replace(/\{\{(\w+)\}\}/g, (_, v) =>
      `<span style="background:#fff3e0;color:#e65100;border-radius:3px;padding:0 3px;font-family:monospace;font-size:11px;">{{${v}}}</span>`
    );

    this.rawPreviewHtml = html;
    this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(html);
  }

  getParticipantName(): string {
    const id = this.participantjourneyproduct['profileid'];
    if ([null, undefined, ''].includes(id)) return 'Participant';
    const name = this.mapProfile[id];
    return [null, undefined, ''].includes(name) ? 'Participant' : name;
  }

  // ── Participant emails ─────────────────────────────────────────────────────
  async loadParticipantEmails() {
    this.ccEmailsLoading = true;
    try {
      const snap = await getDocs(collection(this.firestore, COL_PARTICIPANT_META));

      const emails: string[] = [];

      snap.docs.forEach(d => {
        const data = d.data();
        const pid: string = data['profileid'] || '';

        ['email', 'alternativeemail', 'workemail', 'personalemail', 'officeemail'].forEach(field => {
          const val = data[field];
          if (val && typeof val === 'string' && val.includes('@')) {
            // Build the email → profileId map for archive use
            if (!this.participantEmailProfileMap[val]) {
              this.participantEmailProfileMap[val] = pid;
            }
            // Collect unique emails for the dropdown
            if (!emails.includes(val)) {
              emails.push(val);
            }
          }
        });
      });

      this.allParticipantEmails = emails;
      this.ccFilteredEmails     = [...emails];
      this.bccFilteredEmails    = [...emails];
    } catch (err) {
      console.error('loadParticipantEmails error:', err);
    } finally {
      this.ccEmailsLoading = false;
    }
  }

  // ── CC custom dropdown ────────────────────────────────────────────────────

  onCcInputFocus(event: MouseEvent) {
    event.stopPropagation();
    this.bccDropdownOpen = false;
    this.templateDropdownOpen = false;
    this.ccDropdownOpen = true;
    this.onCcSearchChange();
  }

  onCcSearchChange() {
    const q = this.ccSearchQuery?.toLowerCase()?.trim();
    this.ccFilteredEmails = (q
      ? this.allParticipantEmails.filter(e => e.toLowerCase().includes(q))
      : [...this.allParticipantEmails]
    ).filter(e => !this.selectedCcChips.includes(e));
  }

  addCcEmail(email: string, event?: MouseEvent) {
    if (event) event.stopPropagation();
    if (!email || this.selectedCcChips.includes(email)) return;
    this.selectedCcChips = [...this.selectedCcChips, email];
    this.ccSearchQuery = '';
    this.ccDropdownOpen = false;
    this.onCcSearchChange();
  }

  removeCcChip(email: string) {
    this.selectedCcChips = this.selectedCcChips.filter(e => e !== email);
    this.onCcSearchChange();
  }

  // ── BCC custom dropdown ───────────────────────────────────────────────────

  onBccInputFocus(event: MouseEvent) {
    event.stopPropagation();
    this.ccDropdownOpen = false;
    this.templateDropdownOpen = false;
    this.bccDropdownOpen = true;
    this.onBccSearchChange();
  }

  onBccSearchChange() {
    const q = this.bccSearchQuery?.toLowerCase()?.trim();
    this.bccFilteredEmails = (q
      ? this.allParticipantEmails.filter(e => e.toLowerCase().includes(q))
      : [...this.allParticipantEmails]
    ).filter(e => !this.selectedBccChips.includes(e));
  }

  addBccEmail(email: string, event?: MouseEvent) {
    if (event) event.stopPropagation();
    if (!email || this.selectedBccChips.includes(email)) return;
    this.selectedBccChips = [...this.selectedBccChips, email];
    this.bccSearchQuery = '';
    this.bccDropdownOpen = false;
    this.onBccSearchChange();
  }

  removeBccChip(email: string) {
    this.selectedBccChips = this.selectedBccChips.filter(e => e !== email);
    this.onBccSearchChange();
  }

  // ── Email Archive ─────────────────────────────────────────────────────────

  private buildBroadcastName(emailTo: string[]): string {
    const now = new Date();
    const day     = String(now.getDate()).padStart(2, '0');
    const month   = String(now.getMonth() + 1).padStart(2, '0');
    const year    = now.getFullYear();
    const hours   = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const prefix  = emailTo.length === 1 ? 'Individual' : 'Broadcast';
    return `${prefix}_${day}_${month}_${year}_${hours}_${minutes}_${seconds}`;
  }

  async createEmailArchive(): Promise<void> {
    if (!this.selectedTemplate) return;

    const participantDocId = this.participantjourneyproduct['id']
      || this.participantjourneyproduct['docid']
      || this.participantjourneyproduct['participantjourneyproductid']
      || null;

    const profileId = this.participantjourneyproduct['profileid'] || '';

    // Primary recipient — first email whose profileId matches this participant
    const primaryEmail = Object.entries(this.participantEmailProfileMap).find(([, pid]) => pid === profileId)?.[0] || null;

    const emailTo: string[] = primaryEmail ? [primaryEmail] : [];

    const broadcastName = this.buildBroadcastName(emailTo);

    const emailMap: Record<string, string> = {};

    // Include primary participant's email(s)
    Object.entries(this.participantEmailProfileMap).filter(([, pid]) => pid === profileId).forEach(([email, pid]) => { emailMap[email] = pid; });

    // CC
    this.selectedCcChips.forEach(email => {
      emailMap[email] = this.participantEmailProfileMap[email] || email;
    });

    // BCC
    this.selectedBccChips.forEach(email => {
      emailMap[email] = this.participantEmailProfileMap[email] || email;
    });

    // ── Attachments only on `attachments`, postmarkAttachments stays empty ──
    // const attachments = this.templateAttachments.length > 0 ? this.templateAttachments : [];
    const attachments = (this.mailAttachments as any[]).map(a => ({
      name: a['name'],
      size: a['size'] || null,
      type: a['type'],
      url:  a['url'],
      uploadedAt: a['uploadedAt'] || null,
    }));
    const archiveRef = doc(collection(this.firestore, COL_EMAIL_ARCHIVE));
    const docid = archiveRef.id;

    const map: Record<string, any> = {
      docid,
      body: this.selectedTemplate.htmlbody || null,
      broadcastname: broadcastName,
      createdby: this.loggedInProfileId || 'automated',
      datamodel: {
        name: this.getParticipantName(),
        journey: this.currentJourney || null,
        bonus:   this.bonusProducts.length > 0 ? this.bonusProducts.map(value => ({ value })) : [],
      },
      attachments: attachments,
      date: new Date(),
      emailid: emailTo,
      emailmap: emailMap,
      cc: this.selectedCcChips.join(', '),
      bcc:  this.selectedBccChips.join(', '),
      fileUrl: null,
      from: 'starlabs@excellenceinstallation.com',
      notes: this.note || null,
      postmarktemplateid: this.selectedTemplate.postmarktemplateid || null,
      profileid: [profileId],
      sent: [],
      status: 'send',
      servername: this.selectedTemplate.servername || null,
      subject: this.selectedTemplate.subject || null,
      templatedocid: this.selectedTemplate.docid || this.selectedTemplate.id || null,
      templateid: this.selectedTemplate.templateid || this.selectedTemplate.templatealias || null,
      variableoption: 'automated',
      participantjourneyproductid: participantDocId,
      type: 'onboarding',
      metadata: {
        participantjourneyproductid: participantDocId,
        journeytype: this.participantjourneyproduct['journeytype'] || null,
        onboardedby: this.participantjourneyproduct['onboardedby'] || null,
      },
    };
    console.log("EMail Archive",map);
    
    await setDoc(archiveRef, map);
    console.log('Email Archive Created:', docid, '| emailMap:', emailMap);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  get canSendEmail(): boolean {
    return !!this.selectedTemplate && !this.emailSent && !this.emailSending;
  }

  validateOnboard() {
    let disabled = false;
    if (this.participantjourneyproduct['onboarded']) {
      if (this.participantjourneyproduct['onboardedby']?.length == 0) disabled = true;
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }
    if ([null, undefined, ''].includes(this.participantjourneyproduct['appointmentid'])) {
      if ([null, undefined, ''].includes(this.selectedTime) || [null, undefined].includes(this.selectedDate)) disabled = true;
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }
    if (!this.participantjourneyproduct['onboarded']) {
      disabled = this.participantjourneyproduct['emailsent'] ? false : true;
    }
    disabled = [null, undefined, ''].includes(this.participantjourneyproduct['referral']) ? true : false;
    return disabled;
  }

  // ── Send preview email (right panel button) ───────────────────────────────

  async sendEmail() {
    if (!this.canSendEmail) return;
    this.emailSending = true;
    try {
      await this.createEmailArchive();
      this.emailSent = true;
      this.participantjourneyproduct['emailsent'] = true;
    } catch (err) {
      console.error('Email archive creation failed:', err);
      alert('Failed to queue email. Please try again.');
    } finally {
      this.emailSending = false;
    }
  }

  // ── Submit (with optional email archive creation) ─────────────────────────

  async onSubmit() {
    const confirmMsg = this.participantjourneyproduct['onboarded']
      ? 'Are you sure the Participant is Onboarded'
      : 'Are you sure this Participant is not Onboarded';

    if (!confirm(confirmMsg)) return;

    // If checkbox is ticked, create the email archive first
    if (this.sendOnboardingEmail && this.selectedTemplate  && !this.emailSent) {
      this.emailArchiveCreating = true;
      try {
        await this.createEmailArchive();
        this.participantjourneyproduct['emailsent'] = true;
      } catch (err) {
        console.error('Email archive creation failed:', err);
        alert('Failed to queue email archive. Proceeding without email.');
      } finally {
        this.emailArchiveCreating = false;
      }
    }

    // Build submit value (same as before)
    let value: any = { opportunities: [] };

    if (![null, undefined].includes(this.participantjourneyproduct)) {
      this.participantjourneyproduct['onboardingreportlog'] = [];

      if (!this.participantjourneyproduct['onboarded']) {
        value.onboardedby = []; value.onboardedtime = null; value.appointmentid = null; value.onboardingscheduled = null;
      } else if (
        this.participantjourneyproduct['onboarded'] &&
        ![null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) &&
        ![null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])
      ) {
        value.onboardedby   = this.data['onboardedby'];
        value.onboardedtime = this.data['onboardedtime'];
        value.appointmentid = this.participantjourneyproduct['appointmentid'];
      } else if (
        this.participantjourneyproduct['onboarded'] &&
        [null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) &&
        [null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])
      ) {
        value.onboardedby   = this.participantjourneyproduct['onboardedby'];
        value.onboardedtime = this.participantjourneyproduct['onboardedtime'];
      }

      value.onboarded           = true;
      value.onboardingreport    = ![null, undefined, ''].includes(this.note) ? this.note : null;
      value.referral            = this.participantjourneyproduct['referral'];
      value.onboardingreportlog = [{ updated: new Date(), report: this.note || null }];

      if (this.continuity) value.opportunities.push('Continuity');
      if (this.upgrade)    value.opportunities.push('Upgrade');
      if (this.referral)   value.opportunities.push('Referral');
      if (this.addon)      value.opportunities.push('Add-on');

      this.salesleadsData['referral'] = this.participantjourneyproduct['referral']?.toLowerCase() === 'yes';
      value.salesleadsData = JSON.parse(JSON.stringify(this.salesleadsData));
      value.journeytype    = this.participantjourneyproduct['journeytype'] || null;

      this.dialogRef.close(value);
    }
  }

  // ── Existing form actions ─────────────────────────────────────────────────

  async onmark() { this.dialogRef.close({ attended: this.attended }); }

  onEdit() {
    let value: any = { opportunities: [] };
    if (this.continuity) value.opportunities.push('Continuity');
    if (this.upgrade)    value.opportunities.push('Upgrade');
    if (this.referral)   value.opportunities.push('Referral');
    if (this.addon)      value.opportunities.push('Add-on');
    value.onboardingreport    = this.participantjourneyproduct['onboardingreport'];
    value.onboardingreportlog = this.participantjourneyproduct['onboardingreportlog'] || [];
    if (this.participantjourneyproduct['onboardingreport'] !== value.onboardingreport) {
      value.onboardingreportlog.push({ updated: new Date(), report: this.participantjourneyproduct['onboardingreport'] });
    }
    this.dialogRef.close(value);
  }

  addnotes() {
    this.dialogRef.close({ note: this.generalnote, updatedby: this.loggedInProfileId, updated: new Date() });
  }

  removeMailAttachment(id: string) {
    this.mailAttachments = this.mailAttachments.filter((a: any) => a['_id'] !== id);
  }

  onAddAttachment(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const existing = this.mailAttachments as any[];
        // Avoid duplicates by name
        if (existing.find(a => a.name === file.name)) return;
        existing.push({
          name:     file.name,
          size:     file.size,
          type:     file.type,
          url:      reader.result as string,   // data URL for preview
          _source:  'manual',
          _id:      `manual_${file.name}_${Date.now()}`,
        });
        // Trigger CD — replace reference so Angular detects change
        this.mailAttachments = [...existing];
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-added after removal
    input.value = '';
  }

  getSourceBadge(source: string): string {
    const map: Record<string, string> = {
      template: 'Template',
      journey: 'Journey',
      bonus:   'Bonus',
      addon:   'Add-on',
      manual:  'Added',
    };
    return map[source] || '';
  }

  getSourceBadgeColor(source: string): string {
    const map: Record<string, string> = {
      template: '#00796b',
      journey: '#1565c0',
      bonus:   '#7b1fa2',
      addon:   '#e65100',
      manual:  '#2e7d32',
    };
    return map[source] || '#546e7a';
  }

  closeDialog() { this.dialogRef.close(); }
}
// import { Component, Inject } from '@angular/core';
// import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
// import { AuthguardService } from '../../authguard.service';
// import { addDoc, collection, collectionSnapshots, deleteDoc, doc, Firestore, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, updateDoc, where, writeBatch } from '@angular/fire/firestore';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { CommonModule } from '@angular/common';
// import { MatInputModule } from '@angular/material/input';
// import { MatSelectModule } from '@angular/material/select';
// import { FormsModule } from '@angular/forms';
// import { MatRadioModule } from '@angular/material/radio';
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
// import { MatIconModule } from '@angular/material/icon';
// import { MatButtonModule } from '@angular/material/button';
// import { MatDatepickerModule } from '@angular/material/datepicker';
// import { MatChipsModule } from '@angular/material/chips';

// @Component({
//   selector: 'app-onboarding-remark',
//   imports: [
//     MatFormFieldModule,
//     CommonModule,
//     MatInputModule,
//     MatSelectModule,
//     FormsModule,
//     MatRadioModule,
//     MatProgressSpinnerModule,
//     MatIconModule,
//     MatButtonModule,
//     MatDatepickerModule,
//     MatChipsModule
//   ],
//   templateUrl: './onboarding-remark.component.html',
//   styleUrl: './onboarding-remark.component.css'
// })
// export class OnboardingRemarkComponent {
//   loading: boolean = true;
//   attended: boolean;
//   isChecked: boolean = false;
//   continuity: boolean = false;
//   upgrade: boolean = false;
//   referral: boolean = false;
//   addon: boolean = false;

//   mapProfile: Object = {};
//   // mapphone: Object = {};
//   mapjourneyname: Object = {};
//   mapAppointments: Object = {};
//   salesleadsData: Object = {};
//   participantjourneyproduct;
//   previouseJourneyStatus: string = "upgraded";
//   previousJourney: string = "";
//   currentJourney: string = "";
//   currentJourneyStatus: string = "initiated";
//   note: string = "";
//   generalnote: string = "";
//   loggedInProfileId: string;
//   selectedTime: string;

//   journeystatusOption: Array<string> = ['Initiated', 'Ongoing', 'Completed', 'Cancelled', 'Shifted', 'Upgraded', 'Downgraded', 'Closed Lost'];
//   ahmember: Array<any> = [];

//   selectedDate;


//   constructor(
//     @Inject(MAT_DIALOG_DATA) public data: any,
//     public dialogRef: MatDialogRef<any>,
//     private dialog: MatDialog,
//     private firestore: Firestore,
//     public guard: AuthguardService,
//   ) {
//     this.loading = true;
//     this.participantjourneyproduct = data;
//     this.participantjourneyproduct['emailsent'] = false;
//     this.participantjourneyproduct['onboardedtime'] = ![null, undefined, ''].includes(data['onboardingscheduled']) ? data['onboardingscheduled'] : null
//     this.guard.getRoles().then(async roles => {
//       this.loggedInProfileId = roles['profile_ref'].id
//     });
//     getDocs(query(collection(this.firestore, "users_roles"), where('ahmember', '==', true))).then(snap => {
//       this.ahmember = snap.docs.map(e => e.data())
//     });

//   }

//   ngOnInit(): void {

//     this.guard.getAppointmentMap().then(data => this.mapAppointments = data);
//     this.mapProfile = this.participantjourneyproduct['mapProfile'];
//     // this.mapphone = this.participantjourneyproduct['mapPhone'];
//     this.mapjourneyname = this.participantjourneyproduct['mapJourney'];

//     if (![null, undefined, ''].includes(this.participantjourneyproduct['salesleadsref'])) {
//       getDoc(doc(this.firestore, "salesleads", this.participantjourneyproduct['salesleadsref'].id)).then((salesleaddoc) => {
//         if (salesleaddoc.exists()) {
//           this.salesleadsData = salesleaddoc.data();
//           this.participantjourneyproduct['referral'] = [null, undefined, ""].includes(this.salesleadsData['referral']) ? null : this.salesleadsData['referral'];
//           this.currentJourney = this.mapjourneyname[this.salesleadsData['journey']];
//           if (![null, undefined].includes(this.salesleadsData['previousjourney'])) {
//             this.previousJourney = this.mapjourneyname[this.salesleadsData['previousjourney']]
//           }
//         }
//       });
//     }

//     this.loading = false;
//     this.setCheckboxStates();
//     if (this.participantjourneyproduct['onboarded'] === null) {
//       this.participantjourneyproduct['onboarded'] = false; // Set default to false
//     }
//   }

//   setCheckboxStates() {
//     this.continuity = this.participantjourneyproduct['opportunities']?.includes('Continuity');
//     this.upgrade = this.participantjourneyproduct['opportunities']?.includes('Upgrade');
//     this.referral = this.participantjourneyproduct['opportunities']?.includes('Referral');
//     this.addon = this.participantjourneyproduct['opportunities']?.includes('Add-on');
//   }

//   getCombinedDateTime() {
//     if (!this.selectedDate || !this.selectedTime) return null;

//     const [hours, minutes] = this.selectedTime.split(':').map(Number);
//     const dateTime = new Date(this.selectedDate);
//     dateTime.setHours(hours, minutes, 0);
//     console.log("DATE TIME", dateTime);
//     this.participantjourneyproduct['onboardedtime'] = dateTime;
//     console.log(this.participantjourneyproduct['onboardedtime']);

//     return dateTime;
//   }

//   validateOnboard() {
//     let disabled = false;

//     if (this.participantjourneyproduct['onboarded']) {
//       if (this.participantjourneyproduct['onboardedby']?.length == 0) {
//         disabled = true;
//       }
//       disabled = this.participantjourneyproduct['emailsent'] ? false : true;
//     }

//     if ([null, undefined, ''].includes(this.participantjourneyproduct['appointmentid'])) {
//       if ([null, undefined, ''].includes(this.selectedTime) || [null, undefined].includes(this.selectedDate)) {
//         disabled = true;
//       }
//       disabled = this.participantjourneyproduct['emailsent'] ? false : true;
//     }

//     if (!this.participantjourneyproduct['onboarded']) {
//       disabled = this.participantjourneyproduct['emailsent'] ? false : true;
//     }

//     disabled = [null, undefined, ""].includes(this.participantjourneyproduct['referral']) ? true : false;

//     return disabled
//   }

//  onSubmit() {
//     console.log('Submit');

//     let check = confirm(this.participantjourneyproduct['onboarded'] ? "Are you sure the Participant is Onboarded" : "Are you sure this Participant is not Onboarded");

//     if (check) {
//       let value = {
//         'opportunities': []
//       }
//       if (![null, undefined].includes(this.participantjourneyproduct)) {
//         this.participantjourneyproduct['onboardingreportlog'] = [];
//         if (!this.participantjourneyproduct['onboarded']) {
//           value['onboardedby'] = [];
//           value['onboardedtime'] = null;
//           value['appointmentid'] = null;
//           value['onboardingscheduled'] = null;
//         } else if (this.participantjourneyproduct['onboarded'] && ![null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) && ![null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])) {
//           value['onboardedby'] = this.data['onboardedby']
//           value['onboardedtime'] = this.data['onboardedtime'];
//           value['appointmentid'] = this.participantjourneyproduct['appointmentid'];
//         } else if (this.participantjourneyproduct['onboarded'] && [null, undefined, ''].includes(this.participantjourneyproduct['appointmentid']) && [null, undefined, ''].includes(this.participantjourneyproduct['onboardingscheduled'])) {
//           value['onboardedby'] = this.participantjourneyproduct['onboardedby'];
//           value['onboardedtime'] = this.participantjourneyproduct['onboardedtime'];
//         }
//         value['onboarded'] = true
//         value['onboardingreport'] = ![null, undefined, ''].includes(this.note) ? this.note : null;
//         value['referral'] = this.participantjourneyproduct['referral'];
//         // value['journeystatus'] = 'ongoing';
//         value['onboardingreportlog'] = [{
//           updated: new Date(),
//           report: this.note || null
//         }];

//         if (this.continuity) value['opportunities'].push('Continuity');
//         if (this.upgrade) value['opportunities'].push('Upgrade');
//         if (this.referral) value['opportunities'].push('Referral');
//         if (this.addon) value['opportunities'].push('Add-on');
        
//         this.salesleadsData['referral'] = this.participantjourneyproduct['referral'].toLowerCase() == 'Yes' ? true : false ;
//         value['salesleadsData'] = JSON.parse(JSON.stringify(this.salesleadsData));
//         value['journeytype'] = this.participantjourneyproduct['journeytype'] || null
        
//         this.dialogRef.close(value);
//       }

//     } else {
//       console.log("Not Confirmed");
//     }
//   }

//   async onmark() {
//     let value = {}
//     value['attended'] = this.attended
//     console.log(value['attended']);
//     this.dialogRef.close(value)
//   }

//   onEdit() {
//     let value = {}
//     value['opportunities'] = [];
//     if (this.continuity) value['opportunities'].push('Continuity');
//     if (this.upgrade) value['opportunities'].push('Upgrade');
//     if (this.referral) value['opportunities'].push('Referral');
//     if (this.addon) value['opportunities'].push('Add-on');
//     value['onboardingreport'] = this.participantjourneyproduct['onboardingreport']
//     value['onboardingreportlog'] = this.participantjourneyproduct['onboardingreportlog'] || []
//     if (this.participantjourneyproduct['onboardingreport'] !== value['onboardingreport']) {
//       value['onboardingreportlog'].push({
//         updated: new Date(),
//         report: this.participantjourneyproduct['onboardingreport']
//       });
//     }
//     this.dialogRef.close(value)
//   }

//   addnotes() {

//     var generalnotes = {
//       note: this.generalnote,
//       updatedby: this.loggedInProfileId,
//       updated: new Date()
//     }
//     this.dialogRef.close(generalnotes)
//   }

//   closeDialog() {
//     this.dialogRef.close()
//   }

// }
