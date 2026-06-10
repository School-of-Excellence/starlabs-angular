import {Component, inject, OnInit, OnDestroy, Inject, ChangeDetectorRef} from '@angular/core';
import { CommonModule } from '@angular/common';
import {ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule} from '@angular/forms';
import {collection, doc, Firestore, getDocs, setDoc, updateDoc, serverTimestamp, query, where, arrayUnion, limit, getDoc} from '@angular/fire/firestore';
import { Storage, ref as sref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { AuthguardService } from '../../authguard.service';

export interface ParamConfig {
  name: string;
  fillType: 'static' | 'metadata';
  staticValue: string;
  metadataField: string;
}

@Component({
  selector: 'app-channel-communication',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatButtonToggleModule,
    NgxMatSelectSearchModule,
    MatAutocompleteModule,
  ],
  templateUrl: './channel-communication.component.html',
  styleUrls: ['./channel-communication.component.css'],
})
export class ChannelCommunicationComponent implements OnInit, OnDestroy {

  private firestore = inject(Firestore);
  private storage   = inject(Storage);
  private snackBar  = inject(MatSnackBar);
  private destroy$  = new Subject<void>();

  // Step tracking 
  currentStep = 1;

  // Channel
  channels: any[]         = [];
  filteredChannels: any[] = [];
  channelSearch           = '';
  selectedChannel: any    = null;
  isLoadingChannels       = false;
  showCreateChannel       = false;
  isCreatingChannel       = false;
  isUploadingChannelImage = false;
  channelImageUrl         = '';
  channelForm: FormGroup;
  adminOptions:      any[]  = [];
  selectedAdmins:    any[]  = [];
  adminSearchFilter: string = '';

  // Template 
  templates: any[]         = [];
  filteredTemplates: any[] = [];
  templateSearch           = '';
  selectedCategoryFilter   = '';
  categories: string[]     = [];
  categoryItems: { id: string; name: string }[] = [];
  selectedTemplate: any    = null;
  isLoadingTemplates       = false;

  //  Variables
  parameterConfig: ParamConfig[] = [];
  metadataFields: string[]       = [];
  isLoadingMetadata              = false;

  // Review 
  isSending           = false;
  showParticipantList = false;
  showChannelMemberList = false;

  // Participants 
  participants: any[] = [];

  // Preview 
  previewHtml: SafeHtml = '';

  constructor(
    private fb: FormBuilder,
    private authguard: AuthguardService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    public dialogRef: MatDialogRef<ChannelCommunicationComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.participants = data?.participants || data || [];
    this.channelForm = this.fb.group({
      channelName:  ['', Validators.required],
      description:  [''],
      channelImage: [''],
    });
  }

