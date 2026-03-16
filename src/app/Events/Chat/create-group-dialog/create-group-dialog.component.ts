import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthguardService } from '../../../authguard.service';
import { collection, doc, Firestore, getDocs, updateDoc } from '@angular/fire/firestore';
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { FormBuilder, Validators } from "@angular/forms";
import { DomSanitizer } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ElementRef, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-create-group-dialog',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatFormFieldModule,
    MatOptionModule,
    MatChipsModule,
    MatDividerModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatButtonModule,
    MatDialogModule,
    ReactiveFormsModule,
    MatListModule,
    NgxMatSelectSearchModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './create-group-dialog.component.html',
  styleUrls: ['./create-group-dialog.component.css']
})
export class CreateGroupDialogComponent implements OnInit {
  form: FormGroup;
  profileList: any[] = [];
  selectedImages: any[] = [];
  userList: any[] = [];
  filterprofile: string = '';
  mapProfile: any = {};
  groupData: any = {};
  mapUser: any = {};
  dialogData: any;
  isImporting: boolean = false;
  importResults: { matched: number; notFound: string[] } | null = null;
  profileDataMap: Map<string, string> = new Map(); // email -> docId mapping
  
  defaultGroupIcon: string = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNTAiIGZpbGw9IiMyMTk2RjMiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjQwIiByPSI5IiBmaWxsPSJ3aGl0ZSIvPjxwYXRoIGQ9Ik0zMCA3MGMwLTkgOS0xNiAyMC0xNnMxOSA3IDIwIDE2SDMweiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=';
  
  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;

  constructor(
    public formbuilder: FormBuilder,
    public firestore: Firestore,
    private guard: AuthguardService,
    @Inject(MAT_DIALOG_DATA) public metadata: any,
    public dialogRef: MatDialogRef<CreateGroupDialogComponent>,
    public dialog: MatDialog,
    private domSanitizer: DomSanitizer,
    private snackBar: MatSnackBar
  ) {
    this.dialogData = metadata;
    this.profileList = metadata['profilelist'] || [];
    this.userList = metadata['userlist'] || [];
    this.mapUser = metadata['mapUser'] || {};
    this.groupData = metadata['groupData'] ?? null;
  }

  ngOnInit() {
    this.form = this.formbuilder.group({
      groupname: [null, { validators: [Validators.required], updateOn: "change" }],
      groupprofile: [this.defaultGroupIcon, { updateOn: "change" }],
      members: [[], { validators: [Validators.required], updateOn: "change" }],
    });

    this.guard.getProfileMap().then(e => {
      this.mapProfile = e.docdata;

      if (this.groupData != null) {
        const existingMembers = [...(this.groupData['members'] || [])];
        
        this.form.patchValue({
          groupname: this.groupData['chatname'] ?? this.groupData['group_name'],
          groupprofile: this.groupData['chatprofile'] ?? this.groupData['group_profile'] ?? this.defaultGroupIcon,
          members: existingMembers
        });
        
        setTimeout(() => {
          this.form.get('members')?.updateValueAndValidity();
          this.form.get('members')?.markAsDirty();
        }, 200);
      }
    });

    // Load profile data for email mapping
    this.loadProfileData();
  }

