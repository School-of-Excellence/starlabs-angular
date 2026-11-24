import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import {
  SaleAchievedSource, SaleBuyerRow, SaleBuyerType, SaleSectionsView, SaleSort, SaleTools,
  saleExportFileName, saleProductOptions, saleSectionsExportRows, saleSectionsView, saleWindowStartMs,
} from './sale-achieved';

const NO_IDS: ReadonlySet<string> = new Set<string>();

export interface SaleAchievedDialogData {
  /** Live: getters over the dashboard's Sale Achieved state (see SaleAchievedSource). */
  source: SaleAchievedSource;
}

/**
 * Sale Achieved — full-screen list of the enrolled people who bought in the sale window
 * (plan: specs/plans/2026-11-23-sale-achieved-dialog.md). Opened lazily from the dashboard's Sale Achieved card.
 *
 * NO READS here: the buyers are the ones the card already loaded from Watson (READ-ONLY). The source is live, so a
 * dialog opened while that lookup is still running shows the loading state and fills in when it lands.
 * Three stacked sections — New Sales, Funnel Sales, Upgrades (operator 2026-11-23; saleSectionsView decides each
 * purchase's section from the person's whole history) — each one row per buyer with ALL of that section's purchases
 * listed in its Products cell (no expand / collapse, operator 2026-11-23). Tools (From / To inside the window, sort,
 * search, export) and the filters (product, buyer type, amount range, repeat buyers) apply to all three. A buyer with a new_user_data
 * doc — moved to existing or not — carries an "EiFlix New User" chip after the name, in every section (operator
 * 2026-11-23).
 * Hook prefix: wsad-.
 */
@Component({
  selector: 'app-sale-achieved-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatSelectModule],
  templateUrl: './sale-achieved-dialog.component.html',
  styleUrls: ['./sale-achieved-dialog.component.css'],
})
export class SaleAchievedDialogComponent {
  readonly src: SaleAchievedSource;

  from = '';
  to = '';
  query = '';
  sort: SaleSort = 'amount';
  /** Filters (operator 2026-11-23). Products: exact names picked; empty = all. Amounts are per purchase, in rupees. */
  products: string[] = [];
  buyerType: SaleBuyerType = 'all';
  minAmount: number | null = null;
  maxAmount: number | null = null;
  repeatOnly = false;

