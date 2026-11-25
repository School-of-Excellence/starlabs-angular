import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, combineLatest } from 'rxjs';
import { AppWidget, AppWidgetsService, appNameError, segmentsUsing } from '../app-widgets.service';

interface WidgetRow extends AppWidget {
  usedBy: { id: string; name: string }[];
}

/**
 * Segment Board → "App widgets" (developer role only): every app widget with its app name (one lowercase
 * word the app maps to its widget) and display name. Add, rename either name, soft delete (blocked while a
 * segment's layout holds the widget, with those segments listed).
 */
@Component({
  selector: 'app-app-widgets-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatTooltipModule],
  templateUrl: './app-widgets-dialog.component.html',
  styleUrl: './app-widgets-dialog.component.css',
})
export class AppWidgetsDialogComponent implements OnInit, OnDestroy {
  private svc = inject(AppWidgetsService);
  private sub?: Subscription;

  loading = true;
  loadError = '';
  rows: WidgetRow[] = [];
  search = '';

  newApp = '';
  newDisplay = '';
  adding = false;
  addError = '';

  editId: string | null = null;
  editApp = '';
  editDisplay = '';
  rowBusy: string | null = null;
  rowError: { id: string; text: string; segments?: { id: string; name: string }[] } | null = null;

  ngOnInit(): void {
    const timer = setTimeout(() => { if (this.loading) this.loadError = 'Still loading the widgets… check your connection.'; }, 10000);
    this.sub = combineLatest([this.svc.widgets$(), this.svc.segments$()]).subscribe({
      next: ([widgets, segments]) => {
        clearTimeout(timer);
        this.loading = false;
        this.loadError = '';
        this.rows = widgets.map(w => ({ ...w, usedBy: segmentsUsing(w.id, segments).map(s => ({ id: s.id, name: s.name })) }));
      },
      error: e => { clearTimeout(timer); this.loading = false; this.loadError = e?.message ?? String(e); },
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  get shown(): WidgetRow[] {
    const q = this.search.trim().toLowerCase();
    return q ? this.rows.filter(r => r.displayname.toLowerCase().includes(q) || r.widget.includes(q)) : this.rows;
  }

  /** Live hint under an app-name box (only once something is typed). */
  appHint(v: string): string | null {
    return v.trim() ? appNameError(v) : null;
  }

  async add(): Promise<void> {
    if (this.adding) return;
    this.adding = true; this.addError = '';
    try {
      await this.svc.addWidget(this.newApp, this.newDisplay);
      this.newApp = ''; this.newDisplay = '';
    } catch (e: any) {
      this.addError = e?.message ?? String(e);
    } finally {
      this.adding = false;
    }
  }

  startRename(r: WidgetRow): void {
    this.editId = r.id; this.editApp = r.widget; this.editDisplay = r.displayname; this.rowError = null;
  }

  cancelRename(): void { this.editId = null; this.editApp = ''; this.editDisplay = ''; }

  async saveRename(r: WidgetRow): Promise<void> {
    this.rowBusy = r.id; this.rowError = null;
    try {
      await this.svc.renameWidget(r, this.editApp, this.editDisplay);
      this.cancelRename();
    } catch (e: any) {
      this.rowError = { id: r.id, text: e?.message ?? String(e) };
    } finally {
      this.rowBusy = null;
    }
  }

  async remove(r: WidgetRow): Promise<void> {
    this.rowBusy = r.id; this.rowError = null;
    try {
      const { blockedBy } = await this.svc.softDelete(r);
      if (blockedBy.length) {
        this.rowError = { id: r.id, text: `Can’t delete: ${blockedBy.length === 1 ? 'this segment uses' : 'these segments use'} “${r.displayname}”. Remove it from their Home layout first.`, segments: blockedBy };
      }
    } catch (e: any) {
      this.rowError = { id: r.id, text: e?.message ?? String(e) };
    } finally {
      this.rowBusy = null;
    }
  }

  usedNames(r: WidgetRow): string {
    return r.usedBy.map(s => s.name).join(', ');
  }

  trackId = (_: number, r: WidgetRow) => r.id;
}
