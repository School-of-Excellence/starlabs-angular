import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface WatiConfig {
  watiname: string;
  serverid: string;
  endpoint: string;
  watitoken: string;
}

@Component({
  selector: 'app-wati-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './wati-config-dialog.component.html',
  styleUrl: './wati-config-dialog.component.css'
})
export class WatiConfigDialogComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private dialogRef = inject(MatDialogRef<WatiConfigDialogComponent>);
  private snackBar = inject(MatSnackBar);

  watiSubscribe: Subscription;

  // Data — map keyed by serverid
  watiMap: { [serverid: string]: WatiConfig } = {};
  watiList: WatiConfig[] = [];

  // Edit mode
  editingServerId: string | null = null;
  editForm: WatiConfig = { watiname: '', serverid: '', endpoint: '', watitoken: '' };

  // Add mode
  showAddForm = false;
  newConfig: WatiConfig = { watiname: '', serverid: '', endpoint: '', watitoken: '' };

  // Table columns
  displayedColumns: string[] = ['serverid', 'watiname', 'endpoint', 'watitoken', 'actions'];

  // Token visibility tracking
  visibleTokens: Set<string> = new Set();

  // Loading state
  loading = false;

  ngOnInit(): void {
    this.loadWatiData();
  }

  ngOnDestroy(): void {
    this.watiSubscribe?.unsubscribe();
  }

  loadWatiData(): void {
    this.loading = true;
    try {
      const docRef = doc(this.firestore, 'classify', 'wati');
      this.watiSubscribe = docData(docRef).subscribe((watidata) => {
        if (watidata) {
          const { ...map } = watidata;
          this.watiMap = map as { [serverid: string]: WatiConfig };
          this.rebuildList();
        } else {
          this.watiMap = {};
          this.watiList = [];
        }
        this.loading = false;
      });
    } catch (error) {
      console.error('Error loading WATI data:', error);
      this.showSnackBar('Error loading data');
      this.loading = false;
    }
  }

  private rebuildList(): void {
    this.watiList = Object.keys(this.watiMap).map(key => this.watiMap[key]);
  }

  // --- Add ---
  toggleAddForm(): void {
    this.showAddForm = !this.showAddForm;
    this.newConfig = { watiname: '', serverid: '', endpoint: '', watitoken: '' };
    if (this.showAddForm) {
      this.cancelEdit();
    }
  }

  async addConfig(): Promise<void> {
    if (!this.newConfig.watiname || !this.newConfig.serverid || !this.newConfig.endpoint || !this.newConfig.watitoken) {
      this.showSnackBar('Please fill all fields');
      return;
    }

    if (this.watiMap[this.newConfig.serverid]) {
      this.showSnackBar('Server ID already exists');
      return;
    }

    this.loading = true;
    try {
      this.watiMap[this.newConfig.serverid] = { ...this.newConfig };
      await this.saveToFirestore();
      this.rebuildList();
      this.showAddForm = false;
      this.newConfig = { watiname: '', serverid: '', endpoint: '', watitoken: '' };
      this.showSnackBar('WATI config added successfully');
    } catch (error) {
      console.error('Error adding config:', error);
      this.showSnackBar('Error adding config');
    } finally {
      this.loading = false;
    }
  }

  // --- Edit ---
  editConfig(config: WatiConfig): void {
    this.editingServerId = config.serverid;
    this.editForm = { ...config };
    this.showAddForm = false;
  }

  cancelEdit(): void {
    this.editingServerId = null;
    this.editForm = { watiname: '', serverid: '', endpoint: '', watitoken: '' };
  }

  async saveEdit(): Promise<void> {
    if (!this.editForm.watiname || !this.editForm.serverid || !this.editForm.endpoint || !this.editForm.watitoken) {
      this.showSnackBar('Please fill all fields');
      return;
    }

    if (this.editForm.serverid !== this.editingServerId && this.watiMap[this.editForm.serverid]) {
      this.showSnackBar('Server ID already exists');
      return;
    }

    this.loading = true;
    try {
      if (this.editForm.serverid !== this.editingServerId) {
        delete this.watiMap[this.editingServerId];
      }
      this.watiMap[this.editForm.serverid] = { ...this.editForm };
      await this.saveToFirestore();
      this.rebuildList();
      this.cancelEdit();
      this.showSnackBar('WATI config updated successfully');
    } catch (error) {
      console.error('Error updating config:', error);
      this.showSnackBar('Error updating config');
    } finally {
      this.loading = false;
    }
  }

  // --- Delete ---
  async deleteConfig(config: WatiConfig): Promise<void> {
    if (!confirm(`Are you sure you want to delete "${config.watiname}"?`)) {
      return;
    }

    this.loading = true;
    try {
      delete this.watiMap[config.serverid];
      await this.saveToFirestore();
      this.rebuildList();
      this.showSnackBar('WATI config deleted successfully');
    } catch (error) {
      console.error('Error deleting config:', error);
      this.showSnackBar('Error deleting config');
    } finally {
      this.loading = false;
    }
  }

  // --- Firestore ---
  private async saveToFirestore(): Promise<void> {
    const docRef = doc(this.firestore, 'classify', 'wati');
    try {
      await setDoc(docRef, this.watiMap);
    } catch (error) {
      console.error('Firestore save error:', error);
      throw error;
    }
  }

  // --- Token visibility ---
  toggleTokenVisibility(serverid: string): void {
    if (this.visibleTokens.has(serverid)) {
      this.visibleTokens.delete(serverid);
    } else {
      this.visibleTokens.add(serverid);
    }
  }

  isTokenVisible(serverid: string): boolean {
    return this.visibleTokens.has(serverid);
  }

  maskToken(): string {
    return '••••••••••••••••';
  }

  truncateText(text: string, length: number = 25): string {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }

  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}