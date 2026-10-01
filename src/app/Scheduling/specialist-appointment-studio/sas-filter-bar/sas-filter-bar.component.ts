import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { SpecialistAppointmentService, FilterProduct, FilterType } from '../specialist-appointment.service';
import { BookedFilter, SasFilter, fmtHours } from '../sas-logic';

/* Product · Appointment types · (Booked / Not booked). Picking a product ticks its delivery-sequence
   types; they can be unticked afterwards. Options depend on scope,
   see SpecialistAppointmentService.filterOptions. Booked / Not booked is Home only (showBooked).
   Hook prefix: saf */
@Component({
  selector: 'app-sas-filter-bar',
  imports: [FormsModule, MatIconModule, MatSelectModule],
  template: `
    <div class="sas-filters" data-testid="saf-bar">
      <select class="sas-sel sas-fsel" data-testid="saf-product" aria-label="Product" [disabled]="loading"
        [(ngModel)]="productId" (ngModelChange)="onProduct()">
        <option [ngValue]="null">{{ loading ? 'Loading products…' : 'All products' }}</option>
        @for (p of products; track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
      </select>
      <mat-select class="sas-mselect sas-fsel" data-testid="saf-types" multiple placeholder="All appointment types"
        panelClass="sas-mselect-panel" aria-label="Appointment types" [disabled]="loading"
        [(ngModel)]="typeIds" (selectionChange)="emit()">
        @for (t of types; track t.id) {
          <mat-option [value]="t.id" data-testid="saf-type-option">{{ t.name }} · {{ fmtHours(t.duration) }}</mat-option>
        }
      </mat-select>
      @if (showBooked) {
        <div class="sas-seg" role="group" aria-label="Booked or not booked">
          <button data-testid="saf-booked-all" [class.is-on]="booked === 'all'" [attr.aria-pressed]="booked === 'all'" (click)="setBooked('all')">All</button>
          <button data-testid="saf-booked-booked" [class.is-on]="booked === 'booked'" [attr.aria-pressed]="booked === 'booked'" (click)="setBooked('booked')">Booked</button>
          <button data-testid="saf-booked-open" [class.is-on]="booked === 'open'" [attr.aria-pressed]="booked === 'open'" (click)="setBooked('open')">Not booked</button>
        </div>
      }
      @if (active) {
        <button class="sas-link" data-testid="saf-clear" (click)="clear()"><mat-icon>close</mat-icon>Clear</button>
      }
      @if (productId && !typeIds.length) {
        <span class="sas-muted" data-testid="saf-no-types">This product has no appointment types you can give.</span>
      }
    </div>`,
})
export class SasFilterBarComponent implements OnInit {
  @Input() scope: 'all' | 'mentor' | 'cw' = 'all';
  @Input() profileId = '';
  @Input() showBooked = false;
  @Output() filterChange = new EventEmitter<SasFilter>();

  readonly fmtHours = fmtHours;
  loading = true;
  products: FilterProduct[] = [];
  types: FilterType[] = [];
  productId: string | null = null;
  typeIds: string[] = [];
  booked: BookedFilter = 'all';

  constructor(private svc: SpecialistAppointmentService) {}

  async ngOnInit() {
    try {
      const o = await this.svc.filterOptions(this.scope, this.profileId);
      this.products = o.products;
      this.types = o.types;
    } catch (e) {
      console.error('Specialist appointment studio: filter options failed', e);
    }
    this.loading = false;
  }

  get active() { return !!this.productId || this.typeIds.length > 0 || this.booked !== 'all'; }

  onProduct() {
    const p = this.products.find(x => x.id === this.productId);
    this.typeIds = p ? [...p.typeIds] : [];
    this.emit();
  }

  setBooked(b: BookedFilter) { this.booked = b; this.emit(); }

  clear() { this.productId = null; this.typeIds = []; this.booked = 'all'; this.emit(); }

  /* No type ticked: with a product, its own types (possibly none, which matches nothing); without one, no
     type filter. */
  emit() {
    const p = this.products.find(x => x.id === this.productId);
    const typeIds = this.typeIds.length ? [...this.typeIds] : p ? [...p.typeIds] : null;
    this.filterChange.emit({ productId: this.productId, typeIds, booked: this.booked });
  }
}
