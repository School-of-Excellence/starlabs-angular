import { Component, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import {
  Firestore, addDoc, collection, deleteDoc, doc, getDocs, orderBy, query,
} from '@angular/fire/firestore';
import { Storage, ref as storageRef, uploadBytesResumable } from '@angular/fire/storage';
import { MediaUrlService } from '../../shared/media-url.service';

/**
 * End-to-end harness for the signed-URL flow. Self-contained and disposable: it owns one
 * Firestore collection and one Storage prefix, both named so they can be deleted wholesale.
 *
 * THE POINT OF THIS SCREEN is that nothing it writes to Firestore can be used to fetch
 * media. The `path` field holds a bare object path — paste it into a browser and nothing
 * happens. Every URL the table renders is minted at view time by getMediaUrls and dies
 * inside 15–30 minutes. That is the whole model, demonstrated on one page, without
 * touching a single production screen or row.
 *
 * Storage prefix:  signed-url-test/<epoch>_<filename>     (allow-listed in media_signed_url.js)
 * Collection:      signed_url_test
 */
interface TestRecord {
  id: string;
  name: string;
  path: string;          // bare object path — NOT a URL, and NOT fetchable
  contentType: string;
  size: number;
  createdAt: number;
  /** Populated at view time by MediaUrlService. Never persisted. */
  resolvedUrl?: string | null;
  resolving?: boolean;
}

const COLLECTION = 'signed_url_test';
const PREFIX = 'signed-url-test';

@Component({
  selector: 'app-signed-url-test',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressBarModule, MatTableModule,
  ],
  templateUrl: './signed-url-test.component.html',
  styleUrl: './signed-url-test.component.css',
})
export class SignedURLTestComponent implements OnInit {

  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private mediaUrl = inject(MediaUrlService);
  private cdr = inject(ChangeDetectorRef);

  // ── Section 1: upload ──────────────────────────────────────────────────
  recordName = '';
  picked: File[] = [];
  uploading = false;
  uploadPct = 0;
  uploadStatus = '';

  // ── Section 2: table ───────────────────────────────────────────────────
  readonly columns = ['media', 'name', 'path', 'type', 'expires', 'actions'];
  records: TestRecord[] = [];
  loading = false;

  /** Live counters off the service, so the mechanism is visible on screen. */
  get stats() { return this.mediaUrl.stats; }

  ngOnInit(): void {
    this.reload();
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.picked = input.files ? Array.from(input.files) : [];
  }

  async upload(): Promise<void> {
    if (!this.recordName.trim() || this.picked.length === 0) {
      this.uploadStatus = 'Give the record a name and pick at least one file.';
      return;
    }
    this.uploading = true;
    this.uploadPct = 0;
    this.uploadStatus = '';

    try {
      let done = 0;
      for (const file of this.picked) {
        // The epoch prefix keeps the object name unique without a lookup, and keeps the
        // original filename readable in the bucket.
        const path = `${PREFIX}/${Date.now()}_${file.name}`;
        const task = uploadBytesResumable(storageRef(this.storage, path), file, {
          contentType: file.type || 'application/octet-stream',
        });

        await new Promise<void>((resolve, reject) => {
          task.on('state_changed',
            snap => {
              const thisFile = snap.bytesTransferred / Math.max(snap.totalBytes, 1);
              this.uploadPct = Math.round(((done + thisFile) / this.picked.length) * 100);
              this.cdr.detectChanges();
            },
            reject,
            () => resolve(),
          );
        });

        // DELIBERATELY no getDownloadURL() here. Calling it would mint a download token on
        // the object — the never-expiring credential this whole exercise exists to stop
        // creating. We persist the path only.
        await addDoc(collection(this.firestore, COLLECTION), {
          name: this.recordName.trim(),
          path,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          createdAt: Date.now(),
        });

        done++;
      }

      this.uploadStatus = `Stored ${this.picked.length} record(s) with a path and no download URL.`;
      this.recordName = '';
      this.picked = [];
      await this.reload();
    } catch (err: any) {
      this.uploadStatus = `Upload failed: ${err?.message ?? err}`;
    } finally {
      this.uploading = false;
      this.uploadPct = 0;
      this.cdr.detectChanges();
    }
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    try {
      const snap = await getDocs(
        query(collection(this.firestore, COLLECTION), orderBy('createdAt', 'desc')),
      );
      this.records = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as TestRecord));
      await this.resolveAll();
    } catch (err: any) {
      this.uploadStatus = `Load failed: ${err?.message ?? err}`;
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Resolve every row. These calls all land in the same tick, so MediaUrlService coalesces
   * them into ONE getMediaUrls request however many rows there are — watch the Network tab.
   */
  private async resolveAll(): Promise<void> {
    this.records.forEach(r => (r.resolving = true));
    await Promise.all(this.records.map(async r => {
      r.resolvedUrl = await this.mediaUrl.resolve(r.path);
      r.resolving = false;
    }));
    // The mutation lands after an await, so force a pass rather than relying on the zone.
    this.cdr.detectChanges();
  }

  /** Drop the cache and resolve again — proves a re-request works without waiting 15 min. */
  async forceRefresh(): Promise<void> {
    this.mediaUrl.clear();
    this.records.forEach(r => (r.resolvedUrl = undefined));
    await this.resolveAll();
  }

  async remove(record: TestRecord): Promise<void> {
    await deleteDoc(doc(this.firestore, COLLECTION, record.id));
    // The Storage object is left in place on purpose: an object with no row pointing at it
    // is exactly the "orphan" case the cleanup phase has to find, so this screen can
    // produce one to test against.
    await this.reload();
  }

  expiresIn(record: TestRecord): string {
    const exp = this.mediaUrl.expiryOf(record.path);
    if (!exp) return record.resolvedUrl ? 'passthrough' : '—';
    const secs = Math.round((exp - Date.now()) / 1000);
    if (secs <= 0) return 'expired';
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  kind(record: TestRecord): 'image' | 'audio' | 'video' | 'other' {
    const t = record.contentType || '';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('video/')) return 'video';
    return 'other';
  }

  prettySize(bytes: number): string {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
