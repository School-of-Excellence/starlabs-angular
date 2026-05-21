import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConnectivityAlertComponent } from './connectivity-alert.component';

export type SaveDraftFn = () => Promise<void> | void;
export type ConnectivityState = 'online' | 'offline' | 'reconnecting';


@Injectable({ providedIn: 'root' })
export class ConnectivityGuardService {
  private readonly PING_URL = 'https://www.gstatic.com/generate_204';
  private readonly PING_INTERVAL_MS = 15000;
  private readonly BAD_DEBOUNCE_MS = 3000;
  private stateSubject = new BehaviorSubject<ConnectivityState>('online');
  connectivity$: Observable<ConnectivityState> = this.stateSubject.pipe(distinctUntilChanged());
  private pingTimer: any = null;
  private badSince: number | null = null;
  private wasOffline = false;
  private started = false;
  private refCount = 0;
  private dialogRef: MatDialogRef<ConnectivityAlertComponent> | null = null;
  private saveDraftFn: SaveDraftFn | null = null;
  private dialog = inject(MatDialog);
  private handlingBadConnection = false;
  private userDismissedWhileOffline = false;  
  private onlineHandler  = () => this.handleOnlineEvent();
  private offlineHandler = () => this.evaluate(true);
  private connChangeHandler = () => this.evaluate();

  register(saveDraft?: SaveDraftFn): () => void {
      this.refCount++;
      if (saveDraft) this.saveDraftFn = saveDraft;
      if (!this.started) this.start();
      return () => {
        this.refCount = Math.max(0, this.refCount - 1);
        if (this.refCount === 0) this.stop();
      };
    }

  get currentState(): ConnectivityState {
    return this.stateSubject.value;
  }

  get isOnline(): boolean {
    return this.stateSubject.value === 'online';
  }

  private start() {
    this.started = true;
    window.addEventListener('online',  this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    (navigator as any).connection?.addEventListener?.('change', this.connChangeHandler);
    this.pingTimer = setInterval(() => this.ping(), this.PING_INTERVAL_MS);
    this.evaluate();
  }

  private stop() {
      this.started = false;
      window.removeEventListener('online',  this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
      (navigator as any).connection?.removeEventListener?.('change', this.connChangeHandler);
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.badSince = null;
      this.dialogRef?.close();
      this.dialogRef = null;
      this.saveDraftFn = null;
      this.userDismissedWhileOffline = false;
      this.confirmSynced();
    }

  private handleOnlineEvent() {
    if (this.wasOffline) {
      this.stateSubject.next('reconnecting');
    }
    this.ping().then(() => this.evaluate());
  }

  private async ping() {
    if (!navigator.onLine) { this.evaluate(true); return; }
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5000);
      await fetch(`${this.PING_URL}?ts=${Date.now()}`, {
        method: 'GET', cache: 'no-store', mode: 'no-cors', signal: ctrl.signal
      });
      clearTimeout(timeout);
      this.evaluate(false);
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
      const sustained = (Date.now() - this.badSince >= this.BAD_DEBOUNCE_MS)
        || forceOffline
        || !navigator.onLine;

      if (sustained) {
        this.wasOffline = true;
        this.stateSubject.next('offline');
        this.handleBadConnection();
      }
      } else {
        this.badSince = null;

        if (this.wasOffline || this.userDismissedWhileOffline) {
          if (this.stateSubject.value !== 'reconnecting') {
            this.stateSubject.next('reconnecting');
          }

          const inst = this.dialogRef?.componentInstance;

          if (inst) {
            // Dialog still open — drive it to restored screen
            inst.onConnectivityRestored();
            setTimeout(() => {
              this.dialogRef?.close();
              this.dialogRef = null;
              this.confirmSynced();

            }, 2500);
          } else if (this.userDismissedWhileOffline) {
            // User dismissed while offline — open fresh restored dialog
            this.dialogRef = this.dialog.open(ConnectivityAlertComponent, {
              disableClose: true,
              hasBackdrop: true,
              panelClass: 'connectivity-snackbar',
              width: '460px',
              data: { offline: false, startScreen: 'restored' }
            });
            this.dialogRef.afterClosed().subscribe(() => {
              this.dialogRef = null;
              this.confirmSynced();

            });
          } else {
            this.confirmSynced();
          }
        } else {
          this.stateSubject.next('online');
        }
      }
  }

  // Called by the form component after a successful Firestore sync. 
  confirmSynced() {
    this.wasOffline = false;
    this.userDismissedWhileOffline = false;
    this.handlingBadConnection = false;
    this.stateSubject.next('online');
  }

  private async handleBadConnection() {
    if (this.dialogRef || this.handlingBadConnection) return;
    this.handlingBadConnection = true;
    this.dialogRef = this.dialog.open(ConnectivityAlertComponent, {
          disableClose: true,
          hasBackdrop: true,
          panelClass: 'connectivity-snackbar',
          width: '460px',
          data: { offline: !navigator.onLine }
        });
    this.dialogRef.afterClosed().subscribe(() => {
      if (this.wasOffline) {
        this.userDismissedWhileOffline = true;
        this.dialogRef = null;
      } else {
        this.dialogRef = null;
        this.handlingBadConnection = false;
      }
    });

    const inst = this.dialogRef.componentInstance;
    inst.setDraftStatus('saving');

    if (this.saveDraftFn) {
      try {
        await Promise.resolve(this.saveDraftFn());
        inst.setDraftStatus('saved');
      } catch (err) {
        console.error('Draft save failed during bad connection:', err);
        inst.setDraftStatus('failed');
      }
    } else {
      inst.setDraftStatus('idle');
    }
  }
}