  /** The last computed view and the inputs it came from — the template reads it on every check. */
  private memo: { buyers: any[]; min: string; ids: ReadonlySet<string>; key: string; view: SaleSectionsView } | null = null;
  private productsMemo: { buyers: any[]; list: string[] } | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: SaleAchievedDialogData,
    private readonly ref: MatDialogRef<SaleAchievedDialogComponent>,
  ) {
    this.src = data.source;
  }

  /** Recomputed only when the buyers (a new array per lookup), the window, the new_user_data ids (a new Set when the
   *  dashboard's read lands — the "EiFlix New User" chips appear then) or a tool changes. */
  private get tools(): SaleTools {
    return {
      from: this.from, to: this.to, query: this.query, sort: this.sort, products: this.products,
      buyerType: this.buyerType, minAmount: this.minAmount, maxAmount: this.maxAmount, repeatOnly: this.repeatOnly,
    };
  }

  get view(): SaleSectionsView {
    const buyers = this.src.status === 'ready' ? this.src.buyers || [] : [];
    const min = this.src.min || '';
    const ids = this.src.newUserIds || NO_IDS;
    const tools = this.tools;
    const key = JSON.stringify(tools);
    const m = this.memo;
    if (m && m.buyers === buyers && m.min === min && m.ids === ids && m.key === key) return m.view;
    const view = saleSectionsView(buyers, tools, saleWindowStartMs(min), ids);
    this.memo = { buyers, min, ids, key, view };
    return view;
  }

  /** The Product filter's choices: every product bought in the window, A→Z. */
  get productOptions(): string[] {
    const buyers = this.src.status === 'ready' ? this.src.buyers || [] : [];
    if (this.productsMemo?.buyers !== buyers) this.productsMemo = { buyers, list: saleProductOptions(buyers) };
    return this.productsMemo.list;
  }

  /** Any of the filters (not the dates, search or sort) is set. */
  get filtersSet(): boolean {
    return !!(this.products.length || this.buyerType !== 'all' || this.minAmount !== null || this.maxAmount !== null || this.repeatOnly);
  }

  get state(): 'loading' | 'unavailable' | 'empty' | 'nomatch' | 'list' {
    const s = this.src.status;
    if (s === 'unavailable') return 'unavailable';
    if (s !== 'ready') return 'loading';
    if (!this.view.allCount) return 'empty';
    return this.view.count ? 'list' : 'nomatch';
  }

  /** The range, sort and search only work on a loaded list with someone in it. */
  get toolsOn(): boolean { return this.src.status === 'ready' && this.view.allCount > 0; }

  get totalText(): string {
    if (this.src.status === 'unavailable') return '—';
    if (this.src.status !== 'ready') return '…';
    return this.view.totalLabel;
  }

  get countText(): string {
    if (this.src.status === 'unavailable') return '—';
    if (this.src.status !== 'ready') return '…';
    return String(this.view.count);
  }

  /** The no-match state's clear action names what it clears. */
  get clearAllLabel(): string {
    const parts = [this.query.trim() ? 'search' : '', this.from || this.to ? 'dates' : '', this.filtersSet ? 'filters' : ''].filter(Boolean);
    if (parts.length > 1) return 'Clear all';
    return 'Clear ' + (parts[0] || 'search');
  }

  /** A range or a search narrows a loaded list: the figures read "Shown" and carry "of <all>". */
  get narrowed(): boolean {
    return this.view.filtered && (this.state === 'list' || this.state === 'nomatch');
  }

  /** No window (a date is missing on the workshop) is not "nobody bought". */
  get hasWindow(): boolean { return !!(this.src.min && this.src.max); }

  setSort(by: SaleSort): void { this.sort = by; }

  setBuyerType(t: SaleBuyerType): void { this.buyerType = t; }

  /** A blank or non-number amount box is an open end. */
  setAmount(which: 'min' | 'max', v: any): void {
    const n = v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    if (which === 'min') this.minAmount = n; else this.maxAmount = n;
  }

  /** The ✕ that is clicked goes away with the filters, so focus moves to the product picker's row start. */
  clearFilters(focus?: HTMLElement): void {
    this.products = [];
    this.buyerType = 'all';
    this.minAmount = null;
    this.maxAmount = null;
    this.repeatOnly = false;
    focus?.focus();
  }

  /** The ✕ that is clicked goes away with the dates, so focus moves to From (not out of the dialog). */
  clearRange(fromInput?: HTMLInputElement): void {
    this.from = '';
    this.to = '';
    fromInput?.focus();
  }

  clearSearch(input?: HTMLInputElement): void {
    this.query = '';
    input?.focus();
  }

  /** Escape in a search with text clears it and keeps the dialog open; in an empty search it closes the dialog. */
  onSearchEscape(event: Event, input?: HTMLInputElement): void {
    if (!this.query) return;
    event.preventDefault();
    event.stopPropagation();
    this.clearSearch(input);
  }

  /** The no-match clear goes away once the list is back, so focus moves to the search. */
  clearAll(searchInput?: HTMLInputElement): void {
    this.from = '';
    this.to = '';
    this.query = '';
    this.clearFilters();
    searchInput?.focus();
  }

  trackRow(_: number, row: SaleBuyerRow): string { return row.key; }

  /** What is shown (range, filters and search applied, in the chosen order), section by section, one row per
   *  purchase, with each purchase's type. */
  exportShown(): void {
    const view = this.view;
    if (!this.src.canExport || !view.count) return;
    this.src.download(saleSectionsExportRows(view), saleExportFileName(this.src.workshopTitle));
  }

  close(): void { this.ref.close(); }
}
