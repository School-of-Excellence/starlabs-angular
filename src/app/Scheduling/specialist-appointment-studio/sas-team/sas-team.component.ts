import { Component, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SpecialistAppointmentService, Team, ProductBreakdown, TypeBreakdown } from '../specialist-appointment.service';
import { SasPeriodBarComponent } from '../sas-period-bar/sas-period-bar.component';
import { SasTeamTableComponent, TeamSummary } from '../sas-team-table/sas-team-table.component';
import { SasLoaderComponent } from '../sas-loader/sas-loader.component';
import { Period, fmtHours, periodOf } from '../sas-logic';

/* Mentor · My Team. The mentor's products come from users_roles.productowner (Profile list, Product Owner).
   Each product opens to the appointment types in its delivery sequence, their roles and the EIS on each role;
   the team is every EIS found that way. The search box filters by name in both lists. Hook prefix: stm */
@Component({
  selector: 'app-sas-team',
  imports: [DecimalPipe, FormsModule, MatIconModule, SasLoaderComponent, SasPeriodBarComponent, SasTeamTableComponent],
  template: `
    <div class="sas-phead">
      <div>
        <h1 data-testid="stm-title">My Team</h1>
        <p>
          @if (owned.length) { Your products, the appointment types in them and the EIS who deliver each one. }
          @else { You are not a product owner yet. }
        </p>
      </div>
      @if (owned.length) {
        <div class="sas-acts">
          <input class="sas-search" type="search" data-testid="stm-search" placeholder="Search names" aria-label="Search names" [(ngModel)]="q">
        </div>
      }
    </div>
    @if (initialising) {
      <section class="sas-card"><app-sas-loader msg="Loading your products…" /></section>
    } @else if (!owned.length) {
      <section class="sas-card"><div class="sas-empty" data-testid="stm-no-products"><b>No products</b>Ask an admin to tick your product under Product Owner in the Profile list.</div></section>
    } @else {
      <div class="sas-stack">
        <section class="sas-card" data-testid="stm-products">
          <div class="sas-ch">
            <h2>Your products ({{ products.length }})</h2>
            <div class="sas-chs">Select a product to see its appointment types and who holds the EIS role for each.</div>
          </div>
          @if (loadingProducts) { <app-sas-loader msg="Loading your products…" /> }
          @else if (!products.length) { <div class="sas-empty"><b>No products found</b>No product has an ATC model matching {{ owned.join(', ') }}.</div> }
          @else {
            <div class="sas-tw"><table class="sas-tbl">
              <thead><tr><th>Product</th><th>ATC model</th><th class="num">Appointment types</th><th class="num">EIS</th><th></th></tr></thead>
              <tbody>
                @for (p of products; track p.id) {
                  @if (!term || productMatches(p)) {
                    <tr class="is-click" data-testid="stm-product-row" tabindex="0" [attr.aria-expanded]="isOpen(p)" (click)="toggle(p.id)" (keydown.enter)="toggle(p.id)">
                      <td><b>{{ p.name }}</b></td>
                      <td>{{ p.atcmodel }}</td>
                      <td class="num">{{ p.types.length }}</td>
                      <td class="num">{{ eisCount(p) }}</td>
                      <td class="r"><mat-icon>{{ isOpen(p) ? 'expand_less' : 'expand_more' }}</mat-icon></td>
                    </tr>
                    @if (isOpen(p)) {
                      <tr><td colspan="5" class="sas-sub" data-testid="stm-product-detail">
                        @if (!p.types.length) {
                          <div class="sas-empty"><b>No appointment types</b>This product's delivery sequence has no appointment steps.</div>
                        } @else {
                          <table class="sas-tbl">
                            <thead><tr><th>Appointment type</th><th class="num">Length</th><th>Role</th><th>EIS</th></tr></thead>
                            <tbody>
                              @for (t of p.types; track t.id) {
                                @if (!term || typeMatches(t)) {
                                  @if (!t.roles.length) {
                                    <tr data-testid="stm-type-row"><td><b>{{ t.name }}</b></td><td class="num">{{ fmtHours(t.duration) }}</td><td colspan="2" class="sas-muted">No role mapped</td></tr>
                                  }
                                  @for (r of t.roles; track r.id + r.kind; let first = $first) {
                                    @if (!term || eisNames(r.eisIds).length) {
                                      <tr data-testid="stm-type-row">
                                        <td>@if (first || term) { <b>{{ t.name }}</b> }</td>
                                        <td class="num">@if (first || term) { {{ fmtHours(t.duration) }} }</td>
                                        <td>{{ r.name }}@if (r.kind === 'additional') { <small>Additional</small> }</td>
                                        <td data-testid="stm-type-eis">
                                          @if (eisNames(r.eisIds).length) { {{ eisNames(r.eisIds).join(', ') }} }
                                          @else { <span class="sas-muted">No EIS assigned</span> }
                                        </td>
                                      </tr>
                                    }
                                  }
                                }
                              }
                            </tbody>
                          </table>
                        }
                      </td></tr>
                    }
                  }
                }
              </tbody>
            </table></div>
            @if (term && !anyProductMatch()) { <div class="sas-empty"><b>No one named "{{ q }}"</b>in these products.</div> }
          }
        </section>

        <div style="display:flex;justify-content:flex-end"><app-sas-period-bar [period]="period" (periodChange)="period = $event" /></div>
        @if (sum) {
          <div class="sas-stats" data-testid="stm-stats">
            <div class="sas-stat is-accent"><div class="sas-sk"><mat-icon>track_changes</mat-icon>Team utilisation</div><b>{{ sum.hours.pct | number: '1.0-0' }}%</b><small>Delivered ÷ available</small></div>
            <div class="sas-stat is-up"><div class="sas-sk"><mat-icon>check_circle</mat-icon>Delivered</div><b>{{ fmtHours(sum.hours.deliveredMin) }}</b><small>Completed sessions</small></div>
            <div class="sas-stat"><div class="sas-sk"><mat-icon>group</mat-icon>Participants</div><b>{{ sum.participants }}</b><small>Across {{ sum.members }} EIS</small></div>
          </div>
        }
        <section class="sas-card">
          <div class="sas-ch"><h2>Your team</h2><div class="sas-chs">Select someone to see the participants they work with and their next session.</div></div>
          @if (team) { <app-sas-team-table [members]="team.memberIds" [productIds]="team.productIds" [period]="period" [q]="q" (summary)="sum = $event" /> }
          @else { <app-sas-loader msg="Loading your team…" /> }
        </section>
      </div>
    }`,
})
export class SasTeamComponent implements OnInit {
  readonly fmtHours = fmtHours;
  period: Period = periodOf('week', new Date());
  owned: string[] = [];
  products: ProductBreakdown[] = [];
  loadingProducts = true;
  team: Team | null = null;
  sum: TeamSummary | null = null;
  open = new Set<string>();
  q = '';
  initialising = true;

