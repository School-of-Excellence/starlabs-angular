import { NativeDateAdapter } from '@angular/material/core';

export const WC2_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05 Sep 2026" for dates and 24h "10:00" for times, matching the approved v2 design. */
export class EnrollmentDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: any): string {
    if (!this.isValid(date)) throw Error('EnrollmentDateAdapter: Cannot format invalid date.');
    if (displayFormat && typeof displayFormat === 'object' && 'hour' in displayFormat) {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    if (displayFormat && typeof displayFormat === 'object' && displayFormat.day) {
      return `${String(date.getDate()).padStart(2, '0')} ${WC2_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    }
    return super.format(date, displayFormat);
  }
}
