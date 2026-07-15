import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

interface Tag {
  id: string;
  name: string;
}

@Component({
  selector: 'app-assign-tags-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './assign-tags-dialog.component.html',
  styleUrl: './assign-tags-dialog.component.css'
})
export class AssignTagsDialogComponent implements OnInit {
  tags: Tag[] = [];
  selected = new Set<string>();
  search = '';
  loading = true;
  isSaving = false;
  isCreating = false;
  userName = '';
  // 'single' = assign to one user; 'bulk' = pick tags to add to many users.
  mode: 'single' | 'bulk' = 'single';
  bulkCount = 0;
  private userId = '';
  // Bulk mode: tags shared by ALL selected users at open time (pre-checked).
  private initialSelected = new Set<string>();

  constructor(
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AssignTagsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    if (data?.mode === 'bulk') {
      this.mode = 'bulk';
      const users: any[] = Array.isArray(data?.users) ? data.users : [];
      this.bulkCount = users.length;
      // Pre-check tags every selected user already has (intersection), so
      // unchecking one removes it from all, and checking a new one adds it.
      if (users.length) {
        const sets = users.map(u => new Set<string>(Array.isArray(u.tags) ? u.tags : []));
        [...sets[0]].forEach(id => {
          if (sets.every(s => s.has(id))) {
            this.selected.add(id);
            this.initialSelected.add(id);
          }
        });
      }
    } else {
      const u = data?.user || {};
      this.userId = u.id || u.docid || '';
      this.userName = u.name || 'User';
      (Array.isArray(u.tags) ? u.tags : []).forEach((id: string) => id && this.selected.add(id));
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const ref = collection(this.firestore, 'newusertags');
      const rows = (await firstValueFrom(collectionData(ref, { idField: 'id' }))) as any[];
      this.tags = rows
        .map(r => ({ id: r.id, name: (r.name || '').toString() }))
        .filter(t => t.name)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('Error loading tags:', err);
    } finally {
      this.loading = false;
    }
  }

  filteredTags(): Tag[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.tags;
    return this.tags.filter(t => t.name.toLowerCase().includes(term));
  }

  // True when the typed term doesn't already exist as a tag (so we can offer create).
  canCreate(): boolean {
    const term = this.search.trim();
    if (!term) return false;
    return !this.tags.some(t => t.name.toLowerCase() === term.toLowerCase());
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggle(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  tagName(id: string): string {
    return this.tags.find(t => t.id === id)?.name || id;
  }

  selectedIds(): string[] {
    return [...this.selected];
  }

  async createTag(): Promise<void> {
    const name = this.search.trim();
    if (!name || this.isCreating || !this.canCreate()) return;
    this.isCreating = true;
    try {
      const ref = doc(collection(this.firestore, 'newusertags'));
      await setDoc(ref, { id: ref.id, name, created: serverTimestamp() });
      this.tags = [...this.tags, { id: ref.id, name }].sort((a, b) => a.name.localeCompare(b.name));
      this.selected.add(ref.id);   // auto-assign the freshly created tag
      this.search = '';
    } catch (err) {
      console.error('Error creating tag:', err);
      this.snackBar.open('Error creating tag.', 'Close', { duration: 3000 });
    } finally {
      this.isCreating = false;
    }
  }

  async save(): Promise<void> {
    if (this.isSaving) return;

    // Bulk mode: return the tags to add and remove; the caller applies per user.
    if (this.mode === 'bulk') {
      const add = this.selectedIds().filter(id => !this.initialSelected.has(id));
      const remove = [...this.initialSelected].filter(id => !this.selected.has(id));
      if (add.length === 0 && remove.length === 0) {
        this.snackBar.open('No tag changes to apply.', 'Close', { duration: 2500 });
        return;
      }
      this.dialogRef.close({ add, remove });
      return;
    }

    if (!this.userId) return;
    this.isSaving = true;
    try {
      const ref = doc(this.firestore, 'new_user_data', this.userId);
      await updateDoc(ref, { tags: this.selectedIds() });
      this.snackBar.open('Tags updated.', 'Close', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving tags:', err);
      this.snackBar.open('Error saving tags.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
