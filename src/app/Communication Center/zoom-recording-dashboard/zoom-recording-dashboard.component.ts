import { Component, inject, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, getDocs, collection, orderBy, query } from '@angular/fire/firestore';
import { MatTableModule, MatTableDataSource } from "@angular/material/table";
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FormsModule, FormControl, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-zoom-recording-dashboard',
  imports: [MatTableModule, CommonModule, MatFormFieldModule,
    MatInput, FormsModule, MatDatepickerModule,
    MatSelectModule, MatPaginatorModule, MatButtonModule, ReactiveFormsModule],
  templateUrl: './zoom-recording-dashboard.component.html',
  styleUrl: './zoom-recording-dashboard.component.css',
  providers: [provideNativeDateAdapter()],
})
export class ZoomRecordingDashboardComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator: MatPaginator;
  private firestore: Firestore = inject(Firestore)

  private collRef = collection(this.firestore, 'zoom recordings backup')
  public recordsBackup: MatTableDataSource<any> = new MatTableDataSource([])
  readonly tableHeaders = ['meetingId', 'meetingTopic', 'hostEmail', 'duration',
    'status', 'successCount', 'failedCount', 'startTime', 'totalSize', 'totalFiles', 'file']

  public files: Array<object> | null = null
  readonly filetableHeaders = ['fileName', 'fileSize', 'fileType', 'status']

  // form group
  form = new FormGroup({
    search: new FormControl<string>(''),
    startDate: new FormControl<Date | null>(new Date()),
    endDate: new FormControl<Date | null>(new Date()),
    status: new FormControl<string>('')
  })

  constructor() {

  }

  // init method to reterive all records
  async ngOnInit(): Promise<void> {
    const q = query(this.collRef, orderBy('timestamp', 'desc'))
    this.recordsBackup.data = (await getDocs(q)).docs.map((doc) => {
      const data = doc.data()
      return { id: doc.id, ...data, ...{ startTime: typeof data['startTime'] === 'string' ? data['startTime'] : data['startTime']?.toDate() } }
    })

    this.recordsBackup.filterPredicate = this.filterPredicate
    this.recordsBackup.paginator = this.paginator;
    this.applyFilter()

  }

  // optional paginator adding method
  ngAfterViewInit(): void {
    this.recordsBackup.paginator = this.paginator;
  }


  // filtering method
  applyFilter() {
    this.recordsBackup.filter = JSON.stringify(this.form.value)
  }

  // open file popup box
  openFileModel(recordId: string) {
    if (this.recordsBackup !== null) {
      const file = this.recordsBackup.data.find((file) => file.id === recordId)?.files ?? []
      this.files = file
    }
  }

  // close file popup box
  closeFileModel() {
    this.files = null
  }

  // filter predicate for filtering recordes
  private filterPredicate(data: any, filter: string) {
    const parsedFilter = JSON.parse(filter)
    let search = true
    let date = true
    let status = true

    // text search filter
    if (parsedFilter.search) {
      parsedFilter.search = parsedFilter.search.toLowerCase().trim()
      const meetingTopic = data.meetingTopic.toLowerCase().trim()
      const hostEmail = data.hostEmail.toLowerCase()
      search = (String(data.meetingId).startsWith(parsedFilter.search) || meetingTopic.startsWith(parsedFilter.search) || hostEmail.startsWith(parsedFilter.search))
    }

    // start time filter
    if (parsedFilter.startDate && parsedFilter.endDate) {
      const startDate = new Date(parsedFilter.startDate)
      const endDate = new Date(parsedFilter.endDate)
      const record = new Date(data.startTime)
      record.setHours(0, 0, 0, 0)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(0, 0, 0, 0)
      date = (startDate <= record) && (record <= endDate)

    }

    // status filter 
    if (parsedFilter.status) {
      status = data.status === parsedFilter.status
    }
    return search && date && status
  }

  // function to get value form an object safley
  formatDisplayData(object: any, property: string) {
    if (object.hasOwnProperty(property)) {
      return object[property]
    }
    return ''
  }


}
