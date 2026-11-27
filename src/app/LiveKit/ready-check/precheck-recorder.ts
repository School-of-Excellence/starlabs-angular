import { Firestore, doc, updateDoc, deleteField, serverTimestamp } from '@angular/fire/firestore';

// Plan 2026-11-27-join-ready-check, Phase 4 — "why hasn't the participant joined yet?".
//
// Rules (operator, 2026-11-27):
//   • participants only — hosts/specialists run the same checks but are NEVER written;
//   • only BEFORE the call — the entry is removed the moment the participant connects;
//   • stored ON THE ROOM DOC itself (operator 2026-11-27: "put in the main collection only"):
//     openviduroom/<roomId>.precheck.<profileId>. A sub-collection was denied by the deployed
//     Firestore rules (they only cover openviduroom/{doc}); the room doc is already writable;
//   • closing the tab marks the entry "left" (with the time) instead of removing it, so the
//     specialist can tell "gave up" from "stuck".

export type CheckKey = 'browser' | 'camera' | 'mic' | 'speaker' | 'network' | 'computer';
export type CheckState = 'pending' | 'ok' | 'warn' | 'fail';
export type ServerState = 'checking' | 'starting' | 'ready' | 'failed';

/** States written after the Ready check (plan 2026-11-27-openvidu-call-resilience). */
export type PrecheckPhase = 'waiting' | 'reconnecting' | 'disconnected';

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
  /** Field path of this participant's entry on the room doc. */
  private readonly key: string;
  private pending: PrecheckSnapshot | null = null;
  private lastWritten = '';
  private writeTimer: any = null;
  private heartbeat: any = null;
  private done = false;
  /** Set once the participant has moved past the Ready check (waiting room / reconnecting):
   *  later check changes no longer overwrite that state. */
  private phase: PrecheckPhase | null = null;
  private readonly onPageHide = () => this.markLeft();

  constructor(private firestore: Firestore, roomId: string, private profileId: string, private name: string) {
    this.ref = doc(this.firestore, 'openviduroom', roomId);
    this.key = `precheck.${profileId}`;
    this.heartbeat = setInterval(() => {
      if (!this.done && this.lastWritten) this.write({ [`${this.key}.updatedAt`]: serverTimestamp() });
    }, PrecheckRecorder.HEARTBEAT_MS);
    window.addEventListener('pagehide', this.onPageHide);
  }

  /** Field-path update on the room doc (only touches this participant's entry). */
  private write(fields: Record<string, any>): Promise<void> {
    return updateDoc(this.ref, fields).catch(e => console.log('[precheck] write failed:', e));
  }

  /** Record the latest state (coalesced; unchanged states are not re-written). */
  update(snap: PrecheckSnapshot): void {
    if (this.done || this.phase) return;
    this.pending = snap;
    if (!this.writeTimer) this.writeTimer = setTimeout(() => this.flush(), PrecheckRecorder.WRITE_DELAY_MS);
  }

  /** Joining itself failed after the checks passed (e.g. couldn't reach the video server). */
  connectFailed(reason: string): void {
    if (this.done) return;
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    this.pending = null;
    this.lastWritten = 'connect-failed';
    void this.write({
      [`${this.key}.state`]: 'stuck',
      [`${this.key}.step`]: 'connect',
      [`${this.key}.message`]: `Couldn't connect to the call: ${reason}`,
      [`${this.key}.updatedAt`]: serverTimestamp(),
    });
  }

  /** Past the Ready check (plan 2026-11-27-openvidu-call-resilience): in the waiting room,
   *  reconnecting after a drop, or disconnected (rejoin gave up). Replaces the whole entry. */
  setPhase(state: PrecheckPhase, message: string): void {
    if (this.done) return;
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    this.pending = null;
    if (this.phase === state) return;
    this.phase = state;
    this.lastWritten = `phase:${state}`;
    const extra = state === 'reconnecting' ? { reconnectingSince: serverTimestamp() } : {};
    void this.write({ [this.key]: {
      profileId: this.profileId, name: this.name, state, step: state, message,
      leftAt: null, ...extra, updatedAt: serverTimestamp(),
    } });
  }

  /** Participant connected (or the meeting ended): remove this participant's entry. */
  async clear(): Promise<void> {
    this.stopTimers();
    this.done = true;
    await this.write({ [this.key]: deleteField() });
  }

  /** Page closed / component destroyed before joining: keep the entry, marked "left". */
  markLeft(): void {
    if (this.done) return;
    this.stopTimers();
    this.done = true;
    if (!this.lastWritten) return;   // nothing recorded yet → nothing to mark
    void this.write({
      [`${this.key}.state`]: 'left',
      [`${this.key}.leftAt`]: serverTimestamp(),
      [`${this.key}.updatedAt`]: serverTimestamp(),
    });
  }

  private flush(): void {
    this.writeTimer = null;
    const snap = this.pending;
    this.pending = null;
    if (!snap || this.done) return;

    // Join needs camera + mic + speaker ticked (operator 2026-11-27), so any of them not "ok" is
    // what the participant is still on.
    const blocking = snap.checks.find(c => c.state === 'fail');
    const notTicked = snap.checks.find(c => (c.key === 'camera' || c.key === 'mic' || c.key === 'speaker') && c.state !== 'ok');
    const warning = snap.checks.find(c => c.state === 'warn');
    const state = blocking || snap.server === 'failed' ? 'stuck'
      : snap.server === 'ready' && !notTicked ? 'ready'
      : 'checking';
    const message = blocking ? `${CHECK_LABEL[blocking.key]}: ${blocking.message}`
      : notTicked ? `${CHECK_LABEL[notTicked.key]}: ${notTicked.message}`
      : snap.server !== 'ready' ? SERVER_MESSAGE[snap.server]
      : warning ? `${CHECK_LABEL[warning.key]}: ${warning.message}`
      : SERVER_MESSAGE.ready;

    const checks: Record<string, { state: CheckState; code: string; message: string }> = {};
    snap.checks.forEach(c => { checks[c.key] = { state: c.state, code: c.code, message: c.message }; });

    const body = { profileId: this.profileId, name: this.name, state, step: blocking?.key ?? (snap.server !== 'ready' ? 'server' : null), message, server: snap.server, checks, retries: snap.retries };
    const json = JSON.stringify(body);
    if (json === this.lastWritten) return;
    this.lastWritten = json;
    // Replaces this participant's whole entry; other participants' entries are untouched.
    void this.write({ [this.key]: { ...body, leftAt: null, updatedAt: serverTimestamp() } });
  }

  private stopTimers(): void {
    if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; }
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
