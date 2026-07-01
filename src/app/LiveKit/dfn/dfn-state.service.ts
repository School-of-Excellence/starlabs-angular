import { Injectable, signal } from '@angular/core';
import { Room, RoomEvent, RemoteParticipant } from 'livekit-client';

/** Per-participant DeepFilterNet3 settings shared over LiveKit data messages. */
export type DfnInfo = { dfn: boolean; atten: number; norm: number };

/**
 * Angular port of the videoconference meet `DfnState.tsx`. Shares each
 * participant's DFN settings (on/off, attenuation, normalization) with everyone
 * via reliable LiveKit data messages, so a listener can see — on each person's
 * tile — what levels that person is sending at.
 *
 * Message shape (reliable DataReceived): { type: 'dfn', dfn, atten, norm }.
 */
@Injectable({ providedIn: 'root' })
export class DfnStateService {
  private room: Room | null = null;

  /** identity -> DfnInfo. A signal so tile badges re-render on update. */
  readonly map = signal<Record<string, DfnInfo>>({});

  private onData = (payload: Uint8Array, participant?: RemoteParticipant) => {
    try {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg && msg.type === 'dfn' && participant) {
        this.update(participant.identity, { dfn: !!msg.dfn, atten: Number(msg.atten), norm: Number(msg.norm) });
      }
    } catch {}
  };

  start(room: Room): void {
    this.stop();
    this.room = room;
    room.on(RoomEvent.DataReceived, this.onData);
  }

  stop(): void {
    this.room?.off(RoomEvent.DataReceived, this.onData);
    this.room = null;
    this.map.set({});
  }

  update(id: string, info: DfnInfo): void {
    this.map.update((m) => ({ ...m, [id]: info }));
  }

  infoFor(identity?: string): DfnInfo | undefined {
    return this.map()[identity ?? ''];
  }
}
