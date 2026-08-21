import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Firestore, doc, serverTimestamp, updateDoc } from '@angular/fire/firestore';
import { CalendarEvent, EventTypeMeta, fmtEventDate } from '../wccalendar.component';

@Component({
  selector: 'app-event-details-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './event-details-dialog.component.html',
  styleUrl: './event-details-dialog.component.css'
})
export class EventDetailsDialogComponent {
  events: CalendarEvent[] = [];
  /** Set when opened from a "+N more" day cell — shown as the list heading. */
  dayLabel = '';
  selected: CalendarEvent | null = null;
  /** True while the Delete button is waiting for its confirming second click. */
  deleteArmed = false;
  isDeleting = false;

  /** Type id -> label/color meta, resolved by the calendar (types are dynamic). */
  private meta: Record<string, EventTypeMeta> = {};
  /** Location tag id -> name. */
  private locations: Record<string, string> = {};

  constructor(
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<EventDetailsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: {
      events: CalendarEvent[]; date: Date | null;
      meta?: Record<string, EventTypeMeta>; locations?: Record<string, string>
    }
  ) {
    this.events = data?.events || [];
    this.meta = data?.meta || {};
    this.locations = data?.locations || {};
    if (data?.date) {
      this.dayLabel = data.date.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
    }
    if (this.events.length === 1) this.selected = this.events[0];
  }

  get showBack(): boolean {
    return this.selected !== null && this.events.length > 1;
  }

  typeLabel(e: CalendarEvent): string {
    return this.meta[e.type]?.label || 'Event';
  }

  typeClass(e: CalendarEvent): string {
    return this.meta[e.type]?.cls || 'cal-event-camp';
  }

  dateRange(e: CalendarEvent): string {
    const start = fmtEventDate(e.startdate);
    const end = fmtEventDate(e.enddate);
    return start === end ? start : `${start} — ${end}`;
  }

  locationName(e: CalendarEvent): string {
    return this.locations[e.location] || '';
  }

  listSub(e: CalendarEvent): string {
    return [this.dateRange(e), this.locationName(e), e.note].filter(Boolean).join(' · ');
  }

  pick(e: CalendarEvent): void {
    this.selected = e;
    this.deleteArmed = false;
  }

  back(): void {
    this.selected = null;
    this.deleteArmed = false;
  }

  edit(): void {
    if (!this.selected) return;
    this.dialogRef.close({ edit: this.selected });
  }

  async remove(): Promise<void> {
    if (!this.selected || this.isDeleting) return;
    if (!this.deleteArmed) {
      this.deleteArmed = true;
      return;
    }
    this.isDeleting = true;
    try {
      // Soft delete — the document stays in Firestore, flagged so the calendar hides it.
      await updateDoc(doc(this.firestore, 'workshopcampaigncalendar', this.selected.id), {
        deleted: true,
        updated: serverTimestamp()
      });
      this.snackBar.open('Event deleted.', 'Close', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error deleting calendar event:', err);
      this.snackBar.open('Error deleting event.', 'Close', { duration: 3000 });
      this.isDeleting = false;
      this.deleteArmed = false;
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
