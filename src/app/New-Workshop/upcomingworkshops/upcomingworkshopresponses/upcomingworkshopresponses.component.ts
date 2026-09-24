import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  Firestore,
  collection,
  doc,
  query,
  where,
  getDocs,
  documentId,
  Timestamp
} from '@angular/fire/firestore';

interface ResponseRow {
  profileid: string;
  created: Date | null;
  name: string;
  countrycode: string;
  phonenumber: string;
  email: string;
  customerstatus: string;
  subscriptionstart: Date | null;
  subscriptionend: Date | null;
}

@Component({
  selector: 'app-upcomingworkshopresponses',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './upcomingworkshopresponses.component.html',
  styleUrl: './upcomingworkshopresponses.component.css'
})
export class UpcomingworkshopresponsesComponent implements OnInit {
  dataSource = new MatTableDataSource<ResponseRow>([]);
  loading = true;
  title = '';
  displayedColumns = [
    'name',
    'phone',
    'email',
    'customerstatus',
    'subscriptionstart',
    'subscriptionend',
    'created'
  ];

  // Table renders after the async load (behind *ngIf), so use setter-based
  // ViewChild to wire sort/paginator once the table is actually in the DOM.
  @ViewChild(MatSort) set matSort(ms: MatSort) {
    if (ms) this.dataSource.sort = ms;
  }
  @ViewChild(MatPaginator) set matPaginator(mp: MatPaginator) {
    if (mp) this.dataSource.paginator = mp;
  }

  constructor(
    private firestore: Firestore,
    private dialogRef: MatDialogRef<UpcomingworkshopresponsesComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.title = data?.title || '';
  }

  private datePipe = new DatePipe('en-US');

  async ngOnInit(): Promise<void> {
    // Search across every column, including the formatted date columns.
    this.dataSource.filterPredicate = (r: ResponseRow, filter: string) => {
      const haystack = [
        r.name,
        r.countrycode,
        r.phonenumber,
        r.email,
        r.customerstatus,
        this.datePipe.transform(r.subscriptionstart, 'mediumDate'),
        this.datePipe.transform(r.subscriptionend, 'mediumDate'),
        this.datePipe.transform(r.created, 'medium')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };

    this.dataSource.sortingDataAccessor = (r: ResponseRow, id: string) => {
      switch (id) {
        case 'phone':
          return (r.phonenumber ?? '').toString().toLowerCase();
        case 'subscriptionstart':
          return r.subscriptionstart?.getTime() || 0;
        case 'subscriptionend':
          return r.subscriptionend?.getTime() || 0;
        case 'created':
          return r.created?.getTime() || 0;
        default:
          return ((r as any)[id] ?? '').toString().toLowerCase();
      }
    };

    const workshopId: string = this.data?.workshopId;
    if (!workshopId) {
      this.loading = false;
      return;
    }

    try {
      // upcomingworkshopref is a DocumentReference field pointing at the
      // /upcomingworkshops/{id} document of the clicked row.
      const workshopRef = doc(this.firestore, 'eiflixhomewidgets', workshopId);
      const q = query(
        collection(this.firestore, 'upcomingworkshopsresponse'),
        where('upcomingworkshopref', '==', workshopRef)
      );
      const snap = await getDocs(q);

      const rows = snap.docs.map(d => {
        const data: any = d.data();
        return {
          profileid: data['profileid'] || '',
          created: this.toDate(data['created'])
        };
      });

      const profileMap = await this.resolveProfiles(rows.map(r => r.profileid));

      this.dataSource.data = rows
        .map(r => {
          const p: any = profileMap[r.profileid] || {};
          return {
            profileid: r.profileid,
            created: r.created,
            name: p['name'] || r.profileid || 'Unknown',
            // countrycode (participant metadata) vs countryCode (new_user_data).
            countrycode: p['countrycode'] ?? p['countryCode'] ?? '',
            phonenumber: p['phonenumber'] ?? '',
            email: p['email'] ?? '',
            customerstatus: p['customerstatus'] ?? '',
            subscriptionstart: this.toDate(p['subscriptionstart']),
            subscriptionend: this.toDate(p['subscriptionend'])
          } as ResponseRow;
        })
        .sort((a, b) => (b.created?.getTime() || 0) - (a.created?.getTime() || 0));
    } catch (err) {
      console.error('Error loading upcoming workshop responses:', err);
    } finally {
      this.loading = false;
    }
  }

  applyFilter(event: Event): void {
    const value = (event.target as HTMLInputElement).value || '';
    this.dataSource.filter = value.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  get total(): number {
    return this.dataSource.data.length;
  }

  private toDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    if (value?.toDate) return value.toDate();
    return new Date(value);
  }

  // Resolve profileid -> full profile document using the same two sources as
  // workshop-dashboard: `participant metadata` (matched on the profileid field)
  // and `new_user_data` (matched on the document id).
  private async resolveProfiles(profileIds: string[]): Promise<{ [id: string]: any }> {
    const map: { [id: string]: any } = {};
    const unique = [...new Set(profileIds)].filter(Boolean);
    if (unique.length === 0) return map;

    const BATCH_SIZE = 30; // Firestore 'in' query limit

    // 1) participant metadata — profileid is a field on the doc.
    const metaBatches: Promise<any>[] = [];
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      metaBatches.push(
        getDocs(query(
          collection(this.firestore, 'participant metadata'),
          where('profileid', 'in', batch)
        ))
      );
    }
    for (const snap of await Promise.all(metaBatches)) {
      for (const d of snap.docs) {
        const data: any = d.data();
        if (data['profileid']) {
          map[data['profileid']] = { id: d.id, ...data };
        }
      }
    }

    // 2) new_user_data — document id == profileid. Only look up the ones still missing.
    const missing = unique.filter(id => !map[id]);
    const userBatches: Promise<any>[] = [];
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      userBatches.push(
        getDocs(query(
          collection(this.firestore, 'new_user_data'),
          where(documentId(), 'in', batch)
        ))
      );
    }
    for (const snap of await Promise.all(userBatches)) {
      for (const d of snap.docs) {
        const data: any = d.data();
        map[d.id] = { id: d.id, ...data };
      }
    }

    return map;
  }

  close(): void {
    this.dialogRef.close();
  }
}
