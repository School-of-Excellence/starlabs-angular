import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Period, PeriodMode, periodOf, shiftPeriod } from '../sas-logic';

/* Day / Week / Month · previous / next · Today. Emits a new Period; the parent reloads its data.
   Day is offered only where allowDay is set (the calendar screens); there Today opens today's Day view.
   Hook prefix: sap */
@Component({
  selector: 'app-sas-period-bar',
  imports: [MatIconModule],
  template: `
    <div class="sas-filters">
      <div class="sas-pnav">
        <button class="sas-icon-btn" data-testid="sap-prev" (click)="emit(shift(-1))" [attr.aria-label]="'Previous ' + period.mode"><mat-icon>chevron_left</mat-icon></button>
        <span data-testid="sap-label">{{ label() }}</span>
        <button class="sas-icon-btn" data-testid="sap-next" (click)="emit(shift(1))" [attr.aria-label]="'Next ' + period.mode"><mat-icon>chevron_right</mat-icon></button>
      </div>
      <div class="sas-seg" role="group">
        @if (allowDay) {
          <button data-testid="sap-day" [class.is-on]="period.mode === 'day'" [attr.aria-pressed]="period.mode === 'day'" (click)="setMode('day')">Day</button>
        }
        <button data-testid="sap-week" [class.is-on]="period.mode === 'week'" [attr.aria-pressed]="period.mode === 'week'" (click)="setMode('week')">Week</button>
        <button data-testid="sap-month" [class.is-on]="period.mode === 'month'" [attr.aria-pressed]="period.mode === 'month'" (click)="setMode('month')">Month</button>
      </div>
      <button class="sas-btn is-secondary" data-testid="sap-today" (click)="emit(today())">Today</button>
    </div>`,
  providers: [DatePipe],
})
export class SasPeriodBarComponent {
  @Input({ required: true }) period!: Period;
  @Input() allowDay = false;
  @Output() periodChange = new EventEmitter<Period>();

  constructor(private datepipe: DatePipe) {}

  label(): string {
    const p = this.period, last = new Date(p.to.getTime() - 86400000);
    if (p.mode === 'day') return this.datepipe.transform(p.from, 'EEE, d MMM y') ?? '';
    return p.mode === 'week'
      ? `${this.datepipe.transform(p.from, 'd MMM')} – ${this.datepipe.transform(last, 'd MMM y')}`
      : this.datepipe.transform(p.from, 'MMMM y') ?? '';
  }

  shift(dir: 1 | -1) { return shiftPeriod(this.period, dir); }
  today() { return periodOf(this.allowDay ? 'day' : this.period.mode, new Date()); }
  setMode(m: PeriodMode) { if (m !== this.period.mode) this.emit(periodOf(m, this.period.from)); }
  emit(p: Period) { this.periodChange.emit(p); }
}
