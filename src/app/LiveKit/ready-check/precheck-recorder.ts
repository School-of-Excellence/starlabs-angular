import { Firestore, doc, setDoc, deleteDoc, serverTimestamp } from '@angular/fire/firestore';

// Plan 2026-11-27-join-ready-check, Phase 4 — "why hasn't the participant joined yet?".
//
// Rules (operator, 2026-11-27):
//   • participants only — hosts/specialists run the same checks but are NEVER written;
//   • only BEFORE the call — the doc is deleted the moment the participant connects;
//   • one doc per participant: openviduroom/<roomId>/precheck/<profileId>;
//   • closing the tab marks the doc "left" (with the time) instead of deleting it, so the
//     specialist can tell "gave up" from "stuck".

export type CheckKey = 'browser' | 'camera' | 'mic' | 'speaker' | 'network' | 'computer';
export type CheckState = 'pending' | 'ok' | 'warn' | 'fail';
export type ServerState = 'checking' | 'starting' | 'ready' | 'failed';

export interface CheckItem {
  key: CheckKey;
  state: CheckState;
  /** Short reason code, e.g. "busy", "site-blocked", "os-blocked", "missing", "silent". */
  code: string;
  /** Plain-language status shown to the person (and to the specialist). */
  message: string;
}

export interface PrecheckSnapshot {
  server: ServerState;
  checks: CheckItem[];
  retries: number;
}

const CHECK_LABEL: Record<CheckKey, string> = {
  browser: 'Browser', camera: 'Camera', mic: 'Microphone', speaker: 'Speaker', network: 'Network', computer: 'Computer',
};
const SERVER_MESSAGE: Record<ServerState, string> = {
  checking: 'Checking the video server',
  starting: 'Waiting for the video server to start',
  ready: 'Ready to join',
  failed: "The video server didn't start in time",
};

export class PrecheckRecorder {
  private static readonly WRITE_DELAY_MS = 1500;   // coalesce bursts of check changes
  private static readonly HEARTBEAT_MS = 60 * 1000; // "last seen" for the specialist
  private readonly ref;
  private pending: PrecheckSnapshot | null = null;
  private lastWritten = '';
  private writeTimer: any = null;
  private heartbeat: any = null;
  private done = false;
  private readonly onPageHide = () => this.markLeft();

  constructor(private firestore: Firestore, roomId: string, private profileId: string, private name: string) {
    this.ref = doc(this.firestore, 'openviduroom', roomId, 'precheck', profileId);
    this.heartbeat = setInterval(() => {
      if (!this.done) setDoc(this.ref, { updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }, PrecheckRecorder.HEARTBEAT_MS);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Record the latest state (coalesced; unchanged states are not re-written). */
  update(snap: PrecheckSnapshot): void {
    if (this.done) return;
    this.pending = snap;
    if (!this.writeTimer) this.writeTimer = setTimeout(() => this.flush(), PrecheckRecorder.WRITE_DELAY_MS);
  }

  /** Joining itself failed after the checks passed (e.g. couldn't reach the video server). */
  connectFailed(reason: string): void {
    if (this.done) return;
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    this.pending = null;
    this.lastWritten = '';
    setDoc(this.ref, { state: 'stuck', step: 'connect', message: `Couldn't connect to the call: ${reason}`, updatedAt: serverTimestamp() }, { merge: true })
      .catch(e => console.log('[precheck] write failed:', e));
  }

  /** Participant connected (or the meeting ended): delete the record. */
  async clear(): Promise<void> {
    this.stopTimers();
    this.done = true;
    try { await deleteDoc(this.ref); } catch (e) { console.log('[precheck] delete failed:', e); }
  }

  /** Page closed / component destroyed before joining: keep the record, marked "left". */
  markLeft(): void {
    if (this.done) return;
    this.stopTimers();
    this.done = true;
    setDoc(this.ref, { state: 'left', leftAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }

  private flush(): void {
    this.writeTimer = null;
    const snap = this.pending;
    this.pending = null;
    if (!snap || this.done) return;

    const blocking = snap.checks.find(c => c.state === 'fail');
    const devicesPending = snap.checks.some(c => c.state === 'pending' && (c.key === 'camera' || c.key === 'mic'));
    const warning = snap.checks.find(c => c.state === 'warn' && c.key !== 'speaker');
    const state = blocking || snap.server === 'failed' ? 'stuck'
      : snap.server === 'ready' && !devicesPending ? 'ready'
      : 'checking';
    const message = blocking ? `${CHECK_LABEL[blocking.key]}: ${blocking.message}`
      : snap.server !== 'ready' ? SERVER_MESSAGE[snap.server]
      : warning ? `${CHECK_LABEL[warning.key]}: ${warning.message}`
      : SERVER_MESSAGE.ready;

    const checks: Record<string, { state: CheckState; code: string; message: string }> = {};
    snap.checks.forEach(c => { checks[c.key] = { state: c.state, code: c.code, message: c.message }; });

    const body = { profileId: this.profileId, name: this.name, state, step: blocking?.key ?? (snap.server !== 'ready' ? 'server' : null), message, server: snap.server, checks, retries: snap.retries };
    const json = JSON.stringify(body);
    if (json === this.lastWritten) return;
    this.lastWritten = json;
    setDoc(this.ref, { ...body, leftAt: null, updatedAt: serverTimestamp() }).catch(e => console.log('[precheck] write failed:', e));
  }

  private stopTimers(): void {
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
