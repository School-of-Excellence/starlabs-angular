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
import { Firestore, collection, collectionData, doc, docData, getDoc, setDoc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

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

  watiSubscribe:Subscription;
  // Data
  watiConfigs = [];

  // Edit mode
  editingIndex: number = -1;
  editForm = { watiname: '', watiserver: '', endpoint: '', watitoken: '' };

  // Add mode
  showAddForm = false;
  newConfig = { watiname: '', watiserver: '', endpoint: '', watitoken: '' };

  // Table columns
  displayedColumns: string[] = ['watiname', 'watiserver', 'endpoint', 'watitoken', 'actions'];

  // Token visibility tracking
  visibleTokens: Set<number> = new Set();

  // Loading state
  loading = false;

  ngOnInit(): void {
    this.loadWatiData();
  }

  ngOnDestroy(): void {
    this.watiSubscribe.unsubscribe()
  }

  async loadWatiData(): Promise<void> {
    this.loading = true;
    try {
      const docRef = doc(this.firestore, 'classify', 'wati');
      this.watiSubscribe = docData(docRef).subscribe((watidata)=>{
        if (watidata) {
          const data = watidata;
          this.watiConfigs = data?.['wati'] || [];
        } else {
          this.watiConfigs = [];
        }
      });

    } catch (error) {
      console.error('Error loading WATI data:', error);
      this.showSnackBar('Error loading data');
    } finally {
      this.loading = false;
    }
  }

  // Add operations
  toggleAddForm(): void {
    this.showAddForm = !this.showAddForm;
    this.newConfig = { watiname: '', watiserver: '', endpoint: '', watitoken: '' };
    if (this.showAddForm) {
      this.cancelEdit();
    }
  }

  async addConfig(): Promise<void> {
    if (!this.newConfig.watiname || !this.newConfig.watiserver || !this.newConfig.endpoint || !this.newConfig.watitoken) {
      this.showSnackBar('Please fill all fields');
      return;
    }

    if (this.watiConfigs.some(c => c.watiname === this.newConfig.watiname)) {
      this.showSnackBar('WATI name already exists');
      return;
    }

    this.loading = true;
    try {
      this.watiConfigs.push({ ...this.newConfig });
      await this.saveToFirestore();
      this.showAddForm = false;
      this.newConfig = { watiname: '', watiserver: '', endpoint: '', watitoken: '' };
      this.showSnackBar('WATI config added successfully');
    } catch (error) {
      console.error('Error adding config:', error);
      this.showSnackBar('Error adding config');
    } finally {
      this.loading = false;
    }
  }

  // Edit operations
  editConfig(config, index: number): void {
    this.editingIndex = index;
    this.editForm = { ...config };
    this.showAddForm = false;
  }

  cancelEdit(): void {
    this.editingIndex = -1;
    this.editForm = { watiname: '', watiserver: '', endpoint: '', watitoken: '' };
  }

  async saveEdit(): Promise<void> {
    if (!this.editForm.watiname || !this.editForm.watiserver || !this.editForm.endpoint || !this.editForm.watitoken) {
      this.showSnackBar('Please fill all fields');
      return;
    }

    const duplicate = this.watiConfigs.some((c, i) => c.watiname === this.editForm.watiname && i !== this.editingIndex);
    if (duplicate) {
      this.showSnackBar('WATI name already exists');
      return;
    }

    this.loading = true;
    try {
      this.watiConfigs[this.editingIndex] = { ...this.editForm };
      await this.saveToFirestore();
      this.cancelEdit();
      this.showSnackBar('WATI config updated successfully');
    } catch (error) {
      console.error('Error updating config:', error);
      this.showSnackBar('Error updating config');
    } finally {
      this.loading = false;
    }
  }

  // Delete operation
  async deleteConfig(index: number): Promise<void> {
    const config = this.watiConfigs[index];
    if (!confirm(`Are you sure you want to delete "${config.watiname}"?`)) {
      return;
    }

    this.loading = true;
    try {
      this.watiConfigs.splice(index, 1);
      await this.saveToFirestore();
      this.showSnackBar('WATI config deleted successfully');
    } catch (error) {
      console.error('Error deleting config:', error);
      this.showSnackBar('Error deleting config');
    } finally {
      this.loading = false;
    }
  }

  // Firestore save
  private async saveToFirestore(): Promise<void> {
    const docRef = doc(this.firestore, 'classify', 'wati');
    try {
      await updateDoc(docRef, { wati: this.watiConfigs });
    } catch (error) {
      await setDoc(docRef, { wati: this.watiConfigs });
    }
  }

  // Token visibility
  toggleTokenVisibility(index: number): void {
    if (this.visibleTokens.has(index)) {
      this.visibleTokens.delete(index);
    } else {
      this.visibleTokens.add(index);
    }
  }

  isTokenVisible(index: number): boolean {
    return this.visibleTokens.has(index);
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