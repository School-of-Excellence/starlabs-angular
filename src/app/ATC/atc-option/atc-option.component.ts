import { CommonModule } from '@angular/common';
import { Component, Inject, NgZone, OnInit } from '@angular/core';
import { doc, Firestore, getFirestore, updateDoc } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ATCDraftService } from '../../shared/atc-draft.service';
import { MediaCacheService } from '../../shared/media-cache.service';

@Component({
  selector: 'app-atc-option',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    CommonModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './atc-option.component.html',
  styleUrl: './atc-option.component.css'
})
export class AtcOptionComponent {
  draftOption = []
  initiatedATC = []
  mapProfile = {}
  assignments = []

  firestoreATC = getFirestore("firestore-atc")

  constructor(@Inject(MAT_DIALOG_DATA) public atc, public dialogRef: MatDialogRef<any>,private ngZone: NgZone, private draftService: ATCDraftService, private mediaCache: MediaCacheService) {
    this.draftOption = atc["drafts"] ?? []
    this.initiatedATC = atc["initiated"] ?? []
    this.mapProfile = atc["mapProfile"] ?? {}
    this.assignments = atc["assignments"] ?? []
    console.log(this.initiatedATC)
    console.log(this.mapProfile)
    console.log(this.assignments.map(e =>e.data()));
    
  }

  ngOnInit(): void {
  }

  selecteATC(type, doc){
    var value = {
      type: type,
      doc: doc
    }
    this.dialogRef.close(value)
  }

  async deleteDraft(atcdoc, index){
    if(confirm("Sure, do you want to delete this ATC")){
      // derive collection + docId from the wrapper path (e.g. "temporary_edit_ATC/<id>")
      const docId = atcdoc.id
      const parts = (atcdoc.ref?.path ?? '').split('/')
      parts.pop()                              // drop the doc-id segment
      const collection = parts.join('/')
      // Soft-delete the SERVER copy. Tolerate failure for a local-only draft whose server doc never existed.
      try {
        await updateDoc(doc(this.firestoreATC, atcdoc.ref.path), { delete: true })
      } catch (err) {
        console.log(err)
      }
      // Remove the LOCAL draft + its cached media so the deleted draft can't reappear from the cache,
      // nor be resurrected on the next screen open by flushDirty re-pushing a stale local copy.
      await this.draftService.purgeLocal(collection, docId)
      await this.mediaCache.deleteByDraft(docId)
      this.draftOption.splice(index, 1)
      if(this.draftOption.length == 0){
        this.close()
      }
    }
  }

  // lastupdated can be a Firestore Timestamp (server) OR a JS Date (local cache) — normalise to a Date for display
  draftDate(atc: any): Date | null {
    const v = atc?.data?.()?.["lastupdated"];
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // where this draft came from, for the badge: the unsynced copy on this device vs the synced server copy
  isLocalDraft(atc: any): boolean { return atc?.source === 'local'; }

  close(){
    this.ngZone.run(() => {
      this.dialogRef.close(null);
    });
    // this.dialogRef.close(null)
  }
}
