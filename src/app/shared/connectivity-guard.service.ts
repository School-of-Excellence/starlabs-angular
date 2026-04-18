import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConnectivityAlertComponent } from './connectivity-alert.component';

export type SaveDraftFn = () => Promise<void> | void;

interface Registration {
  saveDraft: SaveDraftFn;
}

@Injectable({ providedIn: 'root' })
export class ConnectivityGuardService {
  private dialog = inject(MatDialog);

  private dialogRef: MatDialogRef<ConnectivityAlertComponent> | null = null;
  private pingTimer: any = null;
  private state: 'good' | 'bad' = 'good';
  private badSince: number | null = null;
  private readonly BAD_DEBOUNCE_MS = 3000;
  private readonly PING_INTERVAL_MS = 15000;
  private readonly PING_URL = 'https://www.gstatic.com/generate_204';

  private registrations = new Set<Registration>();
  private started = false;

  private onlineHandler = () => this.evaluate();
  private offlineHandler = () => this.evaluate(true);
  private connectionChangeHandler = () => this.evaluate();

  /**
   * Register a component's draft-save callback. The returned function
   * unregisters it (call in ngOnDestroy).
   */
  register(saveDraft: SaveDraftFn): () => void {
    const reg: Registration = { saveDraft };
    this.registrations.add(reg);
    if (!this.started) this.start();
    return () => {
      this.registrations.delete(reg);
      if (this.registrations.size === 0) this.stop();
    };
  }

  private start() {
    this.started = true;
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', this.connectionChangeHandler);
    this.pingTimer = setInterval(() => this.ping(), this.PING_INTERVAL_MS);
    this.evaluate();
  }

  private stop() {
    this.started = false;
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    const conn = (navigator as any).connection;
    conn?.removeEventListener?.('change', this.connectionChangeHandler);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.dialogRef?.close();
    this.dialogRef = null;
    this.state = 'good';
    this.badSince = null;
  }

  private async ping() {
    if (!navigator.onLine) { this.evaluate(true); return; }
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      await fetch(this.PING_URL + '?ts=' + started, {
        method: 'GET', cache: 'no-store', mode: 'no-cors', signal: ctrl.signal
      });
      clearTimeout(t);
      this.evaluate(false, Date.now() - started);
    } catch {
      this.evaluate(true);
    }
  }

  private isBad(forceOffline = false, rtt?: number): boolean {
    if (forceOffline || !navigator.onLine) return true;
    const conn = (navigator as any).connection;
    if (conn?.effectiveType && ['slow-2g', '2g'].includes(conn.effectiveType)) return true;
    if (conn?.downlink != null && conn.downlink > 0 && conn.downlink < 0.3) return true;
    if (rtt != null && rtt > 4000) return true;
    return false;
  }

  private evaluate(forceOffline = false, rtt?: number) {
    const bad = this.isBad(forceOffline, rtt);
    if (bad) {
      if (this.badSince == null) this.badSince = Date.now();
      const sustained = Date.now() - this.badSince >= this.BAD_DEBOUNCE_MS || forceOffline || !navigator.onLine;
      if (sustained && this.state !== 'bad') {
        this.state = 'bad';
        this.handleBadConnection();
      }
    } else {
      this.badSince = null;
      if (this.state !== 'good') {
        this.state = 'good';
        this.dialogRef?.close();
        this.dialogRef = null;
      }
    }
  }

  private async handleBadConnection() {
    if (this.dialogRef) return;
    if (this.registrations.size === 0) return;

    const offline = !navigator.onLine;
    this.dialogRef = this.dialog.open(ConnectivityAlertComponent, {
      disableClose: true,
      width: '420px',
      data: { offline, draftStatus: 'saving' }
    });

    const inst = this.dialogRef.componentInstance;
    inst.setOffline(offline);
    inst.setDraftStatus('saving');

    // Run all registered save handlers in parallel. Dialog stays "saving"
    // until all resolve; flips to 'saved' if all succeed, 'failed' if any throws.
    const results = await Promise.allSettled(
      Array.from(this.registrations).map(r => Promise.resolve().then(() => r.saveDraft()))
    );
    const anyFailed = results.some(r => r.status === 'rejected');
    if (anyFailed) {
      results.filter(r => r.status === 'rejected').forEach(r => console.error('Draft save failed during bad connection:', (r as PromiseRejectedResult).reason));
      inst.setDraftStatus('failed');
    } else {
      inst.setDraftStatus('saved');
    }

    inst.setOffline(!navigator.onLine);
  }
}
