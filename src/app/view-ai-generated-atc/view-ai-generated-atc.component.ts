import { Component, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { collection, collectionData, doc, getFirestore, getDoc, getDocs, query } from '@angular/fire/firestore';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';
import { Router } from '@angular/router';
import { AuthguardService } from '../authguard.service';

declare var bootstrap: any;

@Component({
  selector: 'app-view-ai-generated-atc',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MarkdownModule,
  ],
  templateUrl: './view-ai-generated-atc.component.html',
  styleUrl: './view-ai-generated-atc.component.css'
})
export class ViewAiGeneratedAtcComponent implements AfterViewInit, OnDestroy {
  firestoreDefault = getFirestore() // Default Firestore
  firestoreForms = getFirestore(this.firestoreDefault.app, 'firestore-forms')
  firestoreATC = getFirestore("firestore-atc") // ATC Firestore
  formDataMap: Map<string, { loading: boolean; data: any[]; formName?: string }> = new Map();
  // displayedColumns: string[] = ['id', 'profileid','version', 'generateatc'];
  displayedColumns: string[] = ['id', 'profileid', 'generateatc'];
  dataSource = new MatTableDataSource<any>();
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  private unsubscribe$ = new Subject<void>();
  mapProfile: { [key: string]: any } = {};
  showGeneratedContent: boolean = false;
  isLoadingForms: boolean = false;
  expandedFormIndex: number = 0;
  selectedParticipant: any = null;
  roles:any

  isEditingSummary: boolean = false;
  editableSummary: string = '';
  isSavingSummary: boolean = false;

  constructor(private router: Router, public auth: AuthguardService) {
    this.auth.getRoles().then(roles => {
      this.roles = roles;
      // if (
      //   roles['developer'] ||
      //   roles['eis']
      // ) {
        collectionData(
          query(collection(this.firestoreATC, "ai_generated_atc_summary")),
          { idField: 'docid' }
        )
        .pipe(takeUntil(this.unsubscribe$))
        .subscribe((snap: any[]) => {
          const latestByProfile: { [profileid: string]: any } = {};
          for (const doc of snap) {
            const profileid = doc.profileid;
            const version = Number(doc.version ?? 0);
            if (
              !latestByProfile[profileid] ||
              version > Number(latestByProfile[profileid].version ?? 0)
            ) {
              latestByProfile[profileid] = doc;
            }
          }
          this.dataSource.data = Object.values(latestByProfile);

          console.log('Latest ATC per profile:', this.dataSource.data);
        });

        this.loadData();

      // } else {
      //   console.log("unaccessed user");
      //   this.router.navigateByUrl("/");
      // }
    });
  }

