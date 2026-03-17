import { Component, OnInit, Inject, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { ReplaySubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

interface CachedMessage {
  templateName: string;
  params: { [key: string]: string };
  timestamp: number;
  previewText: string;
}

@Component({
  selector: 'app-sendmessages',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    NgxMatSelectSearchModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './sendmessages.component.html',
  styleUrls: ['./sendmessages.component.css']
})
export class SendmessagesComponent implements OnInit, OnDestroy {
  mailForm!: FormGroup;
  whatsappForm!: FormGroup;
  selectedTabIndex: number = 0;
  watiTemplates: any[] = [];
  filteredTemplates: ReplaySubject<any[]> = new ReplaySubject<any[]>(1);
  selectedTemplate: any = null;
  dynamicParams: any[] = [];
  previewText: string = 'Select a template to see preview...';
  footertext: string = 'Select a template to see preview...';
  isLoadingTemplates: boolean = false;
  templatesLoadError: string = '';
  templateSearchCtrl: FormControl = new FormControl();
  pinnedTemplates: any[] = [];
  private readonly MESSAGE_CACHE_KEY = 'whatsapp_message_cache';
  cachedMessages: CachedMessage[] = [];
  
  private readonly PINNED_TEMPLATES_KEY = 'pinned_wati_templates';
  endpoint:string = '';
  apitoken:string = '';
  private _onDestroy = new Subject<void>();
  profilesExpanded: boolean = false;
  
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<SendmessagesComponent>,
    private http: HttpClient,
    private firestore: Firestore,
    @Inject(MAT_DIALOG_DATA) public data: { type: 'mail' | 'whatsapp', selectedprofiles: any }
  ) { 

    getDoc(doc(this.firestore, "classify", "wati")).then((wati) => {
      if (wati.exists()) {
        this.apitoken = wati.data()['101723']['watitoken'];
        this.endpoint = wati.data()['101723']['endpoint'];
      }
    });

  }

  ngOnInit(): void {
    this.mailForm = this.fb.group({
      subject: ['', [Validators.required, Validators.maxLength(200)]],
      message: ['', [Validators.required, Validators.maxLength(2000)]]
    });
    
    this.whatsappForm = this.fb.group({
      templateName: ['', Validators.required]
    });
    
    this.selectedTabIndex = this.data?.type === 'whatsapp' ? 1 : 0;
    console.log(this.data.selectedprofiles, 'consoling selected profiles');
    
    this.templateSearchCtrl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterTemplates();
      });
    
    this.loadPinnedTemplates();
    this.loadMessageCache();
    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  loadMessageCache(): void {
    try {
      const cached = localStorage.getItem(this.MESSAGE_CACHE_KEY);
      if (cached) {
        this.cachedMessages = JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error loading message cache:', error);
      this.cachedMessages = [];
    }
  }

  saveToCache(): void {
    if (!this.selectedTemplate) return;
    
    const params: { [key: string]: string } = {};
    this.dynamicParams.forEach((param: any) => {
      const value = this.whatsappForm.get(param.paramName)?.value?.trim() || '';
      if (value) {
        params[param.paramName] = value;
      }
    });
    if (Object.keys(params).length === 0) return;
    
    const cacheEntry: CachedMessage = {
      templateName: this.selectedTemplate.elementName,
      params: params,
      timestamp: Date.now(),
      previewText: this.previewText.substring(0, 100) + (this.previewText.length > 100 ? '...' : '')
    };
    
    this.cachedMessages = this.cachedMessages.filter(c => 
      !(c.templateName === cacheEntry.templateName && 
        JSON.stringify(c.params) === JSON.stringify(cacheEntry.params))
    );
    this.cachedMessages.unshift(cacheEntry);
    if (this.cachedMessages.length > 50) {
      this.cachedMessages = this.cachedMessages.slice(0, 50);
    }
    
    try {
      localStorage.setItem(this.MESSAGE_CACHE_KEY, JSON.stringify(this.cachedMessages));
    } catch (error) {
      console.error('Error saving message cache:', error);
    }
  }

  getCachedMessagesForTemplate(): CachedMessage[] {
    if (!this.selectedTemplate) return [];
    return this.cachedMessages
      .filter(c => c.templateName === this.selectedTemplate.elementName)
      .slice(0, 10);
  }

  loadCachedMessage(cached: CachedMessage): void {
    Object.keys(cached.params).forEach(paramName => {
      const control = this.whatsappForm.get(paramName);
      if (control) {
        control.setValue(cached.params[paramName]);
      }
    });
    this.updatePreview();
  }

  deleteCachedMessage(cached: CachedMessage, event: Event): void {
    event.stopPropagation();
    this.cachedMessages = this.cachedMessages.filter(c => c.timestamp !== cached.timestamp);
    try {
      localStorage.setItem(this.MESSAGE_CACHE_KEY, JSON.stringify(this.cachedMessages));
    } catch (error) {
      console.error('Error saving message cache:', error);
    }
  }

  clearAllCacheForTemplate(): void {
    if (!this.selectedTemplate) return;
    this.cachedMessages = this.cachedMessages.filter(c => c.templateName !== this.selectedTemplate.elementName);
    try {
      localStorage.setItem(this.MESSAGE_CACHE_KEY, JSON.stringify(this.cachedMessages));
    } catch (error) {
      console.error('Error saving message cache:', error);
    }
  }

  formatCacheTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  filterTemplates(): void {
    if (!this.watiTemplates) {
      return;
    }
    
    let search = this.templateSearchCtrl.value;
    if (!search) {
      this.filteredTemplates.next(this.watiTemplates.slice());
      return;
    }
    
    search = search.toLowerCase();
    
    this.filteredTemplates.next(
      this.watiTemplates.filter(template =>
        template.elementName.toLowerCase().includes(search)
      )
    );
  }

  async loadTemplates(): Promise<void> {
    this.isLoadingTemplates = true;
    this.templatesLoadError = '';

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apitoken}`,
      'Content-Type': 'application/json'
    });

    const params = {
      pageSize: '1000',
      pageNumber: '1'
    };

    try {
      const response: any = await this.http.get(
        `${this.endpoint}/api/v1/getMessageTemplates`,
        { headers, params }
      ).toPromise();

      console.log('WATI Templates Response:', response);

      const templates = (response.messageTemplates || []).filter(
        (template: any) =>
          template.status !== 'DELETED' &&
          template.type === 'template' &&
          template.category === 'UTILITY'
      );
      
      this.watiTemplates = templates;
      this.filteredTemplates.next(templates);
      
      console.log('Filtered UTILITY Templates:', templates);
    } catch (error) {
      console.error('Error fetching WATI templates:', error);
      this.templatesLoadError = 'Failed to load templates. Please try again.';
    } finally {
      this.isLoadingTemplates = false;
    }
  }

  refreshTemplates(): void {
    this.loadTemplates();
  }

  loadPinnedTemplates(): void {
    try {
      const pinned = localStorage.getItem(this.PINNED_TEMPLATES_KEY);
      if (pinned) {
        this.pinnedTemplates = JSON.parse(pinned);
      }
    } catch (error) {
      console.error('Error loading pinned templates:', error);
      this.pinnedTemplates = [];
    }
  }

  savePinnedTemplates(): void {
    try {
      localStorage.setItem(this.PINNED_TEMPLATES_KEY, JSON.stringify(this.pinnedTemplates));
    } catch (error) {
      console.error('Error saving pinned templates:', error);
    }
  }

  isPinned(templateName: string): boolean {
    return this.pinnedTemplates.some(t => t.elementName === templateName);
  }

  togglePin(template: any, event?: Event): boolean {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    const index = this.pinnedTemplates.findIndex(t => t.elementName === template.elementName);
    
    if (index > -1) {
      this.pinnedTemplates.splice(index, 1);
    } else {
      this.pinnedTemplates.push(template);
    }
    
    this.savePinnedTemplates();
    
    return false;
  }

  removePinnedTemplate(template: any, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.togglePin(template);
  }

  selectPinnedTemplate(template: any): void {
    this.whatsappForm.patchValue({ templateName: template.elementName });
    
    this.selectedTemplate = template;
    this.dynamicParams = [];
    
    Object.keys(this.whatsappForm.controls).forEach(key => {
      if (key !== 'templateName') {
        this.whatsappForm.removeControl(key);
      }
    });
    
    if (this.selectedTemplate.customParams && this.selectedTemplate.customParams.length > 0) {
      this.dynamicParams = this.selectedTemplate.customParams;
      
      this.dynamicParams.forEach((param: any) => {
        const paramName = param.paramName;
        const control = new FormControl('', Validators.required);
        this.whatsappForm.addControl(paramName, control);
        
        control.valueChanges.subscribe(() => {
          this.updatePreview();
        });
      });
    }
    
    this.updatePreview();
  }

  onTemplateSelected(event: any): void {
    const templateName = event.value;
    
    if (typeof templateName !== 'string') {
      console.error('Template name should be a string, got:', templateName);
      return;
    }
    
    this.selectedTemplate = this.watiTemplates.find(t => t.elementName === templateName);
    
    if (this.selectedTemplate) {
      console.log('Selected Template:', this.selectedTemplate);
      this.dynamicParams = [];
      
      Object.keys(this.whatsappForm.controls).forEach(key => {
        if (key !== 'templateName') {
          this.whatsappForm.removeControl(key);
        }
      });
      
      if (this.selectedTemplate.customParams && this.selectedTemplate.customParams.length > 0) {
        this.dynamicParams = this.selectedTemplate.customParams;
        
        this.dynamicParams.forEach((param: any) => {
          const paramName = param.paramName;
          const control = new FormControl('', Validators.required);
          this.whatsappForm.addControl(paramName, control);
          
          control.valueChanges.subscribe(() => {
            this.updatePreview();
          });
        });
      }
      
      this.updatePreview();
    }
  }
  totalMessageLength: number = 0;
  updatePreview(): void {
      if (!this.selectedTemplate || !this.selectedTemplate.bodyOriginal) {
        this.previewText = 'Select a template to see preview...';
        this.footertext = 'Select a template';
        this.totalMessageLength = 0;
        return;
      }

      let text = this.selectedTemplate.bodyOriginal;
      
      this.dynamicParams.forEach((param: any) => {
        const paramName = param.paramName;
        const paramValue = this.whatsappForm.get(paramName)?.value?.trim();
        
        if (paramValue) {
          const regex = new RegExp(`\\{\\{${paramName}\\}\\}`, 'g');
          text = text.replace(regex, paramValue);
        }
      });

      this.previewText = text;
      this.footertext = this.selectedTemplate.footer;
      this.totalMessageLength = new Blob([text]).size;
    }

  sendMail(): void {
    if (this.mailForm.invalid) {
      this.mailForm.markAllAsTouched();
      return;
    }

    const payload = {
      action: 'sent',
      type: 'mail',
      subject: this.mailForm.value.subject?.trim(),
      message: this.mailForm.value.message?.trim()
    };

    this.dialogRef.close(payload);
  }

  sendWhatsApp(): void {
    if (this.whatsappForm.invalid) {
      this.whatsappForm.markAllAsTouched();
      return;
    }
    this.saveToCache();
    
    const customParams: any[] = [];
    this.dynamicParams.forEach((param: any) => {
      const paramName = param.paramName;
      const paramValue = this.whatsappForm.get(paramName)?.value?.trim();
      customParams.push({
        name: paramName,
        value: paramValue
      });
    });

    const payload = {
      action: 'sent',
      type: 'whatsapp',
      templateName: this.whatsappForm.value.templateName,
      customParams: customParams,
      selectedTemplate: this.selectedTemplate
    };

    console.log('WhatsApp Payload:', payload);
    this.dialogRef.close(payload);
  }
  
  onPasteRemoveNewlines(event: ClipboardEvent, paramName: string): void {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text') || '';
    const cleanedText = pastedText.replace(/[\r\n]+/g, ' ').trim();
    const currentValue = this.whatsappForm.get(paramName)?.value || '';
    const input = event.target as HTMLTextAreaElement;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const newValue = currentValue.substring(0, start) + cleanedText + currentValue.substring(end);
    this.whatsappForm.get(paramName)?.setValue(newValue);
  }
  
  close(): void {
    this.dialogRef.close({ action: 'closed' });
  }

  formatWhatsAppText(text: string): string {
    if (!text) return '';
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\_([^_]+)\_/g, '<em>$1</em>');
    formatted = formatted.replace(/\~([^~]+)\~/g, '<del>$1</del>');
    formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }
  
  // getTotalMessageLength(): number {
  //   if (!this.selectedTemplate?.bodyOriginal) return 0;
  //   let totalText = this.selectedTemplate.bodyOriginal;
  //   this.dynamicParams.forEach((param: any) => {
  //     const paramValue = this.whatsappForm.get(param.paramName)?.value || '';
  //     const regex = new RegExp(`\\{\\{${param.paramName}\\}\\}`, 'g');
  //     totalText = totalText.replace(regex, paramValue);
  //   });
  //   const byteLength = new Blob([totalText]).size;
    
  //   console.log('Total text:', totalText);
  //   console.log('Character count:', totalText.length);
  //   console.log('Byte count:', byteLength);
    
  //   return byteLength;
  // }
  
  insertAtCursor(paramName: string, textToInsert: string): void {
    const control = this.whatsappForm.get(paramName);
    if (!control) return;

    const currentValue = control.value || '';
    
    const textarea = document.querySelector(`textarea[formcontrolname="${paramName}"]`) as HTMLTextAreaElement;
    
    if (textarea) {
      const start = textarea.selectionStart || currentValue.length;
      const end = textarea.selectionEnd || currentValue.length;
      const newValue = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
      control.setValue(newValue);
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + textToInsert.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      control.setValue(currentValue + textToInsert);
    }
  }
}




// import { Component, OnInit, Inject, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import { MatButtonModule } from '@angular/material/button';
// import { MatTabsModule } from '@angular/material/tabs';
// import { MatSelectModule } from '@angular/material/select';
// import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
// import { MatIconModule } from '@angular/material/icon';
// import { HttpClient, HttpHeaders } from '@angular/common/http';
// import { Firestore } from '@angular/fire/firestore';
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
// import { MatChipsModule } from '@angular/material/chips';
// import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
// import { ReplaySubject, Subject } from 'rxjs';
// import { takeUntil } from 'rxjs/operators';

// @Component({
//   selector: 'app-sendmessages',
//   standalone: true,
//   imports: [
//     CommonModule,
//     MatDialogModule,
//     MatFormFieldModule,
//     MatInputModule,
//     MatButtonModule,
//     MatTabsModule,
//     MatSelectModule,
//     ReactiveFormsModule,
//     MatIconModule,
//     MatProgressSpinnerModule,
//     MatChipsModule,
//     NgxMatSelectSearchModule
//   ],
//   templateUrl: './sendmessages.component.html',
//   styleUrls: ['./sendmessages.component.css']
// })
// export class SendmessagesComponent implements OnInit, OnDestroy {
//   mailForm!: FormGroup;
//   whatsappForm!: FormGroup;
//   selectedTabIndex: number = 0;
//   watiTemplates: any[] = [];
//   filteredTemplates: ReplaySubject<any[]> = new ReplaySubject<any[]>(1);
//   selectedTemplate: any = null;
//   dynamicParams: any[] = [];
//   previewText: string = 'Select a template to see preview...';
//   footertext: string = 'Select a template to see preview...';
//   isLoadingTemplates: boolean = false;
//   templatesLoadError: string = '';
//   templateSearchCtrl: FormControl = new FormControl();
//   pinnedTemplates: any[] = [];  
//   private readonly PINNED_TEMPLATES_KEY = 'pinned_wati_templates';
//   private readonly WATI_BASE_URL = 'https://live-mt-server.wati.io/101723';
//   private readonly WATI_API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZDM1NDUwOC04YmVlLTRmNmMtYTUyMC0xYjM1NjgyMTc2NTIiLCJ1bmlxdWVfbmFtZSI6ImFydW4uZGFzc0Bzb2V4Y2VsbGVuY2UuY29tIiwibmFtZWlkIjoiYXJ1bi5kYXNzQHNvZXhjZWxsZW5jZS5jb20iLCJlbWFpbCI6ImFydW4uZGFzc0Bzb2V4Y2VsbGVuY2UuY29tIiwiYXV0aF90aW1lIjoiMTEvMTAvMjAyNSAxMTowMjoyMCIsInRlbmFudF9pZCI6IjEwMTcyMyIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.IPDWK3eqA64BlxFE4Dh2kjMruDXjjfjL5j-5H6KjR9w';
//   private _onDestroy = new Subject<void>();
//   profilesExpanded: boolean = false;
//   constructor(
//     private fb: FormBuilder,
//     private dialogRef: MatDialogRef<SendmessagesComponent>,
//     private http: HttpClient,
//     private firestore: Firestore,
//     @Inject(MAT_DIALOG_DATA) public data: { type: 'mail' | 'whatsapp', selectedprofiles:any }
//   ) {}

//   ngOnInit(): void {
//     this.mailForm = this.fb.group({
//       subject: ['', [Validators.required, Validators.maxLength(200)]],
//       message: ['', [Validators.required, Validators.maxLength(2000)]]
//     });
    
//     this.whatsappForm = this.fb.group({
//       templateName: ['', Validators.required]  
//     });
    
//     this.selectedTabIndex = this.data?.type === 'whatsapp' ? 1 : 0;
//     console.log(this.data.selectedprofiles,'consoling selected profiles')
//     this.templateSearchCtrl.valueChanges
//       .pipe(takeUntil(this._onDestroy))
//       .subscribe(() => {
//         this.filterTemplates();
//       });
    
//     this.loadPinnedTemplates();
//     this.loadTemplates();
//   }

//   ngOnDestroy(): void {
//     this._onDestroy.next();
//     this._onDestroy.complete();
//   }

//   filterTemplates(): void {
//     if (!this.watiTemplates) {
//       return;
//     }
    
//     let search = this.templateSearchCtrl.value;
//     if (!search) {
//       this.filteredTemplates.next(this.watiTemplates.slice());
//       return;
//     }
    
//     search = search.toLowerCase();
    
//     this.filteredTemplates.next(
//       this.watiTemplates.filter(template => 
//         template.elementName.toLowerCase().includes(search)
//       )
//     );
//   }

//   async loadTemplates(): Promise<void> {
//     this.isLoadingTemplates = true;
//     this.templatesLoadError = '';

//     const headers = new HttpHeaders({
//       'Authorization': `Bearer ${this.WATI_API_TOKEN}`,
//       'Content-Type': 'application/json'
//     });

//     const params = {
//       pageSize: '1000',
//       pageNumber: '1'
//     };

//     try {
//       const response: any = await this.http.get(
//         `${this.WATI_BASE_URL}/api/v1/getMessageTemplates`,
//         { headers, params }
//       ).toPromise();

//       console.log('WATI Templates Response:', response);

//       const templates = (response.messageTemplates || []).filter(
//         (template: any) => 
//           template.status !== 'DELETED' && 
//           template.type === 'template' &&
//           template.category === 'UTILITY'
//       );
      
//       this.watiTemplates = templates;
//       this.filteredTemplates.next(templates);
      
//       console.log('Filtered UTILITY Templates:', templates);
//     } catch (error) {
//       console.error('Error fetching WATI templates:', error);
//       this.templatesLoadError = 'Failed to load templates. Please try again.';
//     } finally {
//       this.isLoadingTemplates = false;
//     }
//   }

//   refreshTemplates(): void {
//     this.loadTemplates();
//   }

//   loadPinnedTemplates(): void {
//     try {
//       const pinned = localStorage.getItem(this.PINNED_TEMPLATES_KEY);
//       if (pinned) {
//         this.pinnedTemplates = JSON.parse(pinned);
//       }
//     } catch (error) {
//       console.error('Error loading pinned templates:', error);
//       this.pinnedTemplates = [];
//     }
//   }

//   savePinnedTemplates(): void {
//     try {
//       localStorage.setItem(this.PINNED_TEMPLATES_KEY, JSON.stringify(this.pinnedTemplates));
//     } catch (error) {
//       console.error('Error saving pinned templates:', error);
//     }
//   }

//   isPinned(templateName: string): boolean {
//     return this.pinnedTemplates.some(t => t.elementName === templateName);
//   }

//   togglePin(template: any, event?: Event): boolean {
//     if (event) {
//       event.stopPropagation();  
//       event.preventDefault();    
//     }

//     const index = this.pinnedTemplates.findIndex(t => t.elementName === template.elementName);
    
//     if (index > -1) {
//       this.pinnedTemplates.splice(index, 1);
//     } else {
//       this.pinnedTemplates.push(template);
//     }
    
//     this.savePinnedTemplates();
    
//     return false;
//   }

//   removePinnedTemplate(template: any, event: Event): void {
//     event.stopPropagation();
//     event.preventDefault();
//     this.togglePin(template);
//   }

//   selectPinnedTemplate(template: any): void {
//     this.whatsappForm.patchValue({ templateName: template.elementName });
    
//     this.selectedTemplate = template;
//     this.dynamicParams = [];
    
//     Object.keys(this.whatsappForm.controls).forEach(key => {
//       if (key !== 'templateName') {
//         this.whatsappForm.removeControl(key);
//       }
//     });
    
//     if (this.selectedTemplate.customParams && this.selectedTemplate.customParams.length > 0) {
//       this.dynamicParams = this.selectedTemplate.customParams;
      
//       this.dynamicParams.forEach((param: any) => {
//         const paramName = param.paramName;
//         const control = new FormControl('', Validators.required);
//         this.whatsappForm.addControl(paramName, control);
        
//         control.valueChanges.subscribe(() => {
//           this.updatePreview();
//         });
//       });
//     }
    
//     this.updatePreview();
//   }

//   onTemplateSelected(event: any): void {
//     const templateName = event.value;
    
//     if (typeof templateName !== 'string') {
//       console.error('Template name should be a string, got:', templateName);
//       return;
//     }
    
//     this.selectedTemplate = this.watiTemplates.find(t => t.elementName === templateName);
    
//     if (this.selectedTemplate) {
//       console.log('Selected Template:', this.selectedTemplate);
//       this.dynamicParams = [];
      
//       Object.keys(this.whatsappForm.controls).forEach(key => {
//         if (key !== 'templateName') {
//           this.whatsappForm.removeControl(key);
//         }
//       });
      
//       if (this.selectedTemplate.customParams && this.selectedTemplate.customParams.length > 0) {
//         this.dynamicParams = this.selectedTemplate.customParams;
        
//         this.dynamicParams.forEach((param: any) => {
//           const paramName = param.paramName;
//           const control = new FormControl('', Validators.required);
//           this.whatsappForm.addControl(paramName, control);
          
//           control.valueChanges.subscribe(() => {
//             this.updatePreview();
//           });
//         });
//       }
      
//       this.updatePreview();
//     }
//   }

//   updatePreview(): void {
//     if (!this.selectedTemplate || !this.selectedTemplate.bodyOriginal) {
//       this.previewText = 'Select a template to see preview...';
//       this.footertext = 'Select a template';
//       return;
//     }

//     let text = this.selectedTemplate.bodyOriginal;
    
//     this.dynamicParams.forEach((param: any) => {
//       const paramName = param.paramName;
//       const paramValue = this.whatsappForm.get(paramName)?.value?.trim();
      
//       if (paramValue) {
//         const regex = new RegExp(`\\{\\{${paramName}\\}\\}`, 'g');
//         text = text.replace(regex, paramValue);
//       }
//     });

//     this.previewText = text;
//     this.footertext = this.selectedTemplate.footer;
//   }

//   sendMail(): void {
//     if (this.mailForm.invalid) {
//       this.mailForm.markAllAsTouched();
//       return;
//     }

//     const payload = {
//       action: 'sent',
//       type: 'mail',
//       subject: this.mailForm.value.subject?.trim(),
//       message: this.mailForm.value.message?.trim()
//     };

//     this.dialogRef.close(payload);
//   }

//   sendWhatsApp(): void {
//     if (this.whatsappForm.invalid) {
//       this.whatsappForm.markAllAsTouched();
//       return;
//     }
    
//     const customParams: any[] = [];
//     this.dynamicParams.forEach((param: any) => {
//       const paramName = param.paramName;
//       const paramValue = this.whatsappForm.get(paramName)?.value?.trim();
//       customParams.push({
//         name: paramName,
//         value: paramValue
//       });
//     });

//     const payload = {
//       action: 'sent',
//       type: 'whatsapp',
//       templateName: this.whatsappForm.value.templateName,
//       customParams: customParams,
//       selectedTemplate: this.selectedTemplate
//     };

//     console.log('WhatsApp Payload:', payload);
//     this.dialogRef.close(payload);
//   }
//   onPasteRemoveNewlines(event: ClipboardEvent, paramName: string): void {
//     event.preventDefault();
//     const pastedText = event.clipboardData?.getData('text') || '';
//     const cleanedText = pastedText.replace(/[\r\n]+/g, ' ').trim();
//     const currentValue = this.whatsappForm.get(paramName)?.value || '';
//     const input = event.target as HTMLTextAreaElement;
//     const start = input.selectionStart;
//     const end = input.selectionEnd;
//     const newValue = currentValue.substring(0, start) + cleanedText + currentValue.substring(end);
//     this.whatsappForm.get(paramName)?.setValue(newValue);
//   }
//   close(): void {
//     this.dialogRef.close({ action: 'closed' });
//   }
//     //   // Add to your component
//     // getCharacterCount(text: string): number {
//     //   return text?.length || 0;
//     // }

//     // isBodyTooLong(text: string): boolean {
//     //   return this.getCharacterCount(text) > 950;
//     // }
//   formatWhatsAppText(text: string): string {
//     if (!text) return '';
//     let formatted = text
//       .replace(/&/g, '&amp;')
//       .replace(/</g, '&lt;')
//       .replace(/>/g, '&gt;');
//     formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
//     formatted = formatted.replace(/\_([^_]+)\_/g, '<em>$1</em>');
//     formatted = formatted.replace(/\~([^~]+)\~/g, '<del>$1</del>');
//     formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
//     formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
//     formatted = formatted.replace(
//       /(https?:\/\/[^\s<]+)/g, 
//       '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
//     );
    
//     formatted = formatted.replace(/\n/g, '<br>');
    
//     return formatted;
//   }
//   getTotalMessageLength(): number {
//     if (!this.selectedTemplate?.bodyOriginal) return 0;
//     let totalText = this.selectedTemplate.bodyOriginal;
//     this.dynamicParams.forEach((param: any) => {
//       const paramValue = this.whatsappForm.get(param.paramName)?.value || '';
//       const regex = new RegExp(`\\{\\{${param.paramName}\\}\\}`, 'g');
//       totalText = totalText.replace(regex, paramValue);
//     });
//     const byteLength = new Blob([totalText]).size;
    
//     console.log('Total text:', totalText);
//     console.log('Character count:', totalText.length);
//     console.log('Byte count:', byteLength);
    
//     return byteLength;
//   }
    
//   insertAtCursor(paramName: string, textToInsert: string): void {
//     const control = this.whatsappForm.get(paramName);
//     if (!control) return;

//     const currentValue = control.value || '';
    
//     const textarea = document.querySelector(`textarea[formcontrolname="${paramName}"]`) as HTMLTextAreaElement;
    
//     if (textarea) {
//       const start = textarea.selectionStart || currentValue.length;
//       const end = textarea.selectionEnd || currentValue.length;
//       const newValue = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
//       control.setValue(newValue);
//       setTimeout(() => {
//         textarea.focus();
//         const newCursorPos = start + textToInsert.length;
//         textarea.setSelectionRange(newCursorPos, newCursorPos);
//       }, 0);
//     } else {
//       control.setValue(currentValue + textToInsert);
//     }
//   }
// }