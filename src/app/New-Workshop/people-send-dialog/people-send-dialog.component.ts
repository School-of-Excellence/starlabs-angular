import { AfterViewInit, Component, Inject, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectionModel } from '@angular/cdk/collections';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  PeopleSendDialogData, PeopleSendResult, PeopleSendRow, peopleSendCsv, peopleSendFileName, peopleSendMatches, peopleSendPhone, toPeopleSendRow,
} from './people-send-dialog.model';

/**
 * Shared "pick people, then send" dialog (operator 2026-10-21). First caller: Hot Leads Today on the
 * EiFlix operations dashboard ("Send to Slack"). It shows ONLY what the caller passes — no reads.
 * Send enables once at least one person is selected; what Send does is still to be decided.
 */
@Component({
  selector: 'app-people-send-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatTableModule, MatSortModule, MatPaginatorModule,
    MatCheckboxModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
  ],
  templateUrl: './people-send-dialog.component.html',
  styleUrl: './people-send-dialog.component.css',
})
export class PeopleSendDialogComponent implements AfterViewInit, OnDestroy {
  readonly columns = ['select', 'name', 'email', 'phonenumber', 'usertype', 'journey'];
  readonly phone = peopleSendPhone;
  readonly dataSource: MatTableDataSource<PeopleSendRow>;
  readonly selection = new SelectionModel<PeopleSendRow>(true, []);
  search = '';
  /** Send in flight, and what the caller reported afterwards. */
  sending = false;
  sendResult: PeopleSendResult | null = null;

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /** Some screens (the EiFlix side panel) sit above the overlay layer; lift it while this is open. */
  private static readonly LIFT_CLASS = 'psd-over-panels';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PeopleSendDialogData,
    private dialogRef: MatDialogRef<PeopleSendDialogComponent>,
    private overlay: OverlayContainer,
    private zone: NgZone,
  ) {
    this.dataSource = new MatTableDataSource<PeopleSendRow>((data?.rows || []).map(toPeopleSendRow));
    this.dataSource.filterPredicate = (row, text) => peopleSendMatches(row, text);
    this.overlay.getContainerElement().classList.add(PeopleSendDialogComponent.LIFT_CLASS);
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
    // Sort text case-insensitively; blanks last.
    this.dataSource.sortingDataAccessor = (row, key) =>
      String((key === 'phonenumber' ? peopleSendPhone(row) : (row as any)[key]) || '\uffff').toLowerCase();
  }

  ngOnDestroy(): void {
    this.overlay.getContainerElement().classList.remove(PeopleSendDialogComponent.LIFT_CLASS);
  }

  applySearch(): void {
    this.dataSource.filter = this.search.trim().toLowerCase();
    this.paginator?.firstPage();
  }

  /** The header box works on everyone the search currently shows (all pages). */
  get shown(): PeopleSendRow[] { return this.dataSource.filteredData; }
  get allShownSelected(): boolean { return this.shown.length > 0 && this.shown.every(r => this.selection.isSelected(r)); }
  get someShownSelected(): boolean { return this.shown.some(r => this.selection.isSelected(r)) && !this.allShownSelected; }

  toggleAllShown(): void {
    if (this.allShownSelected) this.selection.deselect(...this.shown);
    else this.selection.select(...this.shown);
  }

  /** The selected people in the table's current sort order (what Send and Export both use). */
  private pickedInOrder(): PeopleSendRow[] {
    const ordered = this.sort ? this.dataSource.sortData([...this.dataSource.data], this.sort) : [...this.dataSource.data];
    return ordered.filter(r => this.selection.isSelected(r));
  }

  /** Hand the selected people to the caller's Send; show what it reports. Clears the picks on success. */
  async send(): Promise<void> {
    if (!this.data?.send || !this.selection.hasValue() || this.sending) return;
    const picked = this.pickedInOrder();
    this.sending = true;
    this.sendResult = null;
    let result: PeopleSendResult;
    try {
      result = await this.data.send(picked);
    } catch (err) {
      console.error('people-send-dialog: send failed', err);
      result = { ok: false, message: 'Could not send. Please try again.' };
    }
    this.zone.run(() => {
      this.sending = false;
      this.sendResult = result;
      if (result.ok) this.selection.clear();
    });
  }

  /**
   * Export the SELECTED people as CSV (operator 2026-10-22), in the table's current sort order. Uses
   * only what the caller passed — nothing is read. A byte-order mark keeps names readable in Excel.
   */
  exportCsv(): void {
    if (!this.selection.hasValue()) return;
    const picked = this.pickedInOrder();
    const blob = new Blob(['\uFEFF' + peopleSendCsv(picked)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = peopleSendFileName(this.data?.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  close(): void {
    this.dialogRef.close();
  }
}
