import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpecialistAppointmentService } from '../specialist-appointment.service';
import { fmtHours } from '../sas-logic';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';

interface TypeRow { id: string; name: string; duration: number; group: boolean; maxbooking: number | null; changework: boolean; }

/* A&H · Settings: delivery types and their length, view only (lengths are edited where appointment
   types are managed today). Hook prefix: sst */
@Component({
  selector: 'app-sas-settings',
  imports: [FormsModule, SasLoaderComponent],
  template: `
    <div class="sas-phead"><div>
      <h1 data-testid="sst-title">Settings</h1>
      <p>Delivery types and their length. Start times are cut from these lengths. This page is view only.</p>
    </div></div>
    <section class="sas-card">
      <div class="sas-ch">
        <h2>Delivery types ({{ shown.length }})</h2>
        <div class="sas-ca"><input class="sas-search" type="search" data-testid="sst-search" placeholder="Search delivery type" aria-label="Search delivery type" [(ngModel)]="q"></div>
      </div>
      @if (loading) { <app-sas-loader msg="Loading delivery types…" /> } @else {
      <div class="sas-tw"><table class="sas-tbl" data-testid="sst-table">
        <thead><tr><th>Delivery type</th><th class="num">Length</th><th>Group</th><th>Change work</th></tr></thead>
        <tbody>
          @for (t of shown; track t.id) {
            <tr data-testid="sst-row">
              <td><b>{{ t.name }}</b></td>
              <td class="num">{{ fmtHours(t.duration) }}</td>
              <td>{{ t.group ? 'Yes' + (t.maxbooking ? ' · up to ' + t.maxbooking : '') : '—' }}</td>
              <td>{{ t.changework ? 'Required' : '—' }}</td>
            </tr>
          }
        </tbody>
      </table></div>
      }
    </section>`,
})
export class SasSettingsComponent implements OnInit {
  readonly fmtHours = fmtHours;
  rows: TypeRow[] = [];
  q = '';
  loading = true;

  constructor(private svc: SpecialistAppointmentService) {}

  async ngOnInit() {
    await this.svc.init();
    this.rows = Object.entries(this.svc.mapAppointmentData).map(([id, d]: [string, any]) => ({
      id, name: d['appointmenttype'] ?? id, duration: d['duration'] ?? 0, group: !!d['groupappointment'],
      maxbooking: d['maxbooking'] ?? null, changework: !!d['ischangeworkrequired'],
    })).sort((a, b) => a.name.localeCompare(b.name));
    this.loading = false;
  }

  get shown() {
    const q = this.q.trim().toLowerCase();
    return q ? this.rows.filter(r => r.name.toLowerCase().includes(q)) : this.rows;
  }
}
