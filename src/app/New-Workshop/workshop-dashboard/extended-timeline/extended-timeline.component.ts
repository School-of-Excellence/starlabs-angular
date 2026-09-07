import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { updateDoc, arrayUnion, Timestamp } from '@angular/fire/firestore';
import { SnackbarService } from '../../../shared/snackbar.service';

interface ExtendEntry {
  created: number | null;
  extenduntill: number | null;
}

interface ExtendedUser {
  profileid: string;
  name: string;
  participantworkshopref: any;
  entries: ExtendEntry[];
}

// Timeline of every extended participant's evergreenaccessto.extendworkshop
// history, with an "Extend again" action that appends a new array entry.
@Component({
  selector: 'app-extended-timeline',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './extended-timeline.component.html',
  styleUrls: ['./extended-timeline.component.css']
})
export class ExtendedTimelineComponent {
  searchText = '';
  extendFor: string | null = null;
  extendDate: Date | null = null;
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<ExtendedTimelineComponent>,
    private snackbarService: SnackbarService,
    @Inject(MAT_DIALOG_DATA) public data: { workshopTitle: string; users: ExtendedUser[] }
  ) {}

  get users(): ExtendedUser[] {
    return this.data?.users || [];
  }

  get filteredUsers(): ExtendedUser[] {
    const q = this.searchText.trim().toLowerCase();
    if (!q) return this.users;
    return this.users.filter(u => (u.name || '').toLowerCase().includes(q));
  }

  initials(name: string): string {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
  }

  latestEntry(u: ExtendedUser): ExtendEntry | null {
    return u.entries.length ? u.entries[u.entries.length - 1] : null;
  }

  // Live comparison so an extension expiring while the dialog is open flips
  // to Expired without a reopen.
  isActive(u: ExtendedUser): boolean {
    const last = this.latestEntry(u);
    return !!last?.extenduntill && last.extenduntill >= Date.now();
  }

  // A new extension must extend, not silently shorten: for a still-active
  // user the earliest pickable day is the day AFTER their current
  // extenduntill; otherwise today.
  minDateFor(u: ExtendedUser): Date {
    const until = this.latestEntry(u)?.extenduntill;
    if (until && until >= Date.now()) {
      const d = new Date(until);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return new Date();
  }

  toggleExtend(profileid: string): void {
    this.extendFor = this.extendFor === profileid ? null : profileid;
    this.extendDate = null;
  }

  // Same write as the dashboard's Completed panel: a NEW index in
  // evergreenaccessto.extendworkshop with extenduntill (chosen day, 11:59 pm)
  // and created (now).
  async confirmExtend(u: ExtendedUser): Promise<void> {
    if (!this.extendDate || this.saving) return;
    if (!u.participantworkshopref) {
      this.snackbarService.show('No participant workshop document found for this user');
      return;
    }

    this.saving = true;
    try {
      const d = this.extendDate;
      const until = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
      const created = Timestamp.now();
      await updateDoc(u.participantworkshopref, {
        'evergreenaccessto.extendworkshop': arrayUnion({
          extenduntill: Timestamp.fromDate(until),
          created
        })
      });
      // Reflect immediately in the open timeline.
      u.entries = [...u.entries, { created: created.toMillis(), extenduntill: until.getTime() }];
      this.extendFor = null;
      this.extendDate = null;
      this.snackbarService.show(`Extended ${u.name} until ${until.toLocaleDateString()}`);
    } catch (err) {
      console.error('Error extending workshop access:', err);
      this.snackbarService.show('Error extending. Please try again.');
    } finally {
      this.saving = false;
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