  private loadData(): void {
    getDocs(query(collection(this.firestoreDefault, "profile_data"))).then(snap => {
      snap.forEach(doc => {
        const element = doc.data();
        this.mapProfile[element['profileid']] = element;
      });
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    // Custom filter predicate to search by participant name
    this.dataSource.filterPredicate = (data: any, filter: string) => {
      const participantName = this.mapProfile[data['profileid']]?.['name']?.toLowerCase() || '';
      return participantName.includes(filter);
    };
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  /**
   * Toggle accordion panel - Angular controlled
   */
  toggleForm(index: number): void {
    if (this.expandedFormIndex === index) {
      this.expandedFormIndex = -1; // Collapse if clicking same panel
    } else {
      this.expandedFormIndex = index; // Expand clicked panel
    }
  }

  /**
   * Generate ATC - automatically loads all form data when clicked
   */
  getjson(row: any) {
    const docid = row['docid'];

    if (!docid) {
      console.warn('No docid found');
      return;
    }

    const url = this.router.serializeUrl(
      this.router.createUrlTree(
        ['/prescribeATC'],
        {
          queryParams: {
            docid: docid,
            aigenerated: true
          }
        }
      )
    );

    window.open(url, '_blank');
  }

  // getjson(row: any) {
  //   const output = row['output'];

  //   if (!output) {
  //     console.warn('No output found');
  //     return;
  //   }

  //   const beforeJsonMatch = output.match(/^[\s\S]*?(?=\{)/);
  //   const preText = beforeJsonMatch
  //     ? beforeJsonMatch[0].trim()
  //     : null;
  //   const jsonMatch = output.match(/\{[\s\S]*\}/);
  //   if (!jsonMatch) {
  //     console.warn('No JSON found');
  //     return;
  //   }

  //   try {
  //     const parsedJson = JSON.parse(jsonMatch[0]);
  //     const areas = parsedJson?.ATC_Report?.Areas_that_need_to_be_explored_more ?? [];
  //     const jsonString = encodeURIComponent(JSON.stringify(parsedJson));
  //     const areasString = encodeURIComponent(JSON.stringify(areas));
  //     const preTextString = encodeURIComponent(preText);
  //     console.log(preTextString,'preTextStringpreTextString');
  //     const url = this.router.serializeUrl(
  //       this.router.createUrlTree(
  //         ['/prescribeATC'],
  //         {
  //           queryParams: {
  //             profileid: row['profileid'],
  //             docid: row['docid'],
  //             json: jsonString,
  //             areas: areasString,
  //             summary: preTextString,
  //             aigenerated: true
  //           }
  //         }
  //       )
  //     );

  //     window.open(url, '_blank');

  //   } catch (e) {
  //     console.error('Invalid JSON structure', e);
  //   }
  // }



  async generateATC(row: any): Promise<void> {
    this.selectedParticipant = row;
    this.showGeneratedContent = true;
    this.isLoadingForms = true;
    this.formDataMap.clear();
    this.expandedFormIndex = 0; // Reset to first form expanded

    // Load all forms automatically in parallel
    if (row['formdocids'] && row['formdocids'].length > 0) {
      try {
        const loadPromises = row['formdocids'].map((docid: string) => this.loadFormData(docid));
        await Promise.all(loadPromises);
      } catch (error) {
        console.error('Error loading forms:', error);
      }
    }

    this.isLoadingForms = false;
  }

  /**
   * Load form data for a specific document ID
   */
  async loadFormData(docid: string): Promise<void> {
    // Check if already loaded (not loading state)
    const existing = this.formDataMap.get(docid);
    if (existing && !existing.loading && existing.data.length > 0) {
      return; // Already loaded with data
    }

    // Set loading state
    this.formDataMap.set(docid, { loading: true, data: [], formName: 'Loading...' });

    try {
      const snap = await getDoc(doc(this.firestoreForms, "formsByClient", docid));
      
      if (!snap.exists()) {
        this.formDataMap.set(docid, { loading: false, data: [], formName: 'Form Not Found' });
        return;
      }

      const element = snap.data();
      console.log('Form Data for', docid, ':', element);

      const formData: any[] = [];

      if (element['formarray'] && Array.isArray(element['formarray'])) {
        for (const formelement of element['formarray']) {
          // Skip label, video, audio types
          if (['label', 'video', 'audio'].includes(formelement['type'])) {
            continue;
          }

          // Check if value exists and is not empty
          const value = formelement['value'];
          if (value === undefined || value === null || value === '') {
            continue;
          }

          // Skip empty arrays
          if (Array.isArray(value) && value.length === 0) {
            continue;
          }

          let answer: any;

          // Handle date type
          if (formelement['type'] === 'date') {
            answer = value?.toDate
              ? new Date(value.toDate()).toISOString().substring(0, 10)
              : value;
          }
          // Handle array type
          else if (Array.isArray(value)) {
            answer = value.map((item: any) => {
              if (typeof item === 'object' && item !== null) {
                return Object.entries(item)
                  .map(([key, val]) => `${key.trim()}: ${val}`)
                  .join(', ');
              }
              return String(item);
            });
          }
          // Handle string/other types
          else {
            answer = value;
          }

          formData.push({
            question: formelement['fieldname'] || 'Unknown Field',
            answer: answer,
            isArray: Array.isArray(answer)
          });
        }
      }

      this.formDataMap.set(docid, {
        loading: false,
        data: formData,
        formName: element['formname'] ?? 'Untitled Form'
      });
      
      console.log('Loaded form:', docid, 'with', formData.length, 'fields');
      
    } catch (error) {
      console.error('Error loading form data for', docid, ':', error);
      this.formDataMap.set(docid, { loading: false, data: [], formName: 'Error Loading Form' });
    }
  }

  getFormData(docid: string): { loading: boolean; data: any[]; formName?: string } | undefined {
    return this.formDataMap.get(docid);
  }

  /**
   * Get initials from name for avatar
   */
  getInitials(name: string | undefined): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  /**
   * Navigate back to table view
   */
  goBack(): void {
    this.showGeneratedContent = false;
    this.selectedParticipant = null;
    this.formDataMap.clear();
    this.expandedFormIndex = 0;
  }

  /**
   * Copy AI summary to clipboard
   */
  copyToClipboard(): void {
    if (this.selectedParticipant?.['output']) {
      navigator.clipboard.writeText(this.selectedParticipant['output']).then(() => {
        // Show toast notification
        const toastEl = document.getElementById('copyToast');
        if (toastEl) {
          const toast = new bootstrap.Toast(toastEl);
          toast.show();
        }
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  }

  get atcAlphaCount(): number {
    return this.dataSource?.data?.filter(row => !!row?.atcalpharef).length || 0;
  }

  openatc(profileid: string): void {
    // Implement your navigation logic here
    console.log('Opening ATC editor for profile:', profileid);
    // Example: this.router.navigate(['/atc-editor', profileid]);
  }

  enableEditSummary(): void {
  if (!this.selectedParticipant?.['output']) return;

  this.editableSummary = this.selectedParticipant['output'];
  this.isEditingSummary = true;
}

cancelEditSummary(): void {
  this.isEditingSummary = false;
  this.editableSummary = '';
}

async saveEditedSummary(): Promise<void> {
  if (!this.selectedParticipant?.['docid']) return;

  this.isSavingSummary = true;

  try {
    const ref = doc(
      this.firestoreATC,
      'ai_generated_atc_summary',
      this.selectedParticipant['docid']
    );

    await import('@angular/fire/firestore').then(({ updateDoc }) =>
      updateDoc(ref, {
        output: this.editableSummary,
        lastupdate: new Date()
      })
    );

    // Update UI immediately
    this.selectedParticipant['output'] = this.editableSummary;
    this.isEditingSummary = false;

    console.log('ATC summary updated successfully');
  } catch (error) {
    console.error('Failed to update ATC summary:', error);
  } finally {
    this.isSavingSummary = false;
  }
}

}