  async loadProfileData() {
    try {
      const profileDataRef = collection(this.firestore, 'profiledata');
      const snapshot = await getDocs(profileDataRef);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data['email']) {
          this.profileDataMap.set(data['email'].toLowerCase().trim(), doc.id);
        }
      });
      
      console.log('Loaded profile data:', this.profileDataMap.size, 'profiles');
    } catch (error) {
      console.error('Error loading profile data:', error);
    }
  }

  async removeMember(member: any) {
    const memberName = this.mapUser[member]?.name || member;
    
    const confirmed = await this.showConfirmDialog(
      'Remove Member',
      `Are you sure you want to remove "${memberName}" from the group?`
    );
    
    if (!confirmed) return;

    console.log('Removing member:', member);
    const currentMembers = [...(this.form.get('members')?.value || [])];
    const updatedMembers = currentMembers.filter((m: any) => m !== member);
    
    this.form.patchValue({ 
      members: updatedMembers 
    }, { emitEvent: false });
    
    this.form.get('members')?.updateValueAndValidity();
    
    this.snackBar.open(`${memberName} removed from group`, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  showConfirmDialog(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const result = confirm(message);
      resolve(result);
    });
  }

  returnfilterProfile() {
    if (!this.filterprofile || this.filterprofile.trim() === '') {
      return this.userList;
    }
    return this.userList.filter(e =>
      this.mapUser[e]?.name?.toLowerCase().includes(this.filterprofile.toLowerCase()) ||
      this.mapUser[e]?.email?.toLowerCase().includes(this.filterprofile.toLowerCase())
    );
  }

  triggerExcelImport() {
    this.excelInput?.nativeElement?.click();
  }

  async importFromExcel(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isImporting = true;
    this.importResults = null;

    try {
      const data = await this.readExcelFile(file);
      const emails = this.extractEmailsFromExcel(data);
      
      if (emails.length === 0) {
        this.snackBar.open('No emails found in the Excel file. Make sure there is an "email" column.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isImporting = false;
        return;
      }

      const { matchedIds, notFoundEmails } = this.matchEmailsToProfiles(emails);
      
      // Add matched members to the form
      const currentMembers = this.form.get('members')?.value || [];
      const newMembers = [...new Set([...currentMembers, ...matchedIds])];
      
      this.form.patchValue({ members: newMembers });
      this.form.get('members')?.updateValueAndValidity();
      
      this.importResults = {
        matched: matchedIds.length,
        notFound: notFoundEmails
      };

      const message = notFoundEmails.length > 0
        ? `Imported ${matchedIds.length} members. ${notFoundEmails.length} emails not found.`
        : `Successfully imported ${matchedIds.length} members!`;
      
      this.snackBar.open(message, 'Close', {
        duration: 5000,
        panelClass: notFoundEmails.length > 0 ? ['warning-snackbar'] : ['success-snackbar']
      });

    } catch (error) {
      console.error('Error importing Excel:', error);
      this.snackBar.open('Error reading Excel file. Please check the file format.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isImporting = false;
      input.value = ''; // Reset file input
    }
  }

  readExcelFile(file: File): Promise<any[][]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          resolve(jsonData as any[][]);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  extractEmailsFromExcel(data: any[][]): string[] {
    if (data.length === 0) return [];

    const headers = data[0].map((h: any) => String(h).toLowerCase().trim());
    const emailColumnIndex = headers.findIndex((h: string) => 
      h === 'email' || h === 'e-mail' || h === 'mail' || h === 'emailid' || h === 'email id' || h === 'email_id'
    );

    if (emailColumnIndex === -1) {
      // Try to find column with @ symbol in first data row
      if (data.length > 1) {
        const firstDataRow = data[1];
        const possibleEmailCol = firstDataRow.findIndex((cell: any) => 
          String(cell).includes('@')
        );
        if (possibleEmailCol !== -1) {
          return data.slice(1)
            .map(row => String(row[possibleEmailCol] || '').toLowerCase().trim())
            .filter(email => email && email.includes('@'));
        }
      }
      return [];
    }

    return data.slice(1)
      .map(row => String(row[emailColumnIndex] || '').toLowerCase().trim())
      .filter(email => email && email.includes('@'));
  }

  matchEmailsToProfiles(emails: string[]): { matchedIds: string[]; notFoundEmails: string[] } {
    const matchedIds: string[] = [];
    const notFoundEmails: string[] = [];

    // Build reverse lookup from userList
    const emailToUserId: Map<string, string> = new Map();
    
    for (const userId of this.userList) {
      const userData = this.mapUser[userId];
      if (userData?.email) {
        emailToUserId.set(userData.email.toLowerCase().trim(), userId);
      }
    }

    // Also check profileDataMap
    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();
      
      // First check userList mapping
      if (emailToUserId.has(normalizedEmail)) {
        matchedIds.push(emailToUserId.get(normalizedEmail)!);
      }
      // Then check profileDataMap
      else if (this.profileDataMap.has(normalizedEmail)) {
        const profileId = this.profileDataMap.get(normalizedEmail)!;
        if (this.userList.includes(profileId)) {
          matchedIds.push(profileId);
        } else {
          notFoundEmails.push(email);
        }
      }
      else {
        notFoundEmails.push(email);
      }
    }

    return { 
      matchedIds: [...new Set(matchedIds)], // Remove duplicates
      notFoundEmails 
    };
  }

  downloadTemplate() {
    const templateData = [
      ['email'],
      ['example@email.com'],
      ['user@domain.com']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    
    // Set column width
    ws['!cols'] = [{ wch: 30 }];
    
    XLSX.writeFile(wb, 'group_members_template.xlsx');
  }

  importImages(imported: any) {
    if (imported.files && imported.files.length > 0) {
      this.selectedImages = Array.from(imported.files);
      const reader = new FileReader();
      reader.readAsDataURL(this.selectedImages[0]);
      reader.onload = (event: any) => {
        this.form.patchValue({
          groupprofile: event.target.result
        });
      };
    }
  }

  compareMembers(m1: any, m2: any): boolean {
    return m1 === m2;
  }

  removeImage() {
    this.form.patchValue({
      groupprofile: this.defaultGroupIcon
    });
    this.selectedImages = [];
  }

  getGroupImage(): string {
    const profile = this.form.get('groupprofile')?.value;
    return profile || this.defaultGroupIcon;
  }

  submit(value: any) {
    if (value.members.length < 2) {
      alert("Unable To Create Group. Select at least 2 members to create a group.");
      return;
    }

    const map = {
      image: this.selectedImages.length > 0 ? this.selectedImages : null,
      groupname: value['groupname'],
      members: value['members'],
      groupprofile: value['groupprofile'] || this.defaultGroupIcon,
      groupId: this.groupData?.id || this.groupData?.chatid || null
    };
    this.dialogRef.close(map);
  }

  async hideGroup() {
    console.log(this.groupData);
    if (confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
      await updateDoc(doc(this.firestore, 'supportchat', this.groupData.id), {
        isdelete: true
      });
      this.dialogRef.close({ deleted: true });
    }
  }

  clearImportResults() {
    this.importResults = null;
  }

  close() {
    this.dialogRef.close(null);
  }
}