import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { Subject } from 'rxjs';

export interface WhatsAppProgressData {
  totalParticipants: number;
  templateName: string;
}

export interface WatiError {
  phone?: string;
  name?: string;
  reason: string;
  errorType?: 'validation' | 'delivery' | 'attribute' | 'api' | 'unknown';
}

@Component({
  selector: 'app-whatsapp-progress-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatBadgeModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">send</mat-icon>
      Sending WhatsApp Messages
    </h2>
    
    <mat-dialog-content>
      <div class="progress-container">
        <div class="progress-section">
          <div class="progress-header">
            <span class="progress-label">Overall Progress</span>
            <span class="progress-value">{{ processedCount }} / {{ data.totalParticipants }}</span>
          </div>
          <mat-progress-bar 
            mode="determinate" 
            [value]="overallProgress">
          </mat-progress-bar>
          <div class="progress-percentage">{{ overallProgress | number:'1.0-0' }}%</div>
        </div>
        <div class="progress-section" *ngIf="!isComplete">
          <div class="progress-header">
            <span class="progress-label">Current Batch</span>
            <span class="progress-value">Chunk {{ currentChunk }} of {{ totalChunks }}</span>
          </div>
          <mat-progress-bar 
            mode="indeterminate" 
            *ngIf="isProcessingChunk">
          </mat-progress-bar>
        </div>

        <div class="stats-container">
          <div class="stat-card success">
            <mat-icon>check_circle</mat-icon>
            <div class="stat-content">
              <span class="stat-value">{{ successCount }}</span>
              <span class="stat-label">Sent</span>
            </div>
          </div>
          <div class="stat-card error">
            <mat-icon>error</mat-icon>
            <div class="stat-content">
              <span class="stat-value">{{ failedCount }}</span>
              <span class="stat-label">Failed</span>
            </div>
          </div>
          <div class="stat-card pending" *ngIf="!isComplete">
            <mat-icon>schedule</mat-icon>
            <div class="stat-content">
              <span class="stat-value">{{ pendingCount }}</span>
              <span class="stat-label">Pending</span>
            </div>
          </div>
        </div>
        <div class="status-message" [ngClass]="statusClass">
          <mat-icon>{{ statusIcon }}</mat-icon>
          <span>{{ statusMessage }}</span>
        </div>
        <div class="error-section" *ngIf="hasAnyErrors">
          <button mat-button (click)="showErrors = !showErrors" class="error-toggle">
            <mat-icon>{{ showErrors ? 'expand_less' : 'expand_more' }}</mat-icon>
            {{ showErrors ? 'Hide' : 'Show' }} Error Details ({{ totalErrorCount }})
          </button>
          
          <div class="error-details" *ngIf="showErrors">
            <mat-tab-group animationDuration="0ms">
              <mat-tab *ngIf="watiDeliveryErrors.length > 0">
                <ng-template mat-tab-label>
                  <mat-icon class="tab-icon delivery">sms_failed</mat-icon>
                  Delivery ({{ watiDeliveryErrors.length }})
                </ng-template>
                <div class="error-list">
                  <div class="error-item" *ngFor="let error of watiDeliveryErrors">
                    <div class="error-contact" *ngIf="error.phone || error.name">
                      <mat-icon>person</mat-icon>
                      <span>{{ error.name || 'Unknown' }} {{ error.phone ? '(' + error.phone + ')' : '' }}</span>
                    </div>
                    <div class="error-reason">
                      <mat-icon>info</mat-icon>
                      <span>{{ error.reason }}</span>
                    </div>
                  </div>
                </div>
              </mat-tab>
              <mat-tab *ngIf="watiAttributeErrors.length > 0">
                <ng-template mat-tab-label>
                  <mat-icon class="tab-icon attribute">assignment_late</mat-icon>
                  Attributes ({{ watiAttributeErrors.length }})
                </ng-template>
                <div class="error-list">
                  <div class="error-item" *ngFor="let error of watiAttributeErrors">
                    <div class="error-contact" *ngIf="error.phone || error.name">
                      <mat-icon>person</mat-icon>
                      <span>{{ error.name || 'Unknown' }} {{ error.phone ? '(' + error.phone + ')' : '' }}</span>
                    </div>
                    <div class="error-reason">
                      <mat-icon>info</mat-icon>
                      <span>{{ error.reason }}</span>
                    </div>
                  </div>
                </div>
              </mat-tab>
              <mat-tab *ngIf="validationErrors.length > 0">
                <ng-template mat-tab-label>
                  <mat-icon class="tab-icon validation">phone_disabled</mat-icon>
                  Invalid ({{ validationErrors.length }})
                </ng-template>
                <div class="error-list">
                  <div class="error-item" *ngFor="let error of validationErrors">
                    <div class="error-contact" *ngIf="error.phone || error.name">
                      <mat-icon>person</mat-icon>
                      <span>{{ error.name || 'Unknown' }} {{ error.phone ? '(' + error.phone + ')' : '' }}</span>
                    </div>
                    <div class="error-reason">
                      <mat-icon>info</mat-icon>
                      <span>{{ error.reason }}</span>
                    </div>
                  </div>
                </div>
              </mat-tab>
              <mat-tab *ngIf="apiErrors.length > 0">
                <ng-template mat-tab-label>
                  <mat-icon class="tab-icon api">cloud_off</mat-icon>
                  API ({{ apiErrors.length }})
                </ng-template>
                <div class="error-list">
                  <div class="error-item api-error" *ngFor="let error of apiErrors">
                    <div class="error-reason">
                      <mat-icon>warning</mat-icon>
                      <span>{{ error.reason }}</span>
                    </div>
                  </div>
                </div>
              </mat-tab>
            </mat-tab-group>
            <div class="error-summary">
              <h4>Error Summary</h4>
              <div class="summary-grid">
                <div class="summary-item" *ngIf="watiDeliveryErrors.length > 0">
                  <span class="summary-label">Message Undeliverable:</span>
                  <span class="summary-value">{{ watiDeliveryErrors.length }}</span>
                </div>
                <div class="summary-item" *ngIf="watiAttributeErrors.length > 0">
                  <span class="summary-label">Missing Attributes:</span>
                  <span class="summary-value">{{ watiAttributeErrors.length }}</span>
                </div>
                <div class="summary-item" *ngIf="validationErrors.length > 0">
                  <span class="summary-label">Invalid Phone Numbers:</span>
                  <span class="summary-value">{{ validationErrors.length }}</span>
                </div>
                <div class="summary-item" *ngIf="apiErrors.length > 0">
                  <span class="summary-label">API Errors:</span>
                  <span class="summary-value">{{ apiErrors.length }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button 
              (click)="onCancel()" 
              [disabled]="isComplete"
              *ngIf="!isComplete">
        Cancel
      </button>
      <button mat-raised-button 
              color="primary" 
              (click)="onClose()"
              *ngIf="isComplete">
        Close
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 16px 24px;
      border-bottom: 1px solid #e0e0e0;
    }

    .title-icon {
      color: #25D366;
    }

    mat-dialog-content {
      padding: 24px;
      min-width: 450px;
      max-width: 600px;
      max-height: 70vh;
    }

    .progress-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .progress-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .progress-label {
      font-weight: 500;
      color: #333;
    }

    .progress-value {
      font-size: 14px;
      color: #666;
    }

    .progress-percentage {
      text-align: right;
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }

    .stats-container {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 8px;
      flex: 1;
      max-width: 140px;
    }

    .stat-card.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .stat-card.error {
      background: #ffebee;
      color: #c62828;
    }

    .stat-card.pending {
      background: #fff3e0;
      color: #ef6c00;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 600;
      line-height: 1;
    }

    .stat-label {
      font-size: 12px;
      opacity: 0.8;
    }

    .status-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
    }

    .status-message.processing {
      background: #e3f2fd;
      color: #1565c0;
    }

    .status-message.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .status-message.error {
      background: #ffebee;
      color: #c62828;
    }

    .status-message.partial {
      background: #fff3e0;
      color: #ef6c00;
    }

    /* Error Section Styles */
    .error-section {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .error-toggle {
      width: 100%;
      justify-content: flex-start;
      color: #c62828;
      border-bottom: 1px solid #e0e0e0;
    }

    .error-details {
      padding: 0;
    }

    .tab-icon {
      margin-right: 6px;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .tab-icon.delivery {
      color: #e53935;
    }

    .tab-icon.attribute {
      color: #fb8c00;
    }

    .tab-icon.validation {
      color: #8e24aa;
    }

    .tab-icon.api {
      color: #546e7a;
    }

    .error-list {
      max-height: 200px;
      overflow-y: auto;
      padding: 12px;
    }

    .error-item {
      padding: 10px 12px;
      margin-bottom: 8px;
      background: #fafafa;
      border-radius: 6px;
      border-left: 3px solid #e53935;
    }

    .error-item.api-error {
      border-left-color: #546e7a;
    }

    .error-contact {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }

    .error-contact mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #666;
    }

    .error-reason {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 13px;
      color: #666;
      padding-left: 22px;
    }

    .error-reason mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #999;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .error-summary {
      padding: 12px 16px;
      background: #f5f5f5;
      border-top: 1px solid #e0e0e0;
    }

    .error-summary h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 600;
      color: #666;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }

    .summary-label {
      color: #666;
    }

    .summary-value {
      font-weight: 600;
      color: #c62828;
    }

    mat-dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
    }

    /* Tab styling */
    ::ng-deep .mat-mdc-tab-body-wrapper {
      flex-grow: 1;
    }

    ::ng-deep .mat-mdc-tab-labels {
      background: #fafafa;
    }
  `]
})
export class WhatsappProgressDialogComponent implements OnDestroy {
  processedCount = 0;
  successCount = 0;
  failedCount = 0;
  currentChunk = 0;
  totalChunks = 0;
  isComplete = false;
  isProcessingChunk = false;
  isCancelled = false;
  showErrors = false;

  watiDeliveryErrors: WatiError[] = [];
  watiAttributeErrors: WatiError[] = [];
  validationErrors: WatiError[] = [];
  apiErrors: WatiError[] = [];

  statusMessage = 'Preparing to send messages...';
  statusClass = 'processing';
  statusIcon = 'hourglass_empty';

  private cancelSubject = new Subject<void>();
  cancel$ = this.cancelSubject.asObservable();

  private readonly DELIVERY_ERROR_PATTERNS = [
    'message undeliverable',
    'undeliverable',
    'failed to send',
    'not delivered',
    'delivery failed',
    'recipient unavailable',
    'number not on whatsapp',
    'invalid whatsapp number'
  ];

  private readonly ATTRIBUTE_ERROR_PATTERNS = [
    'missing customer attributes',
    'custom attributes have not been set',
    'attribute not found',
    'missing attribute',
    'required attribute',
    'contact information missing',
    'check contact information'
  ];

  private readonly VALIDATION_ERROR_PATTERNS = [
    'invalid phone',
    'invalid number',
    'phone number format',
    'invalid format',
    'empty phone',
    'missing phone'
  ];

  constructor(
    public dialogRef: MatDialogRef<WhatsappProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WhatsAppProgressData
  ) {
    this.dialogRef.disableClose = true;
  }

  get overallProgress(): number {
    return (this.processedCount / this.data.totalParticipants) * 100;
  }

  get pendingCount(): number {
    return this.data.totalParticipants - this.processedCount;
  }

  get hasAnyErrors(): boolean {
    return this.totalErrorCount > 0;
  }

  get totalErrorCount(): number {
    return this.watiDeliveryErrors.length + 
           this.watiAttributeErrors.length + 
           this.validationErrors.length + 
           this.apiErrors.length;
  }

  updateProgress(update: {
    processedCount?: number;
    successCount?: number;
    failedCount?: number;
    currentChunk?: number;
    totalChunks?: number;
    isProcessingChunk?: boolean;
    errors?: string[];
    watiErrors?: any[];
  }) {
    if (update.processedCount !== undefined) this.processedCount = update.processedCount;
    if (update.successCount !== undefined) this.successCount = update.successCount;
    if (update.failedCount !== undefined) this.failedCount = update.failedCount;
    if (update.currentChunk !== undefined) this.currentChunk = update.currentChunk;
    if (update.totalChunks !== undefined) this.totalChunks = update.totalChunks;
    if (update.isProcessingChunk !== undefined) this.isProcessingChunk = update.isProcessingChunk;
    if (update.errors && update.errors.length > 0) {
      this.categorizeErrors(update.errors);
    }
    if (update.watiErrors && update.watiErrors.length > 0) {
      this.processWatiErrors(update.watiErrors);
    }

    this.updateStatusMessage();
  }

  private categorizeErrors(errors: string[]) {
    errors.forEach(error => {
      const errorLower = error.toLowerCase();
      const watiError = this.parseErrorString(error);

      if (this.matchesPatterns(errorLower, this.DELIVERY_ERROR_PATTERNS)) {
        watiError.errorType = 'delivery';
        this.watiDeliveryErrors.push(watiError);
      } else if (this.matchesPatterns(errorLower, this.ATTRIBUTE_ERROR_PATTERNS)) {
        watiError.errorType = 'attribute';
        this.watiAttributeErrors.push(watiError);
      } else if (this.matchesPatterns(errorLower, this.VALIDATION_ERROR_PATTERNS)) {
        watiError.errorType = 'validation';
        this.validationErrors.push(watiError);
      } else {
        watiError.errorType = 'api';
        this.apiErrors.push(watiError);
      }
    });
  }

  private processWatiErrors(watiErrors: any[]) {
    watiErrors.forEach(error => {
      const watiError: WatiError = {
        phone: error.phone || error.whatsappNumber || error.number,
        name: error.name || error.contactName,
        reason: error.reason || error.message || error.error || 'Unknown error',
        errorType: 'unknown'
      };

      const reasonLower = watiError.reason.toLowerCase();

      if (this.matchesPatterns(reasonLower, this.DELIVERY_ERROR_PATTERNS)) {
        watiError.errorType = 'delivery';
        this.watiDeliveryErrors.push(watiError);
      } else if (this.matchesPatterns(reasonLower, this.ATTRIBUTE_ERROR_PATTERNS)) {
        watiError.errorType = 'attribute';
        this.watiAttributeErrors.push(watiError);
      } else if (this.matchesPatterns(reasonLower, this.VALIDATION_ERROR_PATTERNS)) {
        watiError.errorType = 'validation';
        this.validationErrors.push(watiError);
      } else {
        watiError.errorType = 'delivery';
        this.watiDeliveryErrors.push(watiError);
      }
    });
  }

  private parseErrorString(error: string): WatiError {
    const phoneMatch = error.match(/(\+?\d{10,15})/);
    const nameMatch = error.match(/(?:Name:\s*|^)([A-Za-z\s]+?)(?:\s*[\(\-\:]|$)/i);

    return {
      phone: phoneMatch ? phoneMatch[1] : undefined,
      name: nameMatch ? nameMatch[1].trim() : undefined,
      reason: error.replace(/^[^:]+:\s*/, '').trim() || error
    };
  }

  private matchesPatterns(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private updateStatusMessage() {
    if (this.isCancelled) {
      this.statusMessage = 'Sending cancelled';
      this.statusClass = 'error';
      this.statusIcon = 'cancel';
    } else if (this.isProcessingChunk) {
      this.statusMessage = `Sending batch ${this.currentChunk} of ${this.totalChunks}...`;
      this.statusClass = 'processing';
      this.statusIcon = 'send';
    } else if (!this.isComplete) {
      this.statusMessage = 'Preparing next batch...';
      this.statusClass = 'processing';
      this.statusIcon = 'hourglass_empty';
    }
  }

  complete(finalStatus: 'success' | 'partial' | 'error') {
    this.isComplete = true;
    this.isProcessingChunk = false;
    this.dialogRef.disableClose = false;
    if (this.hasAnyErrors) {
      this.showErrors = true;
    }

    switch (finalStatus) {
      case 'success':
        this.statusMessage = `All ${this.successCount} messages sent successfully!`;
        this.statusClass = 'success';
        this.statusIcon = 'check_circle';
        break;
      case 'partial':
        this.statusMessage = `Completed: ${this.successCount} sent, ${this.failedCount} failed`;
        this.statusClass = 'partial';
        this.statusIcon = 'warning';
        break;
      case 'error':
        this.statusMessage = this.isCancelled 
          ? `Cancelled: ${this.successCount} sent before cancellation`
          : `Failed to send messages`;
        this.statusClass = 'error';
        this.statusIcon = 'error';
        break;
    }
  }

  onCancel() {
    this.isCancelled = true;
    this.cancelSubject.next();
    this.updateStatusMessage();
  }

  onClose() {
    this.dialogRef.close({
      success: this.successCount,
      failed: this.failedCount,
      total: this.data.totalParticipants,
      cancelled: this.isCancelled,
      errors: {
        delivery: this.watiDeliveryErrors,
        attribute: this.watiAttributeErrors,
        validation: this.validationErrors,
        api: this.apiErrors
      }
    });
  }

  ngOnDestroy() {
    this.cancelSubject.complete();
  }
}