  constructor(private svc: SpecialistAppointmentService) {}

  async ngOnInit() {
    await this.svc.init();
    this.owned = this.svc.roles['productowner'] ?? [];
    this.initialising = false;
    if (!this.owned.length) return;
    [this.products, this.team] = await Promise.all([
      this.svc.productsFor(this.owned), this.svc.teamForAtcModels(this.owned),
    ]);
    this.loadingProducts = false;
  }

  get term() { return this.q.trim().toLowerCase(); }

  /* EIS names on a role, narrowed to the search when there is one. */
  eisNames(ids: string[]): string[] {
    const names = ids.map(id => this.svc.name(id)).sort((a, b) => a.localeCompare(b));
    return this.term ? names.filter(n => n.toLowerCase().includes(this.term)) : names;
  }
  typeMatches(t: TypeBreakdown) { return t.roles.some(r => this.eisNames(r.eisIds).length); }
  productMatches(p: ProductBreakdown) { return p.types.some(t => this.typeMatches(t)); }
  anyProductMatch() { return this.products.some(p => this.productMatches(p)); }
  eisCount(p: ProductBreakdown) { return new Set(p.types.flatMap(t => t.roles.flatMap(r => r.eisIds))).size; }

  /* While searching, every product with a match is open so the names are visible. */
  isOpen(p: ProductBreakdown) { return this.term ? this.productMatches(p) : this.open.has(p.id); }
  toggle(id: string) { this.open.has(id) ? this.open.delete(id) : this.open.add(id); }
}