  ngOnInit(): void {
    this.loadChannels();
    this.loadTemplates();
    this.loadMetadataFields();
    this.loadAdminOptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Loaders
  async loadChannels(): Promise<void> {
    this.isLoadingChannels = true;
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'supportchat'),
          where('type', '==', 'channel'),
          where('isdelete', '==', false))
      );
      this.channels = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.created_on?.toDate?.() ?? new Date(0);
          const bTime = b.created_on?.toDate?.() ?? new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
      this.filteredChannels = [...this.channels];
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoadingChannels = false;
    }
  }

  async loadTemplates(): Promise<void> {
    this.isLoadingTemplates = true;
    try {
      const catSnap = await getDoc(doc(this.firestore, 'classify', 'channelcategories'));
      this.categoryItems = catSnap.exists() ? (catSnap.data()?.['categories'] || []) : [];
      const snap = await getDocs(
        query(collection(this.firestore, 'channeltemplates'),
          where('status', '==', 'approved'),
          where('delete', '==', false))
      );
      this.templates = snap.docs
        .map(d => ({ docid: d.id, ...d.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createddate?.toDate?.() ?? new Date(0);
          const bTime = b.createddate?.toDate?.() ?? new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
      this.filteredTemplates = [...this.templates];
      const cats = new Set<string>(this.templates.map(t => t.category).filter(Boolean));
      this.categories = Array.from(cats).sort();
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoadingTemplates = false;
    }
  }

  async loadMetadataFields(): Promise<void> {
    this.isLoadingMetadata = true;
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'participant metadata'), limit(1))
      );
      if (!snap.empty) {
        this.metadataFields = Object.keys(snap.docs[0].data()).sort();
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoadingMetadata = false;
    }
  }

  async loadAdminOptions(): Promise<void> {
    try {
      const data = await this.authguard.getProfileMap();
      const map  = data.docdata || {};
      this.adminOptions = Object.entries(map)
        .map(([id, profile]: any) => ({
          profileid: id,
          name:      profile.name  || 'Unknown',
          email:     profile.email || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error(e);
    }
  }

  onChannelSearch(): void {
    const s = this.channelSearch.toLowerCase();
    this.filteredChannels = s
      ? this.channels.filter(c =>
          (c.group_name  || '').toLowerCase().includes(s) ||
          (c.description || '').toLowerCase().includes(s))
      : [...this.channels];
  }

  selectChannel(ch: any): void {
    this.selectedChannel = ch;
  }

  getFilteredAdminOptions(): any[] {
    if (!this.adminSearchFilter) return this.adminOptions;
    const s = this.adminSearchFilter.toLowerCase();
    return this.adminOptions.filter(a =>
      a.name.toLowerCase().includes(s) ||
      a.email.toLowerCase().includes(s)
    );
  }

  compareAdmin(a: any, b: any): boolean {
    return a?.profileid === b?.profileid;
  }

  async uploadChannelImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.isUploadingChannelImage = true;
    try {
      const fileRef = sref(this.storage, `channel-images/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      this.channelImageUrl = await getDownloadURL(fileRef);
      this.channelForm.patchValue({ channelImage: this.channelImageUrl });
      this.showSnackBar('Image uploaded');
    } catch (e) {
      console.error(e);
      this.showSnackBar('Upload failed');
    } finally {
      this.isUploadingChannelImage = false;
      input.value = '';
    }
  }

  async createChannel(): Promise<void> {
    if (this.channelForm.invalid) {
      this.channelForm.markAllAsTouched();
      return;
    }
    if (this.selectedAdmins.length === 0) {
      this.showSnackBar('Please select at least one admin');
      return;
    }
    this.isCreatingChannel = true;
    try {
      const f        = this.channelForm.value;
      const newRef   = doc(collection(this.firestore, 'supportchat'));
      const adminIds = this.selectedAdmins.map(a => a.profileid);
      const channelData = {
        id:                newRef.id,
        group_name:        f.channelName,
        description:       f.description || '',
        group_profile:     this.channelImageUrl || '',
        admins:            adminIds,
        members:           adminIds,
        type:              'channel',
        creator_uid:       this.authguard.uid,
        created_on:        serverTimestamp(),
        last_modification: serverTimestamp(),
        last_sender_uid:   '',
        isdelete:          false,
      };
      await setDoc(newRef, channelData);
      this.selectedChannel = { ...channelData, id: newRef.id };
      this.channels.unshift(this.selectedChannel);
      this.filteredChannels  = [...this.channels];
      this.showCreateChannel = false;
      this.channelForm.reset();
      this.selectedAdmins  = [];
      this.channelImageUrl = '';
      this.showSnackBar('Channel created successfully');
    } catch (e) {
      console.error(e);
      this.showSnackBar('Error creating channel');
    } finally {
      this.isCreatingChannel = false;
    }
  }

  onTemplateSearch(): void {
    const s = this.templateSearch.toLowerCase();
    let list = [...this.templates];
    if (this.selectedCategoryFilter) {
      list = list.filter(t => t.category === this.selectedCategoryFilter);
    }
    if (s) {
      list = list.filter(t =>
        (t.templatename || '').toLowerCase().includes(s) ||
        (t.category     || '').toLowerCase().includes(s));
    }
    this.filteredTemplates = list;
  }

  selectTemplate(t: any): void {
    this.selectedTemplate = t;
    this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(t.htmlbody || '');
    this.parameterConfig = (t.templatemodel || []).map((v: string) => ({
      name:          v,
      fillType:      'static' as const,
      staticValue:   '',
      metadataField: '',
    }));
  }

  getCategoryName(id: string): string {
    return this.categoryItems.find(c => c.id === id)?.name || id;
  }


  setFillType(param: ParamConfig, type: 'static' | 'metadata'): void {
    param.fillType      = type;
    param.staticValue   = '';
    param.metadataField = '';
  }

  isParamConfigured(param: ParamConfig): boolean {
    if (param.fillType === 'static')   return param.staticValue.trim().length > 0;
    if (param.fillType === 'metadata') return param.metadataField.trim().length > 0;
    return false;
  }

  allParamsConfigured(): boolean {
    if (this.parameterConfig.length === 0) return true;
    return this.parameterConfig.every(p => this.isParamConfigured(p));
  }


  getChannelAdmins(): any[] {
    const adminIds: string[] = this.selectedChannel?.admins || [];
    return adminIds.map(id => {
      const profile = this.adminOptions.find(a => a.profileid === id);
      return profile ?? { name: id };
    });
  }

  getChannelMembers(): any[] {
    const memberIds: string[] = this.selectedChannel?.members || [];
    return memberIds.map(id => {
      const profile = this.adminOptions.find(a => a.profileid === id);
      return { id, name: profile?.name || id };
    });
  }

  isChannelAdmin(id: string): boolean {
    return (this.selectedChannel?.admins || []).includes(id);
  }

  async onSend(): Promise<void> {
    if (!this.selectedChannel || !this.selectedTemplate) return;
    if (!confirm('Send this broadcast to all selected participants?')) return;

    this.isSending = true;
    try {
      const participantIds = this.participants.map((p: any) => p.profileid);
      const adminIds       = this.selectedChannel.admins || [];
      const messageMembers = [...new Set([...participantIds, ...adminIds])];

      const archiveRef = doc(collection(this.firestore, 'channelarchive'));
      await setDoc(archiveRef, {
        docid:           archiveRef.id,
        channelid:       this.selectedChannel.id,
        channelname:     this.selectedChannel.group_name,
        category:        this.selectedTemplate.category || '',
        templateid:      this.selectedTemplate.docid,
        templatename:    this.selectedTemplate.templatename,
        htmlbody:        this.selectedTemplate.htmlbody,
        textbody:        this.selectedTemplate.textbody,
        headertype:      this.selectedTemplate.headertype  ?? null,
        headervalue:     this.selectedTemplate.headervalue ?? null,
        footer:          this.selectedTemplate.footer      ?? null,
        templatemodel:   this.selectedTemplate.templatemodel || [],
        parameterConfig: this.parameterConfig,
        profileid:       messageMembers,
        createdby:       this.authguard.uid,
        createdat:       serverTimestamp(),
        status:          'created',
        files:           this.selectedTemplate.files   || [],
        links:           this.selectedTemplate.links   || [],
        buttons:         this.selectedTemplate.buttons || [],
      });

      await updateDoc(doc(this.firestore, 'supportchat', this.selectedChannel.id), {
        members:           arrayUnion(...participantIds),
        last_modification: serverTimestamp(),
      });

      this.showSnackBar('Broadcast sent successfully!');
      this.dialogRef.close({ success: true, archiveId: archiveRef.id });
    } catch (e) {
      console.error(e);
      this.showSnackBar('Error sending broadcast');
    } finally {
      this.isSending = false;
    }
  }

  goToStep(step: number): void {
    this.currentStep          = step;
    this.showParticipantList  = false;
    this.showChannelMemberList = false;
  }

  showSnackBar(msg: string): void {
    this.snackBar.open(msg, 'Close', {
      duration: 3000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  getConfiguredCount(): number {
    return this.parameterConfig.filter(p => this.isParamConfigured(p)).length;
  }

  getFilteredMetadataFields(search: string): string[] {
    if (!search) return this.metadataFields;
    return this.metadataFields.filter(f => f.toLowerCase().includes(search.toLowerCase()));
  }

  getConfiguredPercent(): number {
    if (this.parameterConfig.length === 0) return 0;
    return (this.getConfiguredCount() / this.parameterConfig.length) * 100;
  }
}