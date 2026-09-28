import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SpecialistAppointmentService, Specialist, ApptRow } from '../specialist-appointment.service';
import { SasPeriodBarComponent } from '../sas-period-bar/sas-period-bar.component';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import { AvailWindow, Hours, Period, fmtHours, hoursSummary, periodOf } from '../sas-logic';

/* A&H · Utilisation: per-specialist hours with date, role, product and search filters.
   Same formulas as Home. Product = products.atcmodel; it keeps the EIS on that product's team. Hook prefix: sut */
@Component({
  selector: 'app-sas-utilisation',
  imports: [DecimalPipe, FormsModule, MatIconModule, SasLoaderComponent, SasPeriodBarComponent],
  template: `
    <div class="sas-phead"><div>
      <h1 data-testid="sut-title">Utilisation</h1>
      <p>How each specialist's available hours turned into delivered sessions.</p>
    </div></div>
    <div class="sas-stack">
      <div class="sas-filters">
        <app-sas-period-bar [period]="period" (periodChange)="period = $event; load()" />
        <select class="sas-sel" data-testid="sut-role" aria-label="Role" [(ngModel)]="role">
          <option value="">Mentors and CWs</option><option value="mentor">Mentors</option><option value="cw">CW specialists</option>
        </select>
        <select class="sas-sel" data-testid="sut-product" aria-label="Product" [(ngModel)]="product" (ngModelChange)="onProduct()">
          <option value="">All products</option>
          @for (p of products; track p) { <option [value]="p">{{ p }}</option> }
        </select>
        <input class="sas-search" type="search" data-testid="sut-search" placeholder="Search specialist" aria-label="Search specialist" [(ngModel)]="q">
      </div>
      @if (!loading && !productLoading) {
        <div class="sas-stats" data-testid="sut-stats">
          <div class="sas-stat is-accent"><div class="sas-sk"><mat-icon>track_changes</mat-icon>Utilisation</div><b>{{ total.pct | number: '1.0-0' }}%</b><small>{{ fmtHours(total.deliveredMin) }} of {{ fmtHours(total.availMin) }}</small></div>
          <div class="sas-stat"><div class="sas-sk"><mat-icon>event_available</mat-icon>Booked</div><b>{{ fmtHours(total.bookedMin) }}</b><small>Booked slot time</small></div>
          <div class="sas-stat is-warn"><div class="sas-sk"><mat-icon>error_outline</mat-icon>Unutilised</div><b>{{ fmtHours(total.unutilisedMin) }}</b><small>{{ fmtHours(total.cancelledMin) }} cancelled</small></div>
        </div>
      }
      <section class="sas-card">
        <div class="sas-ch"><h2>By specialist</h2><div class="sas-chs">Utilisation is delivered hours ÷ available hours.</div></div>
        @if (loading || productLoading) { <app-sas-loader [msg]="productLoading ? 'Finding the team for this product…' : 'Loading utilisation…'" /> }
        @else if (!shown.length) { <div class="sas-empty"><b>No specialists match</b>Change the filters or the search.</div> }
        @else {
          <div class="sas-tw"><table class="sas-tbl" data-testid="sut-table">
            <thead><tr><th>Specialist</th><th class="num">Available</th><th class="num">Booked</th><th class="num">Delivered</th><th class="num">Unutilised</th><th class="num">Cancelled</th><th class="num">Utilisation</th></tr></thead>
            <tbody>
              @for (r of shown; track r.s.profileId) {
                <tr data-testid="sut-row">
                  <td><b>{{ r.s.name }}</b><small>{{ r.s.role === 'mentor' ? 'Mentor' : 'CW Specialist' }}</small></td>
                  <td class="num">{{ fmtHours(r.h.availMin) }}</td><td class="num">{{ fmtHours(r.h.bookedMin) }}</td>
                  <td class="num">{{ fmtHours(r.h.deliveredMin) }}</td><td class="num">{{ fmtHours(r.h.unutilisedMin) }}</td>
                  <td class="num">{{ fmtHours(r.h.cancelledMin) }}</td>
                  <td class="num"><div class="sas-util"><span class="sas-bar"><i [style.width.%]="r.h.pct > 100 ? 100 : r.h.pct"></i></span><b>{{ r.h.pct | number: '1.0-0' }}%</b></div></td>
                </tr>
              }
            </tbody>
            <tfoot><tr>
              <td>{{ shown.length }} specialists</td><td class="num">{{ fmtHours(total.availMin) }}</td><td class="num">{{ fmtHours(total.bookedMin) }}</td>
              <td class="num">{{ fmtHours(total.deliveredMin) }}</td><td class="num">{{ fmtHours(total.unutilisedMin) }}</td>
              <td class="num">{{ fmtHours(total.cancelledMin) }}</td><td class="num">{{ total.pct | number: '1.0-0' }}%</td>
            </tr></tfoot>
          </table></div>
        }
      </section>
    </div>`,
})
export class SasUtilisationComponent implements OnInit {
  readonly fmtHours = fmtHours;
  period: Period = periodOf('month', new Date());
  role: '' | 'mentor' | 'cw' = '';
  product = '';
  productTeam: Set<string> | null = null;
  q = '';
  products: string[] = [];
  loading = true;
  productLoading = false;

  private specialists: Specialist[] = [];
  private rows: { s: Specialist; h: Hours }[] = [];

  constructor(private svc: SpecialistAppointmentService) {}

  async ngOnInit() {
    [this.specialists, this.products] = await Promise.all([this.svc.specialists(), this.svc.atcModels()]);
    this.load();
  }

  /* One pass: group the period's windows and appointments by specialist, then summarise each. */
  async load() {
    this.loading = true;
    const [wins, appts] = await Promise.all([
      this.svc.windows(null, this.period.from, this.period.to),
      this.svc.appointments(null, this.period.from, this.period.to),
    ]);
    const w = new Map<string, AvailWindow[]>(), a = new Map<string, ApptRow[]>();
    wins.forEach(x => w.set(x.profileId, [...(w.get(x.profileId) ?? []), x]));
    appts.forEach(x => x.appt.hostIds.forEach(h => a.set(h, [...(a.get(h) ?? []), x])));
    this.rows = this.specialists.map(s => ({ s, h: hoursSummary(w.get(s.profileId) ?? [], (a.get(s.profileId) ?? []).map(r => r.appt)) }));
    this.loading = false;
  }

  async onProduct() {
    if (!this.product) { this.productTeam = null; return; }
    this.productLoading = true;
    this.productTeam = new Set((await this.svc.teamForAtcModels([this.product])).memberIds);
    this.productLoading = false;
  }

  get shown(): { s: Specialist; h: Hours }[] {
    const q = this.q.trim().toLowerCase();
    return this.rows.filter(({ s }) =>
      (!this.role || s.role === this.role) && (!this.productTeam || this.productTeam.has(s.profileId)) && (!q || s.name.toLowerCase().includes(q)));
  }

  /* Sum of the shown rows; utilisation recomputed from the summed hours. */
  get total(): Hours {
    const t = hoursSummary([], []);
    for (const { h } of this.shown) {
      t.availMin += h.availMin; t.bookedMin += h.bookedMin; t.deliveredMin += h.deliveredMin;
      t.cancelledMin += h.cancelledMin; t.completed += h.completed;
    }
    t.unutilisedMin = Math.max(0, t.availMin - t.deliveredMin);
    t.pct = t.availMin ? (t.deliveredMin / t.availMin) * 100 : 0;
    return t;
  }
}
