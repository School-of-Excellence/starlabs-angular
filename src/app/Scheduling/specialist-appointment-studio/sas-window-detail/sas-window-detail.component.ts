import { Component, Inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { SpecialistAppointmentService, ApptRow } from '../specialist-appointment.service';
import { AvailWindow, apptStatus, fmtHours, windowStatus } from '../sas-logic';

export interface WindowDetailData { w: AvailWindow; sessions: ApptRow[]; }
/* Closes with { delete: true } or { open: row }; the calendar does the work. */
export type WindowDetailResult = { delete: true } | { open: ApptRow } | undefined;

/* Availability details: what a window offers (delivery types with length, slots given / still open)
   and the sessions booked in it. Delete only while nothing is booked and it has not started.
   Hook prefix: saw */
@Component({
  selector: 'app-sas-window-detail',
  imports: [DatePipe, MatIconModule],
  template: `
    <div class="sas-dialog" data-testid="saw-dialog">
      <h2>Availability details</h2>
      <p class="sas-dsub" data-testid="saw-when">
        {{ w.start | date: 'EEEE, d MMM y' }} · {{ w.start | date: 'H:mm' }} – {{ w.end | date: 'H:mm' }}
        · {{ svc.name(w.profileId) }}
      </p>
      <span class="sas-pill" data-testid="saw-status">{{ status }}</span>

      <span class="sas-lbl">Delivery types</span>
      <div class="sas-tw"><table class="sas-tbl" data-testid="saw-types">
        <thead><tr><th>Type</th><th class="num">Length</th><th class="num">Slots given</th><th class="num">Booked</th><th class="num">Still open</th></tr></thead>
        <tbody>
          @for (t of types; track t.id) {
            <tr data-testid="saw-type-row">
              <td><b>{{ t.name }}</b></td><td class="num">{{ fmtHours(t.duration) }}</td>
              <td class="num">{{ t.given }}</td><td class="num">{{ t.booked }}</td><td class="num">{{ t.open }}</td>
            </tr>
          }
        </tbody>
      </table></div>

      <span class="sas-lbl">Bookings</span>
      @if (!data.sessions.length) { <p class="sas-muted" data-testid="saw-no-bookings">Nothing booked in this window.</p> }
      @for (r of data.sessions; track r.appt.id) {
        <button class="sas-slot is-sess" data-testid="saw-booking" (click)="ref.close({ open: r })">
          <b>{{ r.appt.start | date: 'H:mm' }} – {{ r.appt.end | date: 'H:mm' }} · {{ typeName(r) }}</b>
          <small>{{ svc.name(r.appt.participantId) }} · {{ statusOf(r) }}</small>
        </button>
      }

      <div class="sas-dfoot">
        @if (canDelete) {
          <button class="sas-btn is-danger" data-testid="saw-delete" (click)="ref.close({ delete: true })"><mat-icon>delete_outline</mat-icon>Delete</button>
        }
        <button class="sas-btn is-secondary" data-testid="saw-close" (click)="ref.close()">Close</button>
      </div>
    </div>`,
})
export class SasWindowDetailComponent {
  readonly fmtHours = fmtHours;
  readonly w: AvailWindow;
  readonly now = new Date();
  readonly types: { id: string; name: string; duration: number; given: number; booked: number; open: number }[];
  readonly status: string;
  readonly canDelete: boolean;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: WindowDetailData,
    public ref: MatDialogRef<SasWindowDetailComponent, WindowDetailResult>,
    public svc: SpecialistAppointmentService,
  ) {
    this.w = data.w;
    this.types = this.w.typeIds.map(id => {
      const slots = this.w.slots.filter(s => s.typeId === id), meta = svc.mapAppointmentData[id] ?? {};
      return {
        id, name: meta['appointmenttype'] ?? id, duration: meta['duration'] ?? 0, given: slots.length,
        booked: slots.filter(s => s.booked).length,
        open: slots.filter(s => s.available && !s.booked && s.start > this.now).length,
      };
    });
    this.status = windowStatus(this.w, data.sessions.map(r => r.appt), this.now);
    this.canDelete = this.w.start > this.now && !this.w.slots.some(s => s.booked);
  }

  typeName(r: ApptRow) { return (r.appt.typeId && this.svc.mapAppointment[r.appt.typeId]) || 'Appointment'; }
  statusOf(r: ApptRow) { const s = apptStatus(r.appt, this.now); return s === 'Pending' ? 'Completion pending' : s; }
}
