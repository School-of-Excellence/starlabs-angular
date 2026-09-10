import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Firestore, collection, collectionData, doc, query, setDoc, serverTimestamp, Timestamp, where
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { CalendarEvent, tsToDate } from '../wccalendar.component';

interface EventType {
  id: string;
  name: string;
}

/**
 * yyyy-MM-dd (native date input value) -> UTC-midnight Date. All-day dates are
 * anchored to UTC so the calendar day survives creators and viewers being in
 * different timezones (a local-midnight Timestamp would shift a day abroad).
 */
function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateInput(value: any): string {
  const d = tsToDate(value);
  if (!d) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

@Component({
  selector: 'app-add-event-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './add-event-dialog.component.html',
  styleUrl: './add-event-dialog.component.css'
})
export class AddEventDialogComponent implements OnInit {
  title = '';
  type = '';                 // newusertags doc id (type=='wccalendar')
  start = '';
  end = '';
  note = '';
  isSaving = false;

  /** Event types from newusertags (type=='wccalendar'), shown by name, stored by id. */
  typeOptions: EventType[] = [];
  loadingTypes = true;

  showNewType = false;
  newTypeName = '';
  isCreatingType = false;

  /** Locations from newusertags (type=='location'), shown by name, stored by id. */
  location = '';
  locationOptions: EventType[] = [];
  showNewLocation = false;
  newLocationName = '';
  isCreatingLocation = false;

  showinapp = false;

  /** When set, the dialog edits this existing event instead of creating one. */
  editId: string | null = null;

  constructor(
    private firestore: Firestore,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<AddEventDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) data: { event?: CalendarEvent; presetStart?: string } | null
  ) {
    const e = data?.event;
    if (e) {
      this.editId = e.id;
      this.title = e.title || '';
      this.type = e.type || '';
      this.start = toDateInput(e.startdate);
      this.end = toDateInput(e.enddate);
      this.location = e.location || '';
      this.note = e.note || '';
      this.showinapp = e.showinapp === true;
    } else if (data?.presetStart) {
      // Opened by clicking a day cell — that date seeds both pickers.
      this.start = data.presetStart;
      this.end = data.presetStart;
    }
  }

  get isEdit(): boolean {
    return this.editId !== null;
  }

  async ngOnInit(): Promise<void> {
    try {
      const load = async (tagType: string): Promise<EventType[]> => {
        const ref = query(
          collection(this.firestore, 'newusertags'),
          where('type', '==', tagType)
        );
        const rows = (await firstValueFrom(collectionData(ref, { idField: 'id' }))) as any[];
        return rows
          .map(r => ({ id: r.id as string, name: (r.name || '').toString() }))
          .filter(t => t.name)
          .sort((a, b) => a.name.localeCompare(b.name));
      };
      [this.typeOptions, this.locationOptions] = await Promise.all([
        load('wccalendar'), load('location')
      ]);
      // Legacy events store a plain name instead of a tag id — keep them editable.
      if (this.type && !this.typeOptions.some(t => t.id === this.type)) {
        this.typeOptions = [...this.typeOptions, { id: this.type, name: this.type }];
      }
    } catch (err) {
      console.error('Error loading event types:', err);
      this.snackBar.open('Error loading event types.', 'Close', { duration: 3000 });
    } finally {
      this.loadingTypes = false;
    }
  }

  get canCreateType(): boolean {
    const name = this.newTypeName.trim();
    return !!name && !this.typeOptions.some(t => t.name.toLowerCase() === name.toLowerCase());
  }

  async createType(): Promise<void> {
    if (!this.canCreateType || this.isCreatingType) return;
    const name = this.newTypeName.trim();
    this.isCreatingType = true;
    try {
      const ref = doc(collection(this.firestore, 'newusertags'));
      // 'type' marks this tag as a calendar event type; never shown in the UI.
      await setDoc(ref, { id: ref.id, name, type: 'wccalendar', created: serverTimestamp() });
      this.typeOptions = [...this.typeOptions, { id: ref.id, name }]
        .sort((a, b) => a.name.localeCompare(b.name));
      this.type = ref.id;   // auto-select the freshly created type
      this.newTypeName = '';
      this.showNewType = false;
    } catch (err) {
      console.error('Error creating event type:', err);
      this.snackBar.open('Error creating type.', 'Close', { duration: 3000 });
    } finally {
      this.isCreatingType = false;
    }
  }

  get canCreateLocation(): boolean {
    const name = this.newLocationName.trim();
    return !!name && !this.locationOptions.some(t => t.name.toLowerCase() === name.toLowerCase());
  }

  async createLocation(): Promise<void> {
    if (!this.canCreateLocation || this.isCreatingLocation) return;
    const name = this.newLocationName.trim();
    this.isCreatingLocation = true;
    try {
      const ref = doc(collection(this.firestore, 'newusertags'));
      // 'type' marks this tag as a calendar location; never shown in the UI.
      await setDoc(ref, { id: ref.id, name, type: 'location', created: serverTimestamp() });
      this.locationOptions = [...this.locationOptions, { id: ref.id, name }]
        .sort((a, b) => a.name.localeCompare(b.name));
      this.location = ref.id;   // auto-select the freshly created location
      this.newLocationName = '';
      this.showNewLocation = false;
    } catch (err) {
      console.error('Error creating location:', err);
      this.snackBar.open('Error creating location.', 'Close', { duration: 3000 });
    } finally {
      this.isCreatingLocation = false;
    }
  }

  async save(): Promise<void> {
    if (this.isSaving) return;
    const title = this.title.trim();
    const startDate = parseDateInput(this.start);
    // End defaults to start, as in the reference.
    const endDate = parseDateInput(this.end) ?? startDate;
    if (!title || !startDate || !this.type) {
      this.snackBar.open('Fill Event Title, Type and Start Date.', 'Close', { duration: 3000 });
      return;
    }
    if (endDate! < startDate) {
      this.snackBar.open('End Date cannot be before Start Date.', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving = true;
    try {
      const ref = this.editId
        ? doc(this.firestore, 'workshopcampaigncalendar', this.editId)
        : doc(collection(this.firestore, 'workshopcampaigncalendar'));
      const payload: any = {
        id: ref.id,
        title,
        type: this.type,
        startdate: Timestamp.fromDate(startDate),
        enddate: Timestamp.fromDate(endDate!),
        allday: true,
        location: this.location || '',
        note: this.note.trim(),
        showinapp: this.showinapp,
        repeat: 'none',
        repeatuntil: null,
        updated: serverTimestamp()
      };
      if (!this.editId) {
        payload.created = serverTimestamp();
        payload.deleted = false;
      }
      await setDoc(ref, payload, { merge: true });
      this.snackBar.open(this.isEdit ? 'Event updated.' : 'Event added to calendar.', 'Close', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (err) {
      console.error('Error saving calendar event:', err);
      this.snackBar.open('Error saving event.', 'Close', { duration: 3000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
