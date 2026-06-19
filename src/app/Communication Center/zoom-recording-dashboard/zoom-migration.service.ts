import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
}
