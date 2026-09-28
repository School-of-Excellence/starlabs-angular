import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SpecialistAppointmentService, Specialist, Team } from '../specialist-appointment.service';
import { SasPeriodBarComponent } from '../sas-period-bar/sas-period-bar.component';
import { SasTeamTableComponent } from '../sas-team-table/sas-team-table.component';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import { Hours, Period, fmtHours, hoursSummary, periodOf } from '../sas-logic';

interface MentorRow { m: Specialist; team: Team; participants: number; hours: Hours; }

/* A&H · Mentors: every mentor with their owned products, team size, participants and team
   utilisation (mentor + team). A row expands into that mentor's team table. Hook prefix: smn */
@Component({
  selector: 'app-sas-mentors',
  imports: [DecimalPipe, MatIconModule, SasLoaderComponent, SasPeriodBarComponent, SasTeamTableComponent],
  template: `
    <div class="sas-phead"><div>
      <h1 data-testid="smn-title">Mentors</h1>
      <p>Each mentor with the products they own, their EIS team, and how the team performed.</p>
    </div></div>
    <div class="sas-stack">
      <div style="display:flex;justify-content:flex-end"><app-sas-period-bar [period]="period" (periodChange)="period = $event; load()" /></div>
      <section class="sas-card">
        <div class="sas-ch"><h2>All mentors</h2><div class="sas-chs">Team utilisation counts the mentor and their EIS. Select a mentor to see the team.</div></div>
        @if (loading) { <app-sas-loader msg="Loading mentors and their teams…" /> }
        @else if (!rows.length) { <div class="sas-empty"><b>No mentors</b>Nobody has the mentor role yet.</div> }
        @else {
          <div class="sas-tw"><table class="sas-tbl" data-testid="smn-table">
            <thead><tr><th>Mentor</th><th>Products</th><th class="num">EIS</th><th class="num">Participants</th><th class="num">Team utilisation</th><th class="num">Delivered</th><th></th></tr></thead>
            <tbody>
              @for (r of rows; track r.m.profileId) {
                <tr class="is-click" data-testid="smn-row" tabindex="0" [attr.aria-expanded]="open === r.m.profileId" (click)="toggle(r.m.profileId)" (keydown.enter)="toggle(r.m.profileId)">
                  <td><b>{{ r.m.name }}</b></td>
                  <td>{{ r.m.productowner.length ? r.m.productowner.join(', ') : '—' }}</td>
                  <td class="num">{{ r.team.memberIds.length }}</td>
                  <td class="num">{{ r.participants }}</td>
                  <td class="num"><div class="sas-util"><span class="sas-bar"><i [style.width.%]="r.hours.pct > 100 ? 100 : r.hours.pct"></i></span><b>{{ r.hours.pct | number: '1.0-0' }}%</b></div></td>
                  <td class="num">{{ fmtHours(r.hours.deliveredMin) }}</td>
                  <td class="r"><mat-icon>{{ open === r.m.profileId ? 'expand_less' : 'expand_more' }}</mat-icon></td>
                </tr>
                @if (open === r.m.profileId) {
                  <tr><td colspan="7" class="sas-sub" data-testid="smn-team">
                    <app-sas-team-table [members]="r.team.memberIds" [productIds]="r.team.productIds" [period]="period" />
                  </td></tr>
                }
              }
            </tbody>
            <tfoot><tr><td>{{ rows.length }} mentors</td><td></td><td class="num">{{ totalEis }}</td><td class="num"></td><td class="num">{{ total.pct | number: '1.0-0' }}%</td><td class="num">{{ fmtHours(total.deliveredMin) }}</td><td></td></tr></tfoot>
          </table></div>
        }
      </section>
    </div>`,
})
export class SasMentorsComponent implements OnInit {
  readonly fmtHours = fmtHours;
  period: Period = periodOf('month', new Date());
  rows: MentorRow[] = [];
  open: string | null = null;
  loading = true;
  total: Hours = hoursSummary([], []);
  totalEis = 0;

  constructor(private svc: SpecialistAppointmentService) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading = true;
    await this.svc.init();
    const mentors = await this.svc.mentors();
    const [teams, wins, appts] = await Promise.all([
      Promise.all(mentors.map(m => this.svc.teamForAtcModels(m.productowner))),
      this.svc.windows(null, this.period.from, this.period.to),
      this.svc.appointments(null, this.period.from, this.period.to),
    ]);
    this.rows = mentors.map((m, i) => {
      const ids = new Set([m.profileId, ...teams[i].memberIds]);
      const mine = appts.filter(r => r.appt.hostIds.some(h => ids.has(h)));
      const onProd = mine.filter(r => r.appt.productId && teams[i].productIds.includes(r.appt.productId));
      return {
        m, team: teams[i],
        participants: new Set(onProd.map(r => r.appt.participantId).filter(Boolean)).size,
        hours: hoursSummary(wins.filter(w => ids.has(w.profileId)), mine.map(r => r.appt)),
      };
    });
    const allIds = new Set(this.rows.flatMap(r => [r.m.profileId, ...r.team.memberIds]));
    this.totalEis = new Set(this.rows.flatMap(r => r.team.memberIds)).size;
    this.total = hoursSummary(wins.filter(w => allIds.has(w.profileId)),
      appts.filter(r => r.appt.hostIds.some(h => allIds.has(h))).map(r => r.appt));
    this.loading = false;
  }

  toggle(id: string) { this.open = this.open === id ? null : id; }
}
