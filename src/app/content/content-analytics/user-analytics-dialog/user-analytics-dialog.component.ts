import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-user-analytics-dialog',
  imports: [CommonModule, MatDialogModule, MatIconModule],
  templateUrl: './user-analytics-dialog.component.html',
  styleUrl: './user-analytics-dialog.component.css'
})
export class UserAnalyticsDialogComponent {

  logs: any[] = [];
  profile: any = {};
  name: string = '';
  journeyMap: any = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { logs: any[]; profileData: any; name: string, journeyMap: any },
    public dialogRef: MatDialogRef<UserAnalyticsDialogComponent>
  ) {
    this.logs = (data.logs || []).slice().sort((a, b) => {
      const da = a.logdate?.toDate ? a.logdate.toDate() : new Date(a.logdate);
      const db = b.logdate?.toDate ? b.logdate.toDate() : new Date(b.logdate);
      return db.getTime() - da.getTime();
    });
    this.profile = data.profileData || {};
    this.name = data.name || '';
    this.journeyMap = data.journeyMap || {};
  }

  close() {
    this.dialogRef.close();
  }

  formatSeconds(sec: number): string {
    if (!sec || sec <= 0) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  formatDate(logdate: any): string {
    if (!logdate) return '—';
    const d = logdate?.toDate ? logdate.toDate() : new Date(logdate);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  getCompletionPct(log: any): number {
    if (!log.totalruntime || log.totalruntime === 0) return 0;
    return Math.min(100, Math.round((log.totaltimespend / log.totalruntime) * 100));
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ').filter(p => p.length > 0);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
  }

  get totalWatchHrs(): string {
    const secs = this.logs.reduce((s, l) => s + (l.totaltimespend || 0), 0);
    return this.formatSeconds(secs);
  }

  get totalLogs(): number {
    return this.logs.length;
  }

  get completedLogs(): number {
    return this.logs.filter(l => l.status === 'complete').length;
  }
}