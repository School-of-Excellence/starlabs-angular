import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export type DraftStatus = 'saving' | 'saved' | 'failed' | 'idle';
export type DialogScreen = 'prompt' | 'waiting' | 'offline' | 'restored';

@Component({
  selector: 'app-connectivity-alert',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="connectivity-banner">
      <div class="step-dots">
        <span class="dot" [class.active]="true"></span>
        <span class="dot" [class.active]="currentScreen() !== 'prompt'"></span>
        <span class="dot" [class.active]="currentScreen() === 'offline' || currentScreen() === 'restored'"></span>
      </div>
      <!-- Initial prompt -->
      <ng-container *ngIf="currentScreen() === 'prompt'">
        <div class="banner-header">
          <mat-icon class="banner-icon">wifi_off</mat-icon>
          <p class="banner-title">No internet connection</p>
        </div>
        <p class="banner-subtitle">You're offline. Continue filling the form?</p>
        <div class="action-row">
          <button class="btn-secondary" (click)="goWaiting()">
            <mat-icon>schedule</mat-icon>
            Wait for Internet
          </button>
          <button class="btn-primary" (click)="goContinueOffline()">
            <mat-icon>edit_note</mat-icon>
            Continue Offline
          </button>
        </div>
      </ng-container>

      <!--  Waiting for internet -->
      <ng-container *ngIf="currentScreen() === 'waiting'">
        <div class="waiting-body">
          <div class="pulse-wrapper">
            <mat-icon class="wifi-icon">wifi_off</mat-icon>
            <div class="pulse-ring"></div>
          </div>
          <p class="banner-title">Please wait until connectivity is restored</p>
          <p class="waiting-sub">Waiting for a stable connection…</p>
          <div class="bounce-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </ng-container>

      <!-- Continue offline -->
      <ng-container *ngIf="currentScreen() === 'offline'">
        <div class="banner-header">
          <mat-icon class="banner-icon">save</mat-icon>
          <p class="banner-title">Draft being saved on this device</p>
        </div>
        <p class="banner-subtitle">
          Your draft is being saved on this device. Do not refresh or close the tab.
          You can submit the form once the network is back.
        </p>
        <div class="draft-status" [ngClass]="draftStatus()">
          <ng-container [ngSwitch]="draftStatus()">
            <ng-container *ngSwitchCase="'saving'">
              <mat-icon class="spin">sync</mat-icon>
              <span>Saving draft locally…</span>
            </ng-container>
            <ng-container *ngSwitchCase="'saved'">
              <mat-icon>check_circle</mat-icon>
              <span>Draft saved on this device</span>
            </ng-container>
            <ng-container *ngSwitchCase="'failed'">
              <mat-icon>error</mat-icon>
              <span>Draft save failed — please don't close this tab</span>
            </ng-container>
            <ng-container *ngSwitchDefault>
              <mat-icon>pending</mat-icon>
              <span>Preparing to save draft…</span>
            </ng-container>
          </ng-container>
        </div>
        <button class="btn-primary full-width" (click)="dialogRef.close()">
          Okay
        </button>
      </ng-container>

      <!-- Internet restored -->
      <ng-container *ngIf="currentScreen() === 'restored'">
        <div class="restored-body">
          <div class="check-circle">
            <mat-icon class="restored-icon">check_circle</mat-icon>
          </div>
          <p class="restored-title">Internet restored!</p>
          <p class="restored-sub">Your draft has been saved.</p>
          <button class="btn-primary full-width green" (click)="dialogRef.close()">
            Done
          </button>
        </div>
      </ng-container>

    </div>
  `,
  styles: [`
    ::ng-deep .connectivity-snackbar .mat-mdc-dialog-container {
      border-radius: 16px !important;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18) !important;
      border: 1.5px solid #fde68a !important;
      background: #fffbeb !important;
      padding: 0 !important;
    }

    ::ng-deep .connectivity-snackbar .mdc-dialog__surface {
      border-radius: 16px !important;
      background: #fffbeb !important;
      padding: 0 !important;
    }

    .connectivity-banner {
      padding: 32px 36px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-width: 420px;
    }

    .step-dots {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #fde68a;
      transition: background 0.3s;
    }

    .dot.active { background: #f59e0b; }

    .banner-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .banner-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #f59e0b;
      flex-shrink: 0;
    }

    .banner-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0;
      color: #92400e;
      line-height: 1.3;
    }

    .banner-subtitle {
      font-size: 16px;
      color: #78350f;
      margin: 0;
      line-height: 1.7;
    }

    .action-row {
      display: flex;
      gap: 12px;
    }

    .btn-primary,
    .btn-secondary {
      flex: 1;
      padding: 14px 12px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      transition: background 0.2s;
    }

    .btn-primary mat-icon,
    .btn-secondary mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .btn-primary {
      background: #f59e0b;
      color: #fff;
    }

    .btn-primary:hover { background: #d97706; }

    .btn-secondary {
      background: #fff8e1;
      border: 1.5px solid #f59e0b;
      color: #92400e;
    }

    .btn-secondary:hover { background: #fef3c7; }

    .btn-primary.full-width {
      flex: unset;
      width: 100%;
    }

    .btn-primary.green { background: #22c55e; }
    .btn-primary.green:hover { background: #16a34a; }

    .waiting-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
      padding: 12px 0;
    }

    .pulse-wrapper {
      position: relative;
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .wifi-icon {
      font-size: 42px;
      width: 42px;
      height: 42px;
      color: #f59e0b;
      position: relative;
      z-index: 1;
    }

    .pulse-ring {
      position: absolute;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2.5px solid #f59e0b;
      animation: pulse 1.6s ease-out infinite;
      opacity: 0;
    }

    @keyframes pulse {
      0%   { transform: scale(0.7); opacity: 0.7; }
      100% { transform: scale(1.7); opacity: 0; }
    }

    .waiting-sub {
      font-size: 15px;
      color: #a16207;
      margin: 0;
      line-height: 1.6;
    }

    .bounce-dots {
      display: flex;
      gap: 7px;
    }

    .bounce-dots span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #f59e0b;
      animation: bounce 0.8s ease-in-out infinite;
    }

    .bounce-dots span:nth-child(2) { animation-delay: 0.18s; }
    .bounce-dots span:nth-child(3) { animation-delay: 0.36s; }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); opacity: 0.4; }
      50%       { transform: translateY(-8px); opacity: 1; }
    }

    .draft-status {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 15px;
      padding: 14px 16px;
      border-radius: 10px;
    }

    .draft-status mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .draft-status.saving { background: #fff7e6; color: #8a5a00; }
    .draft-status.saving mat-icon { color: #f59e0b; }

    .draft-status.saved  { background: #e6f7ec; color: #186a3b; }
    .draft-status.saved mat-icon { color: #2e7d32; }

    .draft-status.failed { background: #fdecea; color: #8a1c1c; }
    .draft-status.failed mat-icon { color: #c62828; }

    .draft-status.idle   { background: #f1f3f5; color: #555; }

    .spin { animation: spin 1.2s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    .restored-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 18px;
      padding: 12px 0;
      animation: fadeUp 0.4s ease;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .check-circle {
      animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes popIn {
      0%   { transform: scale(0); opacity: 0; }
      70%  { transform: scale(1.2); }
      100% { transform: scale(1); opacity: 1; }
    }

    .restored-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #22c55e;
    }

    .restored-title {
      font-size: 22px;
      font-weight: 700;
      color: #166534;
      margin: 0;
    }

    .restored-sub {
      font-size: 16px;
      color: #15803d;
      margin: 0;
    }
  `]
})
export class ConnectivityAlertComponent {
  offline       = signal<boolean>(false);
  draftStatus   = signal<DraftStatus>('idle');
  currentScreen = signal<DialogScreen>('prompt');

  constructor(
    public dialogRef: MatDialogRef<ConnectivityAlertComponent>,
    @Inject(MAT_DIALOG_DATA) data: { offline: boolean; startScreen?: DialogScreen }
  ) {
    this.offline.set(!!data.offline);
    if (data.startScreen) {
      this.currentScreen.set(data.startScreen);
    }
    this.dialogRef.backdropClick().subscribe(() => this.dialogRef.close());
  }

  goWaiting() {
    this.currentScreen.set('waiting');
  }

  goContinueOffline() {
    this.currentScreen.set('offline');
  }

  onConnectivityRestored() {
    if (this.currentScreen() === 'waiting' || this.currentScreen() === 'offline') {
      this.draftStatus.set('saved');
      this.currentScreen.set('restored');
    }
  }
  setDraftStatus(status: DraftStatus) { this.draftStatus.set(status); }
}