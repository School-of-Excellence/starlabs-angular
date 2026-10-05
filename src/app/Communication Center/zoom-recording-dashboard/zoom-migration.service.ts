import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { getAuth } from '@angular/fire/auth';
import { environment } from '../../../environments/environment';

// A single recording as returned by the migration server's
// GET /api/zoom/recordings. `_raw` is the verbatim Zoom meeting object, replayed
// to /api/zoom/migrate so the server processes it exactly as a Zoom webhook.
export interface ZoomRecording {
  uuid: string;
  meetingId: number;
  topic: string;
  hostEmail: string;
  startTime: string;
  duration: number;
  totalFiles: number;
  totalSize: number;
  fileTypes: string[];
  _raw: any;
}

// Result of checking one backup against Dropbox (and Zoom, if still there).
export interface VerificationResult {
  ok: boolean;
  checkedAt: string;
  folderExists: boolean;
  zoomPresent: boolean | null;
  files: { [key: string]: { ok: boolean; expected: number; dropboxSize?: number; dropboxPath?: string; reason?: string; fileName?: string; fileType?: string } };
  zoomMissing: Array<{ zoomFileId: string; fileType: string; fileSize: number }>;
}

export interface VerifyBatchResult {
  docId: string;
  topic: string;
  result: 'verified' | 'repairing' | 'failed' | 'skipped' | 'duplicate_removed' | 'error';
  problems: string[];
}

export interface MigrateResponse {
  success: boolean;
  dispatch: 'cloud-tasks' | 'inline';
  meetingId: number;
  meetinguid: string;
  totalFiles: number;
}

@Injectable({ providedIn: 'root' })
export class ZoomMigrationService {
  private readonly base = (environment as any).zoomMigrationApiUrl?.replace(/\/$/, '') || '';

  constructor(private http: HttpClient) {}

  // List the account's cloud recordings for a date range (YYYY-MM-DD).
  async listRecordings(from: string, to: string): Promise<ZoomRecording[]> {
    const res: any = await firstValueFrom(
      this.http.get(`${this.base}/api/zoom/recordings`, { params: { from, to } })
    );
    return res?.recordings ?? [];
  }

  // Trigger migration for one recording — sends the same payload shape Zoom
  // sends to the webhook. The server starts processing and writes live status
  // to Firestore, which the dashboard already streams.
  async migrate(rec: ZoomRecording): Promise<MigrateResponse> {
    return firstValueFrom(
      this.http.post<MigrateResponse>(`${this.base}/api/zoom/migrate`, { meeting: rec })
    );
  }

  // Check a backup doc's files against Dropbox. The server stores the result
  // on the doc (status flips to 'verify_failed' on a mismatch).
  async verify(docId: string): Promise<{ success: boolean; status: string; verification: VerificationResult }> {
    return firstValueFrom(
      this.http.post<any>(`${this.base}/api/zoom/verify`, { docId }, { headers: await this.authHeaders() })
    );
  }

  // Verify many backups in one call (max 50). The server lists Zoom once for
  // the batch and starts repairs for anything missing.
  async verifyBatch(docIds: string[]): Promise<{ success: boolean; results: VerifyBatchResult[] }> {
    return firstValueFrom(
      this.http.post<any>(`${this.base}/api/zoom/verify-batch`, { docIds }, { headers: await this.authHeaders() })
    );
  }

  // Restart the backup of one record (stalled / failed / partial row).
  async retry(docId: string): Promise<{ success: boolean; status?: string; keptDocId?: string; dispatch?: string }> {
    return firstValueFrom(
      this.http.post<any>(`${this.base}/api/zoom/retry`, { docId }, { headers: await this.authHeaders() })
    );
  }

  // Move ONE recording to Zoom's trash. The server re-verifies first and
  // refuses unless every file is safely in Dropbox.
  async trash(docId: string): Promise<{ success: boolean; verification: VerificationResult }> {
    return firstValueFrom(
      this.http.post<any>(`${this.base}/api/zoom/trash`, { docId }, { headers: await this.authHeaders() })
    );
  }

  // Verify/trash require the signed-in user's Firebase ID token.
  private async authHeaders(): Promise<{ [h: string]: string }> {
    let token: string | undefined;
    try {
      token = await getAuth().currentUser?.getIdToken();
    } catch {
      token = undefined; // no Firebase app / signed out → server answers 401
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  // A link that opens a backup folder in Dropbox. The server resolves the real
  // team-space shared link and 302-redirects — a /home/<path> URL built on the
  // client 404s because the files live in the team space. Empty when the API
  // base isn't configured (so callers can hide the link).
  folderOpenUrl(folderPath: string): string {
    if (!this.base) return '';
    return `${this.base}/api/dropbox/open?path=${encodeURIComponent(folderPath)}`;
  }
}
